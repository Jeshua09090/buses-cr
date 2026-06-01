-- Promotes Guadalupe, Cartago to its own planner hub and adds a rotated
-- 0332 loop pattern so the direct planner can traverse Plaza Iglesias -> Guadalupe.

insert into public.planner_hubs (
  hub_key,
  hub_name,
  hub_type,
  lat,
  lng,
  radius_m,
  planner_radius_override_m,
  priority,
  activo,
  metadata
)
values (
  'guadalupe_cartago',
  'Guadalupe Cartago',
  'district',
  9.8660225,
  -83.9244086,
  280,
  700,
  8,
  true,
  jsonb_build_object(
    'seed_version', 'prueba_guadalupe_cartago_hub_rotated_loop_v1',
    'notes', 'Separates Guadalupe from the broad Cartago Centro hub so local 0332 candidates can be evaluated as their own district.'
  )
)
on conflict (hub_key) do update
set
  hub_name = excluded.hub_name,
  hub_type = excluded.hub_type,
  lat = excluded.lat,
  lng = excluded.lng,
  radius_m = excluded.radius_m,
  planner_radius_override_m = excluded.planner_radius_override_m,
  priority = excluded.priority,
  activo = excluded.activo,
  metadata = public.planner_hubs.metadata || excluded.metadata,
  updated_at = timezone('utc', now());

with hub as (
  select id
  from public.planner_hubs
  where hub_key = 'guadalupe_cartago'
),
stops(parada_id, priority) as (
  values
    (1611::bigint, 1),
    (-13435::bigint, 10),
    (-12914::bigint, 20),
    (-13391::bigint, 30),
    (-13140::bigint, 40),
    (852::bigint, 80)
)
insert into public.planner_hub_stops (
  hub_id,
  parada_id,
  role,
  priority,
  activo,
  metadata
)
select
  hub.id,
  stops.parada_id,
  'both',
  stops.priority,
  true,
  jsonb_build_object('seed_version', 'prueba_guadalupe_cartago_hub_rotated_loop_v1')
from hub
join stops on true
join public.paradas p on p.id = stops.parada_id
on conflict (hub_id, parada_id, role) do update
set
  priority = excluded.priority,
  activo = excluded.activo,
  metadata = public.planner_hub_stops.metadata || excluded.metadata,
  updated_at = timezone('utc', now());

