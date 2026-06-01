set search_path = public, extensions;

-- Rebuild the Tejar -> San Jose runtime pattern from the official 0300-Q-1
-- stop order. The previous preview seed reversed this variant, so Taras -> Rio
-- Loro could only see the bus going away toward Cartago/Paseo Metropoli.

with variant_source as (
  select
    rv.source_id as variant_source_id,
    rv.variant_code,
    rv.description_raw
  from public.staging_ctp_official_route_variants rv
  where rv.variant_code = '0300-Q-1'
  limit 1
),
preview_stops as (
  select
    (-1 * s.source_id)::integer as preview_parada_id,
    coalesce(s.description_raw, 'Parada oficial CTP') as preview_stop_name,
    s.lat::double precision as lat,
    s.lng::double precision as lng,
    i.suggested_stop_sequence::integer as stop_sequence
  from variant_source vs
  join public.staging_ctp_route_stops_inferred i
    on i.variant_source_id = vs.variant_source_id
  join public.staging_ctp_official_stops s
    on s.source_id = i.stop_source_id
),
distinct_preview_stops as (
  select distinct on (preview_parada_id)
    preview_parada_id,
    lat,
    lng,
    preview_stop_name
  from preview_stops
  order by preview_parada_id, stop_sequence
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
  dps.preview_parada_id,
  dps.lat::numeric,
  dps.lng::numeric,
  dps.preview_stop_name,
  true,
  'importacion',
  jsonb_build_object(
    'seed_source', 'preview_route300_rio_loro_direction_v1',
    'seed_kind', 'preview_stop',
    'preview_stop_id', dps.preview_parada_id
  ),
  timezone('utc', now()),
  timezone('utc', now())
from distinct_preview_stops dps
on conflict (id) do update
set lat = excluded.lat,
    lng = excluded.lng,
    nombre = excluded.nombre,
    activo = true,
    fuente = excluded.fuente,
    metadata = coalesce(public.paradas.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = timezone('utc', now());

delete from public.route_patterns rp
where rp.ruta_id = 4689
  and rp.fuente = 'importacion'
  and coalesce(rp.metadata ->> 'seed_source', '') in (
    'preview_tejar_modern_v1',
    'preview_route300_rio_loro_direction_v1'
  );

with seed_route as (
  select
    4689::bigint as ruta_id,
    'vuelta'::text as sentido,
    'preview-vuelta-4689-tejar-san-jose-v1'::text as pattern_code,
    'SAN JOSE-TEJAR / VUELTA'::text as pattern_name,
    'interurbana'::text as categoria_operativa,
    0.940::numeric as clasificacion_confianza,
    24::integer as frecuencia_base_min
),
variant_source as (
  select
    rv.source_id as variant_source_id,
    rv.variant_code,
    rv.description_raw
  from public.staging_ctp_official_route_variants rv
  where rv.variant_code = '0300-Q-1'
  limit 1
),
preview_stops as (
  select
    sr.ruta_id,
    sr.sentido,
    sr.pattern_code,
    sr.pattern_name,
    sr.categoria_operativa,
    sr.clasificacion_confianza,
    sr.frecuencia_base_min,
    vs.variant_code,
    vs.description_raw as variant_description,
    (-1 * s.source_id)::integer as preview_parada_id,
    coalesce(s.description_raw, 'Parada oficial CTP') as preview_stop_name,
    s.lat::double precision as lat,
    s.lng::double precision as lng,
    i.suggested_stop_sequence::integer as stop_sequence,
    st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography as stop_geo
  from seed_route sr
  cross join variant_source vs
  join public.staging_ctp_route_stops_inferred i
    on i.variant_source_id = vs.variant_source_id
  join public.staging_ctp_official_stops s
    on s.source_id = i.stop_source_id
),
mapped_stops as (
  select
    ps.*,
    coalesce(nearby.id, ps.preview_parada_id)::bigint as parada_id,
    nearby.id as matched_runtime_parada_id
  from preview_stops ps
  left join lateral (
    select
      p.id,
      st_distance(p.geo, ps.stop_geo)::integer as distance_m
    from public.paradas p
    where p.activo = true
      and p.id > 0
      and st_dwithin(p.geo, ps.stop_geo, 90)
    order by st_distance(p.geo, ps.stop_geo) asc, p.id asc
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
    m.categoria_operativa,
    m.clasificacion_confianza,
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
    (array_agg(m.preview_stop_name order by m.stop_sequence desc))[1] as headsign,
    count(*)::integer as parada_count,
    sum(m.segment_distance_m)::integer as distancia_total_m,
    jsonb_build_object(
      'seed_source', 'preview_route300_rio_loro_direction_v1',
      'seed_kind', 'route_pattern',
      'official_variant_code', max(m.variant_code),
      'official_variant_description', max(m.variant_description),
      'preview_stop_count', count(*)::integer,
      'matched_runtime_stop_count', count(*) filter (where m.matched_runtime_parada_id is not null),
      'preview_stop_ids', jsonb_agg(m.preview_parada_id order by m.stop_sequence),
      'matched_runtime_stop_ids', jsonb_agg(m.matched_runtime_parada_id order by m.stop_sequence)
    ) as metadata
  from measured m
  group by
    m.ruta_id,
    m.sentido,
    m.pattern_code,
    m.pattern_name,
    m.categoria_operativa,
    m.clasificacion_confianza,
    m.frecuencia_base_min
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
  select rp.id as pattern_id
  from public.route_patterns rp
  where rp.ruta_id = 4689
    and rp.fuente = 'importacion'
    and coalesce(rp.metadata ->> 'seed_source', '') = 'preview_route300_rio_loro_direction_v1'
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
    'seed_source', 'preview_route300_rio_loro_direction_v1',
    'seed_kind', 'service_window',
    'seed_ruta_id', 4689
  )
from pattern_targets pt
join lateral (
  values
    ('habil'::text, '05:00'::time, '09:00'::time, 24::integer),
    ('habil'::text, '09:00'::time, '16:00'::time, 30::integer),
    ('habil'::text, '16:00'::time, '20:30'::time, 24::integer),
    ('sabado'::text, '06:00'::time, '20:00'::time, 32::integer),
    ('domingo'::text, '07:00'::time, '19:00'::time, 40::integer),
    ('feriado'::text, '07:00'::time, '19:00'::time, 40::integer)
) as sw(dia_tipo, hora_inicio, hora_fin, frecuencia_promedio_min)
  on true;
