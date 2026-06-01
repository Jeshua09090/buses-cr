set search_path = public, extensions;

-- The official inferred stop order for 0336-A starts in Paraiso and ends in
-- Cartago. Keep 4361 in that order and reverse 4360 so the planner can serve
-- Cartago -> Paraiso as a forward sequence.

do $do$
declare
  function_sql text;
begin
  select pg_get_functiondef(p.oid)
  into function_sql
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'ctp_preview_route_variant_map';

  if function_sql is null then
    raise exception 'public.ctp_preview_route_variant_map() is required before fixing Cartago-Paraiso direction';
  end if;

  function_sql := replace(
    function_sql,
    $needle$      (4360, '336', '0336-A', '0336-A-1', 'route_stops', 10, false),
      (4361, '336', '0336-A', '0336-A-2', 'route_stops', 10, false)$needle$,
    $replacement$      (4360, '336', '0336-A', '0336-A-1', 'route_stops', 10, true),
      (4361, '336', '0336-A', '0336-A-2', 'route_stops', 10, false)$replacement$
  );

  execute function_sql;
end $do$;

with variant_map as (
  select *
  from (
    values
      (4360::bigint, 'ida'::text, '0336-A-1'::text, 'CARTAGO - PARAISO / IDA'::text, 20::integer, true),
      (4361::bigint, 'vuelta'::text, '0336-A-2'::text, 'PARAISO - CARTAGO / VUELTA'::text, 20::integer, false)
  ) as variants(ruta_id, sentido, variant_code, pattern_name, frecuencia_base_min, reverse_stop_order)
),
raw_stops as (
  select
    vm.ruta_id,
    vm.sentido,
    vm.variant_code,
    concat('preview-', vm.sentido, '-', vm.ruta_id::text, '-cartago-paraiso-v3') as pattern_code,
    vm.pattern_name,
    vm.frecuencia_base_min,
    vm.reverse_stop_order,
    rs.stop_source_id,
    rs.suggested_stop_sequence::integer as source_stop_sequence,
    s.source_identifier,
    coalesce(nullif(s.description_raw, ''), s.source_identifier) as stop_name,
    s.lat::double precision as lat,
    s.lng::double precision as lng,
    s.geo as stop_geo,
    (-200000000 - s.source_id)::integer as synthetic_parada_id
  from variant_map vm
  join public.staging_ctp_route_stops_inferred rs
    on rs.variant_code = vm.variant_code
  join public.staging_ctp_official_stops s
    on s.source_id = rs.stop_source_id
  where rs.suggested_stop_sequence is not null
),
ordered_stops as (
  select
    rs.*,
    row_number() over (
      partition by rs.ruta_id, rs.sentido
      order by
        case when rs.reverse_stop_order then rs.source_stop_sequence end desc nulls last,
        case when not rs.reverse_stop_order then rs.source_stop_sequence end asc nulls last,
        rs.stop_source_id asc
    )::integer as stop_sequence
  from raw_stops rs
),
distinct_synthetic_stops as (
  select distinct on (synthetic_parada_id)
    synthetic_parada_id,
    lat,
    lng,
    stop_name,
    stop_source_id,
    source_identifier,
    variant_code
  from ordered_stops
  order by synthetic_parada_id, stop_sequence
)
insert into public.paradas (
  id,
  lat,
  lng,
  nombre,
  activo,
  fuente,
  metadata,
  created_at,
  updated_at
)
select
  dss.synthetic_parada_id,
  dss.lat::numeric,
  dss.lng::numeric,
  dss.stop_name,
  true,
  'importacion',
  jsonb_build_object(
    'seed_source', 'preview_cartago_paraiso_direction_fix_v3',
    'seed_kind', 'official_inferred_stop',
    'stop_source_id', dss.stop_source_id,
    'stop_source_identifier', dss.source_identifier,
    'variant_code', dss.variant_code
  ),
  timezone('utc', now()),
  timezone('utc', now())