with source_pattern as (
  select *
  from public.route_patterns
  where id = 803
    and ruta_id = 5332
),
upserted as (
  insert into public.route_patterns (
    ruta_id,
    sentido,
    pattern_code,
    nombre,
    headsign,
    stop_signature,
    parada_inicial_id,
    parada_final_id,
    parada_count,
    distancia_total_m,
    activo,
    fuente,
    categoria_operativa,
    clasificacion_fuente,
    clasificacion_confianza,
    metadata
  )
  select
    ruta_id,
    sentido,
    '0332-lima-plaza-iglesias-guadalupe-rotated-v1',
    coalesce(nombre, 'Cartago - Guadalupe por La Lima') || ' (Plaza Iglesias -> Guadalupe)',
    'Guadalupe',
    stop_signature || ':plaza-iglesias-rotated-v1',
    852,
    1611,
    parada_count,
    distancia_total_m,
    true,
    'manual',
    categoria_operativa,
    'manual',
    greatest(clasificacion_confianza, 0.92),
    metadata || jsonb_build_object(
      'seed_version', 'prueba_guadalupe_cartago_hub_rotated_loop_v1',
      'source_pattern_id', id,
      'rotation_anchor_parada_id', 852,
      'rotation_reason', 'Allow direct planner to evaluate the circular 0332 segment from Cartago centro / Plaza Iglesias toward Guadalupe.'
    )
  from source_pattern
  on conflict (ruta_id, sentido, pattern_code) do update
  set
    nombre = excluded.nombre,
    headsign = excluded.headsign,
    stop_signature = excluded.stop_signature,
    parada_inicial_id = excluded.parada_inicial_id,
    parada_final_id = excluded.parada_final_id,
    activo = excluded.activo,
    fuente = excluded.fuente,
    categoria_operativa = excluded.categoria_operativa,
    clasificacion_fuente = excluded.clasificacion_fuente,
    clasificacion_confianza = excluded.clasificacion_confianza,
    metadata = public.route_patterns.metadata || excluded.metadata,
    updated_at = timezone('utc', now())
  returning id
),
target_pattern as (
  select id
  from upserted
  union
  select id
  from public.route_patterns
  where ruta_id = 5332
    and sentido = 'loop'
    and pattern_code = '0332-lima-plaza-iglesias-guadalupe-rotated-v1'
),
deleted_stops as (
  delete from public.route_pattern_stops rps
  using target_pattern tp
  where rps.pattern_id = tp.id
  returning rps.id
),
anchor as (
  select min(stop_sequence) as anchor_sequence
  from public.route_pattern_stops
  where pattern_id = 803
    and parada_id = 852
),
max_sequence as (
  select max(stop_sequence) as max_sequence
  from public.route_pattern_stops
  where pattern_id = 803
),
rotated as (
  select
    rps.*,
    case
      when rps.stop_sequence >= anchor.anchor_sequence
        then rps.stop_sequence - anchor.anchor_sequence + 1
      else rps.stop_sequence + max_sequence.max_sequence - anchor.anchor_sequence + 1
    end as rotated_sequence
  from public.route_pattern_stops rps
  cross join anchor
  cross join max_sequence
  where rps.pattern_id = 803
),
without_consecutive_duplicates as (
  select
    rotated.*,
    lag(parada_id) over (order by rotated_sequence) as previous_parada_id
  from rotated
),
next_stops as (
  select
    row_number() over (order by rotated_sequence)::integer as stop_sequence,
    parada_id,
    es_subida,
    es_bajada,
    pickup_type,
    drop_off_type,
    distancia_acumulada_m,
    tiempo_estimado_desde_inicio_min
  from without_consecutive_duplicates
  where previous_parada_id is distinct from parada_id
)
insert into public.route_pattern_stops (
  pattern_id,
  parada_id,
  stop_sequence,
  es_subida,
  es_bajada,
  pickup_type,
  drop_off_type,
  distancia_acumulada_m,
  tiempo_estimado_desde_inicio_min
)
select
  target_pattern.id,
  next_stops.parada_id,
  next_stops.stop_sequence,
  next_stops.es_subida,
  next_stops.es_bajada,
  next_stops.pickup_type,
  next_stops.drop_off_type,
  next_stops.distancia_acumulada_m,
  next_stops.tiempo_estimado_desde_inicio_min
from target_pattern
join next_stops on true;

with target_pattern as (
  select id
  from public.route_patterns
  where ruta_id = 5332
    and sentido = 'loop'
    and pattern_code = '0332-lima-plaza-iglesias-guadalupe-rotated-v1'
),
deleted_windows as (
  delete from public.service_windows sw
  using target_pattern tp
  where sw.pattern_id = tp.id
  returning sw.id
)
insert into public.service_windows (
  pattern_id,
  dia_tipo,
  hora_inicio,
  hora_fin,
  frecuencia_promedio_min,
  activo,
  source_ruta_frecuencia_id,
  notas,
  metadata
)
select
  target_pattern.id,
  sw.dia_tipo,
  sw.hora_inicio,
  sw.hora_fin,
  sw.frecuencia_promedio_min,
  true,
  sw.source_ruta_frecuencia_id,
  'Ventana sintetica rotada para Prueba',
  sw.metadata || jsonb_build_object(
    'seed_version', 'prueba_guadalupe_cartago_hub_rotated_loop_v1',
    'source_pattern_id', 803
  )
