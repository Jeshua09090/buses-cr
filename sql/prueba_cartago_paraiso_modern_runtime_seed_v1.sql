set search_path = public, extensions;

-- Runtime seed for the first 0336 east-corridor slice:
-- Cartago <-> Paraiso. This is intentionally small; route 0336 has many
-- branches, so we promote the trunk before expanding to Cachi/Orosi/etc.

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
    raise exception 'public.ctp_preview_route_variant_map() is required before seeding Cartago-Paraiso';
  end if;

  if function_sql not like '%(4360,%0336-A-1%' then
    function_sql := replace(
      function_sql,
      $needle$      (4695, '300', '0300-Y', null, 'nearby_stops', 20, false)
  ) as v$needle$,
      $replacement$      (4695, '300', '0300-Y', null, 'nearby_stops', 20, false),
      (4360, '336', '0336-A', '0336-A-1', 'route_stops', 10, false),
      (4361, '336', '0336-A', '0336-A-2', 'route_stops', 10, false)
  ) as v$replacement$
    );

    execute function_sql;
  end if;
end $do$;

insert into public.rutas (
  id,
  codigo_ctp,
  operador,
  nombre_ruta,
  canton_inicio,
  canton_final,
  distancia_km,
  geometry
)
select
  seed.ruta_id,
  seed.codigo_ctp,
  seed.operador,
  seed.nombre_ruta,
  seed.canton_inicio,
  seed.canton_final,
  null::double precision,
  st_asgeojson(st_transform(rv.geom, 4326))::jsonb
from (
  values
    (4360::bigint, '336'::text, null::text, 'CARTAGO - PARAISO'::text, 'CARTAGO'::text, 'PARAISO'::text, '0336-A-1'::text),
    (4361::bigint, '336'::text, null::text, 'PARAISO - CARTAGO'::text, 'PARAISO'::text, 'CARTAGO'::text, '0336-A-2'::text)
) as seed(ruta_id, codigo_ctp, operador, nombre_ruta, canton_inicio, canton_final, variant_code)
join public.staging_ctp_official_route_variants rv
  on rv.variant_code = seed.variant_code
on conflict (id) do update
set codigo_ctp = excluded.codigo_ctp,
    operador = excluded.operador,
    nombre_ruta = excluded.nombre_ruta,
    canton_inicio = excluded.canton_inicio,
    canton_final = excluded.canton_final,
    geometry = excluded.geometry;

delete from public.ruta_puntos
where ruta_id in (4360, 4361);

with selected_variants as (
  select *
  from (
    values
      (4360::integer, '0336-A-1'::text),
      (4361::integer, '0336-A-2'::text)
  ) as variants(ruta_id, variant_code)
),
points as (
  select
    sv.ruta_id,
    case
      when cardinality(dp.path) >= 2 then dp.path[1]
      else 1
    end as segmento_id,
    row_number() over (
      partition by sv.ruta_id
      order by
        case
          when cardinality(dp.path) >= 2 then dp.path[1]
          else 1
        end,
        case
          when cardinality(dp.path) >= 2 then dp.path[2]
          else dp.path[1]
        end
    ) as point_order,
    st_y(dp.geom) as lat,
    st_x(dp.geom) as lng
  from selected_variants sv
  join public.staging_ctp_official_route_variants rv
    on rv.variant_code = sv.variant_code
  cross join lateral st_dumppoints(st_transform(rv.geom, 4326)) as dp
)
insert into public.ruta_puntos (
  id,
  ruta_id,
  lat,
  lng,
  orden,
  geog,
  segmento_id
)
select
  -1 * (p.ruta_id * 100000 + p.point_order) as id,
  p.ruta_id,
  p.lat,
  p.lng,
  p.point_order,
  st_setsrid(st_makepoint(p.lng, p.lat), 4326)::geography,
  p.segmento_id
from points p;

with seed_routes as (
  select *
  from (
    values
      (4360::bigint, 'ida'::text, 20::integer),
      (4361::bigint, 'vuelta'::text, 20::integer)
  ) as routes(ruta_id, sentido, frecuencia_base_min)
),
preview_stops as (
  select
    sr.ruta_id,
    sr.sentido,
    concat('preview-', sr.sentido, '-', sr.ruta_id::text, '-cartago-paraiso-v1') as pattern_code,
    concat(r.nombre_ruta, ' / ', upper(sr.sentido)) as pattern_name,
    'local'::text as categoria_operativa,
    0.850::numeric as clasificacion_confianza,
    sr.frecuencia_base_min,
    ps.parada_id as preview_parada_id,
    ps.nombre as preview_stop_name,
    ps.lat::double precision as lat,
    ps.lng::double precision as lng,
    ord::integer as stop_sequence,
    st_setsrid(st_makepoint(ps.lng, ps.lat), 4326)::geography as stop_geo
  from seed_routes sr
  join public.rutas r
    on r.id = sr.ruta_id
  cross join lateral public.ctp_preview_route_stops(sr.ruta_id::integer)
    with ordinality as ps(parada_id, nombre, lat, lng, tiene_techo, accesible, ord)
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
    'seed_source', 'preview_cartago_paraiso_modern_v1',
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
where rp.ruta_id in (4360, 4361)
  and rp.fuente = 'importacion'
  and coalesce(rp.metadata ->> 'seed_source', '') = 'preview_cartago_paraiso_modern_v1';

with seed_routes as (
  select *
  from (
    values
      (4360::bigint, 'ida'::text, 20::integer),
      (4361::bigint, 'vuelta'::text, 20::integer)
  ) as routes(ruta_id, sentido, frecuencia_base_min)
),
preview_stops as (
  select
    sr.ruta_id,
    sr.sentido,
    concat('preview-', sr.sentido, '-', sr.ruta_id::text, '-cartago-paraiso-v1') as pattern_code,
    concat(r.nombre_ruta, ' / ', upper(sr.sentido)) as pattern_name,
    'local'::text as categoria_operativa,
    0.850::numeric as clasificacion_confianza,
    sr.frecuencia_base_min,
    ps.parada_id as preview_parada_id,
    ps.nombre as preview_stop_name,
    ps.lat::double precision as lat,
    ps.lng::double precision as lng,
    ord::integer as stop_sequence,
    st_setsrid(st_makepoint(ps.lng, ps.lat), 4326)::geography as stop_geo
  from seed_routes sr
  join public.rutas r
    on r.id = sr.ruta_id
  cross join lateral public.ctp_preview_route_stops(sr.ruta_id::integer)
    with ordinality as ps(parada_id, nombre, lat, lng, tiene_techo, accesible, ord)
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
      'seed_source', 'preview_cartago_paraiso_modern_v1',
      'seed_kind', 'route_pattern',
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
    and coalesce(rp.metadata ->> 'seed_source', '') = 'preview_cartago_paraiso_modern_v1'
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
    'seed_source', 'preview_cartago_paraiso_modern_v1',
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