from distinct_synthetic_stops dss
on conflict (id) do update
set lat = excluded.lat,
    lng = excluded.lng,
    nombre = excluded.nombre,
    activo = true,
    fuente = excluded.fuente,
    metadata = coalesce(public.paradas.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = timezone('utc', now());

delete from public.route_patterns rp
where rp.ruta_id in (4360, 4361)
  and rp.fuente = 'importacion'
  and (
    coalesce(rp.metadata ->> 'seed_source', '') in (
      'preview_cartago_paraiso_modern_v1',
      'preview_cartago_paraiso_modern_v2',
      'preview_cartago_paraiso_direction_fix_v3'
    )
    or rp.pattern_code like 'preview-%-cartago-paraiso-v%'
  );

with variant_map as (
  select *
  from (
    values
      (4360::bigint, 'ida'::text, '0336-A-1'::text, 'CARTAGO - PARAISO / IDA'::text, 20::integer, true),
      (4361::bigint, 'vuelta'::text, '0336-A-2'::text, 'PARAISO - CARTAGO / VUELTA'::text, 20::integer, false)
  ) as variants(ruta_id, sentido, variant_code, pattern_name, frecuencia_base_min, reverse_stop_order)
),
raw_stops as (
  select
    vm.ruta_id,
    vm.sentido,
    vm.variant_code,
    concat('preview-', vm.sentido, '-', vm.ruta_id::text, '-cartago-paraiso-v3') as pattern_code,
    vm.pattern_name,
    vm.frecuencia_base_min,
    vm.reverse_stop_order,
    rs.stop_source_id,
    rs.suggested_stop_sequence::integer as source_stop_sequence,
    s.source_identifier,
    coalesce(nullif(s.description_raw, ''), s.source_identifier) as stop_name,
    s.lat::double precision as lat,
    s.lng::double precision as lng,
    s.geo as stop_geo,
    (-200000000 - s.source_id)::integer as synthetic_parada_id
  from variant_map vm
  join public.staging_ctp_route_stops_inferred rs
    on rs.variant_code = vm.variant_code
  join public.staging_ctp_official_stops s
    on s.source_id = rs.stop_source_id
  where rs.suggested_stop_sequence is not null
),
ordered_stops as (
  select
    rs.*,
    row_number() over (
      partition by rs.ruta_id, rs.sentido
      order by
        case when rs.reverse_stop_order then rs.source_stop_sequence end desc nulls last,
        case when not rs.reverse_stop_order then rs.source_stop_sequence end asc nulls last,
        rs.stop_source_id asc
    )::integer as stop_sequence
  from raw_stops rs
),
mapped_stops as (
  select
    os.*,
    coalesce(nearby.id, os.synthetic_parada_id)::bigint as parada_id,
    nearby.id as matched_runtime_parada_id
  from ordered_stops os
  left join lateral (
    select p.id
    from public.paradas p
    where p.activo = true
      and p.id > 0
      and st_dwithin(p.geo, os.stop_geo, 90)
    order by st_distance(p.geo, os.stop_geo) asc, p.id asc
    limit 1
  ) nearby on true
),
segmented as (
  select
    ms.*,
    lag(ms.stop_geo) over (partition by ms.ruta_id, ms.sentido order by ms.stop_sequence) as prev_geo
  from mapped_stops ms
),
measured as (
  select
    s.*,
    coalesce(st_distance(s.prev_geo, s.stop_geo)::integer, 0) as segment_distance_m
  from segmented s
),
pattern_rows as (
  select
    m.ruta_id,
    m.sentido,
    m.pattern_code,
    m.pattern_name,
    'local'::text as categoria_operativa,
    0.860::numeric as clasificacion_confianza,
    m.frecuencia_base_min,
    md5(
      string_agg(
        concat_ws(':', m.parada_id::text, m.stop_sequence::text),
        '|'
        order by m.stop_sequence
      )
    ) as stop_signature,
    (array_agg(m.parada_id order by m.stop_sequence asc))[1] as parada_inicial_id,
    (array_agg(m.parada_id order by m.stop_sequence desc))[1] as parada_final_id,
    (array_agg(m.stop_name order by m.stop_sequence desc))[1] as headsign,
    count(*)::integer as parada_count,
    sum(m.segment_distance_m)::integer as distancia_total_m,
    jsonb_build_object(
      'seed_source', 'preview_cartago_paraiso_direction_fix_v3',
      'seed_kind', 'route_pattern',
      'variant_code', m.variant_code,
      'reverse_stop_order', bool_or(m.reverse_stop_order),
      'official_inferred_stop_count', count(*)::integer,
      'matched_runtime_stop_count', count(*) filter (where m.matched_runtime_parada_id is not null),
      'official_stop_source_ids', jsonb_agg(m.stop_source_id order by m.stop_sequence),
      'matched_runtime_stop_ids', jsonb_agg(m.matched_runtime_parada_id order by m.stop_sequence)
    ) as metadata
  from measured m
  group by
    m.ruta_id,
    m.sentido,
    m.pattern_code,
    m.pattern_name,
    m.frecuencia_base_min,
    m.variant_code
),
inserted_patterns as (
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
    pr.ruta_id,
    pr.sentido,
    pr.pattern_code,
    pr.pattern_name,
    pr.headsign,
    pr.stop_signature,
    pr.parada_inicial_id,
    pr.parada_final_id,
    pr.parada_count,
    pr.distancia_total_m,
    true,
    'importacion',
    pr.categoria_operativa,
    'importacion',
    pr.clasificacion_confianza,
    pr.metadata
  from pattern_rows pr
  returning id, ruta_id, sentido, pattern_code
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
  ip.id as pattern_id,
  m.parada_id,
  m.stop_sequence,
  true,
  true,
  0,
  0,
  sum(m.segment_distance_m) over (
    partition by m.ruta_id, m.sentido
    order by m.stop_sequence
    rows between unbounded preceding and current row
  )::integer as distancia_acumulada_m,
  greatest(
    0,
    round(
      (
        sum(m.segment_distance_m) over (
          partition by m.ruta_id, m.sentido
          order by m.stop_sequence
          rows between unbounded preceding and current row
        )
      )::numeric / 380.0
    )
  )::integer as tiempo_estimado_desde_inicio_min
from measured m
join inserted_patterns ip
  on ip.ruta_id = m.ruta_id
 and ip.sentido = m.sentido
 and ip.pattern_code = m.pattern_code;

with pattern_targets as (
  select
    rp.id as pattern_id,
    sr.frecuencia_base_min,
    sr.ruta_id
  from public.route_patterns rp
  join (
    values
      (4360::bigint, 20::integer),
      (4361::bigint, 20::integer)
  ) as sr(ruta_id, frecuencia_base_min)
    on sr.ruta_id = rp.ruta_id
  where rp.fuente = 'importacion'
    and coalesce(rp.metadata ->> 'seed_source', '') = 'preview_cartago_paraiso_direction_fix_v3'
)
insert into public.service_windows (
  pattern_id,
  dia_tipo,
  hora_inicio,
  hora_fin,
  frecuencia_promedio_min,
  activo,
  notas,
  metadata
)
select
  pt.pattern_id,
  sw.dia_tipo,
  sw.hora_inicio,
  sw.hora_fin,
  sw.frecuencia_promedio_min,
  true,
  'Ventana sintetica para Prueba',
  jsonb_build_object(
    'seed_source', 'preview_cartago_paraiso_direction_fix_v3',
    'seed_kind', 'service_window',
    'seed_ruta_id', pt.ruta_id
  )
from pattern_targets pt
join lateral (
  values
    ('habil'::text, '05:00'::time, '09:00'::time, greatest(18, pt.frecuencia_base_min)),
    ('habil'::text, '09:00'::time, '16:00'::time, greatest(22, pt.frecuencia_base_min + 8)),
    ('habil'::text, '16:00'::time, '20:30'::time, greatest(18, pt.frecuencia_base_min)),
    ('sabado'::text, '06:00'::time, '20:00'::time, greatest(24, pt.frecuencia_base_min + 8)),
    ('domingo'::text, '07:00'::time, '19:00'::time, greatest(30, pt.frecuencia_base_min + 12)),
    ('feriado'::text, '07:00'::time, '19:00'::time, greatest(30, pt.frecuencia_base_min + 12))
) as sw(dia_tipo, hora_inicio, hora_fin, frecuencia_promedio_min)
  on true;