from target_pattern
join public.service_windows sw on sw.pattern_id = 803;

with group_upsert as (
  insert into public.planner_service_groups (
    group_key,
    group_name,
    group_type,
    description,
    priority,
    activo,
    metadata
  )
  values (
    'cartago_guadalupe_local',
    'Cartago Centro / Guadalupe local',
    'preferred_alternatives',
    'Local Guadalupe service group for separating 0332 from broad Cartago center candidates.',
    6,
    true,
    jsonb_build_object('seed_version', 'prueba_guadalupe_cartago_hub_rotated_loop_v1')
  )
  on conflict (group_key) do update
  set
    group_name = excluded.group_name,
    group_type = excluded.group_type,
    description = excluded.description,
    priority = excluded.priority,
    activo = excluded.activo,
    metadata = public.planner_service_groups.metadata || excluded.metadata,
    updated_at = timezone('utc', now())
  returning id
),
service_group as (
  select id from group_upsert
  union
  select id from public.planner_service_groups where group_key = 'cartago_guadalupe_local'
),
hub_links as (
  select h.id as hub_id, sg.id as service_group_id, v.role, v.priority
  from service_group sg
  join public.planner_hubs h on h.hub_key in ('cartago_centro', 'guadalupe_cartago')
  join (
    values
      ('cartago_centro', 'origin', 8),
      ('cartago_centro', 'destination', 8),
      ('guadalupe_cartago', 'origin', 6),
      ('guadalupe_cartago', 'destination', 6)
  ) as v(hub_key, role, priority) on v.hub_key = h.hub_key
)
insert into public.planner_hub_service_groups (
  hub_id,
  service_group_id,
  role,
  priority,
  activo,
  metadata
)
select
  hub_id,
  service_group_id,
  role,
  priority,
  true,
  jsonb_build_object('seed_version', 'prueba_guadalupe_cartago_hub_rotated_loop_v1')
from hub_links
on conflict (hub_id, service_group_id, role) do update
set
  priority = excluded.priority,
  activo = excluded.activo,
  metadata = public.planner_hub_service_groups.metadata || excluded.metadata,
  updated_at = timezone('utc', now());

with service_group as (
  select id
  from public.planner_service_groups
  where group_key = 'cartago_guadalupe_local'
),
members(product_route_id, route_code, member_label, member_priority, directness_rank) as (
  values
    (5332::integer, '332', 'Guadalupe por La Lima', 4, 4),
    (5333::integer, '332', 'Guadalupe por La Joya', 12, 14),
    (4695::integer, '300', 'Cartago-ICE cercano a Guadalupe', 45, 45)
)
insert into public.planner_service_group_members (
  service_group_id,
  product_route_id,
  route_code,
  member_label,
  service_role,
  member_priority,
  directness_rank,
  activo,
  metadata
)
select
  service_group.id,
  members.product_route_id,
  members.route_code,
  members.member_label,
  'both',
  members.member_priority,
  members.directness_rank,
  true,
  jsonb_build_object('seed_version', 'prueba_guadalupe_cartago_hub_rotated_loop_v1')
from service_group
join members on true
where not exists (
  select 1
  from public.planner_service_group_members existing
  where existing.service_group_id = service_group.id
    and existing.product_route_id = members.product_route_id
    and existing.route_code = members.route_code
    and existing.member_label = members.member_label
);

with rotated_patterns as (
  select rp.id
  from public.route_patterns rp
  where rp.pattern_code = '0332-lima-plaza-iglesias-guadalupe-rotated-v1'
),
pattern_counts as (
  select pattern_id, count(*)::integer as stop_count
  from public.route_pattern_stops
  where pattern_id in (select id from rotated_patterns)
  group by pattern_id
)
update public.route_patterns rp
set
  parada_count = pc.stop_count,
  updated_at = timezone('utc', now())
from pattern_counts pc
where rp.id = pc.pattern_id;
