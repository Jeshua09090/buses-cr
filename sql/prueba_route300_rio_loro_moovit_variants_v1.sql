set search_path = public, extensions;

-- Rio Loro is served by the wider route 0300 family. Keeping only 0300-Q
-- made the planner label every good candidate as SAN JOSE-TEJAR and left the
-- Moovit-like SAN JOSE / TARAS / CARTAGO variants out of runtime ranking.

with seed_routes as (
  select *
  from (
    values
      (
        93001::integer,
        '300'::text,
        'SAN JOSE - SAN PEDRO - TRES RIOS - TARAS - CARTAGO'::text,
        '0300-J-1'::text,
        '0300-J'::text,
        'ida'::text,
        18::integer,
        0.920::numeric
      ),
      (
        93002::integer,
        '300'::text,
        'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO'::text,
        '0300-L-2'::text,
        '0300-L'::text,
        'vuelta'::text,
        18::integer,
        0.925::numeric
      ),
      (
        93003::integer,
        '300'::text,
        'SAN JOSE - SAN PEDRO - PISTA - LA LIMA - CARTAGO'::text,
        '0300-K-2'::text,
        '0300-K'::text,
        'vuelta'::text,
        20::integer,
        0.900::numeric
      ),
      (
        93004::integer,
        '300'::text,
        'SAN JOSE - SAN PEDRO - TRES RIOS - LA LIMA - CARTAGO'::text,
        '0300-M-2'::text,
        '0300-M'::text,
        'vuelta'::text,
        20::integer,
        0.900::numeric
      ),
      (
        93005::integer,
        '300'::text,
        'SAN JOSE - ZAPOTE - TRES RIOS - TARAS - CARTAGO'::text,
        '0300-R-2'::text,
        '0300-R'::text,
        'vuelta'::text,
        20::integer,
        0.895::numeric
      ),
      (
        93006::integer,
        '300'::text,
        'SAN JOSE - ZAPOTE - TRES RIOS - LA LIMA - CARTAGO'::text,
        '0300-U-2'::text,
        '0300-U'::text,
        'vuelta'::text,
        22::integer,
        0.885::numeric
      )
  ) as routes(
    ruta_id,
    route_code,
    route_name,
    variant_code,
    variant_family_code,
    sentido,
    frecuencia_base_min,
    clasificacion_confianza
  )
)
insert into public.rutas (
  id,
  codigo_ctp,
  operador,
  nombre_ruta,
  canton_inicio,
  canton_final,
  distancia_km,
  "año_ramal",
  geometry
)
select
  sr.ruta_id,
  sr.route_code,
  'AUTO TRANSPORTES LUMACA SOCIEDAD ANONIMA',
  sr.route_name,
  'SAN JOSE',
  'CARTAGO',
  null::double precision,
  'preview-ctp',
  jsonb_build_object(
    'seed_source', 'preview_route300_rio_loro_moovit_variants_v1',
    'seed_kind', 'synthetic_preview_route',
    'official_variant_code', sr.variant_code,
    'official_variant_family_code', sr.variant_family_code
  )
from seed_routes sr
on conflict (id) do update
set codigo_ctp = excluded.codigo_ctp,
    operador = excluded.operador,
    nombre_ruta = excluded.nombre_ruta,
    canton_inicio = excluded.canton_inicio,
    canton_final = excluded.canton_final,
    "año_ramal" = excluded."año_ramal",
    geometry = excluded.geometry;

update public.rutas
set nombre_ruta = 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
    operador = coalesce(operador, 'AUTO TRANSPORTES LUMACA SOCIEDAD ANONIMA')
where id = 4692
  and nombre_ruta = 'INA-SAN JOSE-SAN PEDRO-PISTA-TARAS-CARTAGO';

update public.route_patterns
set activo = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'inactive_reason', 'Replaced by official 0300 Moovit-like preview variants for Rio Loro',
      'inactive_seed_source', 'preview_route300_rio_loro_moovit_variants_v1'
    ),
    updated_at = timezone('utc', now())
where ruta_id = 4692
  and fuente = 'legacy_migration'
  and activo = true;

with seed_routes as (
  select *
  from (
    values
      (93001::integer, '0300-J-1'::text),
      (93002::integer, '0300-L-2'::text),
      (93003::integer, '0300-K-2'::text),
      (93004::integer, '0300-M-2'::text),
      (93005::integer, '0300-R-2'::text),
      (93006::integer, '0300-U-2'::text)
  ) as routes(ruta_id, variant_code)
),
target_patterns as (
  select rp.id
  from public.route_patterns rp
  join seed_routes sr
    on sr.ruta_id = rp.ruta_id
  where rp.fuente = 'importacion'
    and coalesce(rp.metadata ->> 'seed_source', '') = 'preview_route300_rio_loro_moovit_variants_v1'
)
delete from public.service_windows sw
using target_patterns tp
where sw.pattern_id = tp.id;

with seed_routes as (
  select *
  from (
    values
      (93001::integer, '0300-J-1'::text),
      (93002::integer, '0300-L-2'::text),
      (93003::integer, '0300-K-2'::text),
      (93004::integer, '0300-M-2'::text),
      (93005::integer, '0300-R-2'::text),
      (93006::integer, '0300-U-2'::text)
  ) as routes(ruta_id, variant_code)
),
target_patterns as (
  select rp.id
  from public.route_patterns rp
  join seed_routes sr
    on sr.ruta_id = rp.ruta_id
  where rp.fuente = 'importacion'
    and coalesce(rp.metadata ->> 'seed_source', '') = 'preview_route300_rio_loro_moovit_variants_v1'
)
delete from public.route_pattern_stops rps
using target_patterns tp
where rps.pattern_id = tp.id;

with seed_routes as (
  select *
  from (
    values
      (93001::integer, '0300-J-1'::text),
      (93002::integer, '0300-L-2'::text),
      (93003::integer, '0300-K-2'::text),
      (93004::integer, '0300-M-2'::text),
      (93005::integer, '0300-R-2'::text),
      (93006::integer, '0300-U-2'::text)
  ) as routes(ruta_id, variant_code)
)
delete from public.route_patterns rp
using seed_routes sr
where rp.ruta_id = sr.ruta_id
  and rp.fuente = 'importacion'
  and coalesce(rp.metadata ->> 'seed_source', '') = 'preview_route300_rio_loro_moovit_variants_v1';

with seed_routes as (
  select *
  from (
    values
      (
        93001::integer,
        'SAN JOSE - SAN PEDRO - TRES RIOS - TARAS - CARTAGO'::text,
        '0300-J-1'::text,
        '0300-J'::text,
        'ida'::text,
        18::integer,
        0.920::numeric
      ),
      (
        93002::integer,
        'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO'::text,
        '0300-L-2'::text,
        '0300-L'::text,
        'vuelta'::text,
        18::integer,
        0.925::numeric
      ),
      (
        93003::integer,
        'SAN JOSE - SAN PEDRO - PISTA - LA LIMA - CARTAGO'::text,
        '0300-K-2'::text,
        '0300-K'::text,
        'vuelta'::text,
        20::integer,
        0.900::numeric
      ),
      (
        93004::integer,
        'SAN JOSE - SAN PEDRO - TRES RIOS - LA LIMA - CARTAGO'::text,
        '0300-M-2'::text,
        '0300-M'::text,
        'vuelta'::text,
        20::integer,
        0.900::numeric
      ),
      (
        93005::integer,
        'SAN JOSE - ZAPOTE - TRES RIOS - TARAS - CARTAGO'::text,
        '0300-R-2'::text,
        '0300-R'::text,
        'vuelta'::text,
        20::integer,
        0.895::numeric
      ),
      (
        93006::integer,
        'SAN JOSE - ZAPOTE - TRES RIOS - LA LIMA - CARTAGO'::text,
        '0300-U-2'::text,
        '0300-U'::text,
        'vuelta'::text,
        22::integer,
        0.885::numeric
      )
  ) as routes(
    ruta_id,
    route_name,
    variant_code,
    variant_family_code,
    sentido,
    frecuencia_base_min,
    clasificacion_confianza
  )
),
variant_source as (
  select
    sr.ruta_id,
    sr.route_name,
    sr.variant_code,
    sr.variant_family_code,
    sr.sentido,
    sr.frecuencia_base_min,
    sr.clasificacion_confianza,
    rv.source_id as variant_source_id,
    rv.description_raw as variant_description
  from seed_routes sr
  join public.staging_ctp_official_route_variants rv
    on rv.variant_code = sr.variant_code
),
preview_stops as (
  select
    vs.ruta_id,
    vs.route_name,
    vs.variant_code,
    vs.variant_family_code,
    vs.sentido,
    vs.frecuencia_base_min,
    vs.clasificacion_confianza,
    vs.variant_description,
    (-1 * s.source_id)::integer as preview_parada_id,
    coalesce(s.description_raw, 'Parada oficial CTP') as preview_stop_name,
    s.lat::double precision as lat,
    s.lng::double precision as lng,
    i.suggested_stop_sequence::integer as stop_sequence,
    st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography as stop_geo
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
    'seed_source', 'preview_route300_rio_loro_moovit_variants_v1',
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

with seed_routes as (
  select *
  from (
    values
      (
        93001::integer,
        'SAN JOSE - SAN PEDRO - TRES RIOS - TARAS - CARTAGO'::text,
        '0300-J-1'::text,
        '0300-J'::text,
        'ida'::text,
        18::integer,
        0.920::numeric
      ),
      (
        93002::integer,
        'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO'::text,
        '0300-L-2'::text,
        '0300-L'::text,
        'vuelta'::text,
        18::integer,
        0.925::numeric
      ),
      (
        93003::integer,
        'SAN JOSE - SAN PEDRO - PISTA - LA LIMA - CARTAGO'::text,
        '0300-K-2'::text,
        '0300-K'::text,
        'vuelta'::text,
        20::integer,
        0.900::numeric
      ),
      (
        93004::integer,
        'SAN JOSE - SAN PEDRO - TRES RIOS - LA LIMA - CARTAGO'::text,
        '0300-M-2'::text,
        '0300-M'::text,
        'vuelta'::text,
        20::integer,
        0.900::numeric
      ),
      (
        93005::integer,
        'SAN JOSE - ZAPOTE - TRES RIOS - TARAS - CARTAGO'::text,
        '0300-R-2'::text,
        '0300-R'::text,
        'vuelta'::text,
        20::integer,
        0.895::numeric
      ),
      (
        93006::integer,
        'SAN JOSE - ZAPOTE - TRES RIOS - LA LIMA - CARTAGO'::text,
        '0300-U-2'::text,
        '0300-U'::text,
        'vuelta'::text,
        22::integer,
        0.885::numeric
      )
  ) as routes(
    ruta_id,
    route_name,
    variant_code,
    variant_family_code,
    sentido,
    frecuencia_base_min,
    clasificacion_confianza
  )
),
variant_source as (
  select
    sr.ruta_id,
    sr.route_name,
    sr.variant_code,
    sr.variant_family_code,
    sr.sentido,
    sr.frecuencia_base_min,
    sr.clasificacion_confianza,
    rv.source_id as variant_source_id,
    rv.description_raw as variant_description
  from seed_routes sr
  join public.staging_ctp_official_route_variants rv
    on rv.variant_code = sr.variant_code
),
preview_stops as (
  select
    vs.ruta_id,
    vs.route_name,
    vs.variant_code,
    vs.variant_family_code,
    vs.sentido,
    concat('preview-route300-', lower(replace(vs.variant_code, '-', '-')), '-rio-loro-v1') as pattern_code,
    concat(vs.route_name, ' / ', upper(vs.sentido)) as pattern_name,
    vs.frecuencia_base_min,
    vs.clasificacion_confianza,
    vs.variant_description,
    (-1 * s.source_id)::integer as preview_parada_id,
    coalesce(s.description_raw, 'Parada oficial CTP') as preview_stop_name,
    s.lat::double precision as lat,
    s.lng::double precision as lng,
    i.suggested_stop_sequence::integer as stop_sequence,
    st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography as stop_geo
  from variant_source vs
  join public.staging_ctp_route_stops_inferred i
    on i.variant_source_id = vs.variant_source_id
  join public.staging_ctp_official_stops s
    on s.source_id = i.stop_source_id
),
mapped_stops as (
  select
    ps.*,
    coalesce(nearby.id, ps.preview_parada_id)::bigint as parada_id,
    nearby.id as matched_runtime_parada_id,
    nearby.distance_m as matched_runtime_distance_m
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
    lag(ms.stop_geo) over (
      partition by ms.ruta_id
      order by ms.stop_sequence
    ) as prev_geo
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
    max(m.pattern_code) as pattern_code,
    max(m.pattern_name) as pattern_name,
    max(m.variant_code) as variant_code,
    max(m.variant_family_code) as variant_family_code,
    max(m.variant_description) as variant_description,
    max(m.frecuencia_base_min) as frecuencia_base_min,
    max(m.clasificacion_confianza) as clasificacion_confianza,
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
      'seed_source', 'preview_route300_rio_loro_moovit_variants_v1',
      'seed_kind', 'route_pattern',
      'official_variant_code', max(m.variant_code),
      'official_variant_family_code', max(m.variant_family_code),
      'official_variant_description', max(m.variant_description),
      'preview_stop_count', count(*)::integer,
      'matched_runtime_stop_count', count(*) filter (where m.matched_runtime_parada_id is not null),
      'preview_stop_ids', jsonb_agg(m.preview_parada_id order by m.stop_sequence),
      'matched_runtime_stop_ids', jsonb_agg(m.matched_runtime_parada_id order by m.stop_sequence)
    ) as metadata
  from measured m
  group by m.ruta_id, m.sentido
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
    'interurbana',
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
    partition by m.ruta_id
    order by m.stop_sequence
    rows between unbounded preceding and current row
  )::integer as distancia_acumulada_m,
  greatest(
    0,
    round(
      (
        sum(m.segment_distance_m) over (
          partition by m.ruta_id
          order by m.stop_sequence
          rows between unbounded preceding and current row
        )
      )::numeric / 520.0
    )
  )::integer as tiempo_estimado_desde_inicio_min
from measured m
join inserted_patterns ip
  on ip.ruta_id = m.ruta_id;

with pattern_targets as (
  select
    rp.id as pattern_id,
    rp.ruta_id,
    coalesce((rp.metadata ->> 'official_variant_code'), '') as variant_code
  from public.route_patterns rp
  where rp.ruta_id between 93001 and 93006
    and rp.fuente = 'importacion'
    and coalesce(rp.metadata ->> 'seed_source', '') = 'preview_route300_rio_loro_moovit_variants_v1'
),
frequencies as (
  select *
  from (
    values
      ('0300-J-1'::text, 18::integer),
      ('0300-L-2'::text, 18::integer),
      ('0300-K-2'::text, 20::integer),
      ('0300-M-2'::text, 20::integer),
      ('0300-R-2'::text, 20::integer),
      ('0300-U-2'::text, 22::integer)
  ) as f(variant_code, frecuencia_base_min)
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
    'seed_source', 'preview_route300_rio_loro_moovit_variants_v1',
    'seed_kind', 'service_window',
    'seed_ruta_id', pt.ruta_id,
    'official_variant_code', pt.variant_code
  )
from pattern_targets pt
left join frequencies f
  on f.variant_code = pt.variant_code
join lateral (
  values
    ('habil'::text, '05:00'::time, '09:00'::time, coalesce(f.frecuencia_base_min, 20)),
    ('habil'::text, '09:00'::time, '16:00'::time, coalesce(f.frecuencia_base_min + 4, 24)),
    ('habil'::text, '16:00'::time, '20:30'::time, coalesce(f.frecuencia_base_min, 20)),
    ('sabado'::text, '06:00'::time, '20:00'::time, coalesce(f.frecuencia_base_min + 6, 26)),
    ('domingo'::text, '07:00'::time, '22:30'::time, coalesce(f.frecuencia_base_min + 8, 28)),
    ('feriado'::text, '07:00'::time, '22:30'::time, coalesce(f.frecuencia_base_min + 8, 28))
) as sw(dia_tipo, hora_inicio, hora_fin, frecuencia_promedio_min)
  on true;

create or replace function public.ctp_preview_route_variant_map()
returns table (
  ruta_id integer,
  route_code text,
  variant_family_code text,
  variant_code text,
  preview_scope text,
  preview_priority integer,
  reverse_stop_order boolean
)
language sql
stable
as $function$
  select *
  from (
    values
      (5332, '332', '0332-A', '0332-A-1', 'route_stops', 10, false),
      (5332, '332', '0332-A', null, 'nearby_stops', 10, false),
      (5333, '332', '0332-B', '0332-B-1', 'route_stops', 10, false),
      (5333, '332', '0332-B', null, 'nearby_stops', 10, false),
      (4190, '328', '0328-D', '0328-D-1', 'route_stops', 10, true),
      (4290, '328', '0328-D', '0328-D-2', 'route_stops', 10, false),
      (4190, '328', '0328-D', null, 'nearby_stops', 10, false),
      (4191, '328', '0328-E', '0328-E-1', 'route_stops', 10, true),
      (4291, '328', '0328-E', '0328-E-2', 'route_stops', 10, false),
      (4191, '328', '0328-E', null, 'nearby_stops', 10, false),
      (4191, '328', '0328-F', null, 'nearby_stops', 20, false),
      (4226, '328', '0328-G', '0328-G-1', 'route_stops', 10, false),
      (4226, '328', '0328-G', null, 'nearby_stops', 10, false),
      (4227, '328', '0328-G', '0328-G-2', 'route_stops', 10, false),
      (4227, '328', '0328-G', null, 'nearby_stops', 10, false),
      (4689, '300', '0300-Q', '0300-Q-1', 'route_stops', 10, true),
      (4689, '300', '0300-Q', null, 'nearby_stops', 10, false),
      (93001, '300', '0300-J', '0300-J-1', 'route_stops', 10, false),
      (93002, '300', '0300-L', '0300-L-2', 'route_stops', 10, false),
      (93003, '300', '0300-K', '0300-K-2', 'route_stops', 10, false),
      (93004, '300', '0300-M', '0300-M-2', 'route_stops', 10, false),
      (93005, '300', '0300-R', '0300-R-2', 'route_stops', 10, false),
      (93006, '300', '0300-U', '0300-U-2', 'route_stops', 10, false),
      (4719, '323', '0323-B', '0323-B-1', 'route_stops', 10, false),
      (4719, '323', '0323-B', null, 'nearby_stops', 10, false),
      (4330, '330', '0330-A', '0330-A-1', 'route_stops', 10, false),
      (4330, '330', '0330-A', null, 'nearby_stops', 10, false),
      (4331, '330', '0330-A', '0330-A-2', 'route_stops', 10, false),
      (4332, '330', '0330-A', '0330-A-3', 'route_stops', 20, false),
      (4333, '330', '0330-A', '0330-A-4', 'route_stops', 20, false),
      (4336, '330', '0330-A', '0330-A-5', 'route_stops', 30, false),
      (4337, '330', '0330-A', '0330-A-6', 'route_stops', 30, false),
      (4334, '331', '0331-H', '0331-H-1', 'route_stops', 10, false),
      (4334, '331', '0331-H', null, 'nearby_stops', 10, false),
      (4335, '331', '0331-H', '0331-H-2', 'route_stops', 10, false),
      (4400, '321', '0321-A', '0321-A-1', 'route_stops', 10, false),
      (4401, '321', '0321-A', '0321-A-2', 'route_stops', 10, false),
      (4402, '322', '0322-A', '0322-A-1', 'route_stops', 10, false),
      (4403, '322', '0322-A', '0322-A-2', 'route_stops', 20, false),
      (4404, '322', '0322-B', '0322-B-1', 'route_stops', 10, false),
      (4405, '322', '0322-B', '0322-B-2', 'route_stops', 20, false),
      (4406, '322', '0322-C', '0322-C-1', 'route_stops', 10, false),
      (4407, '322', '0322-C', '0322-C-2', 'route_stops', 20, false),
      (4408, '322', '0322-D', '0322-D-1', 'route_stops', 10, false),
      (4409, '322', '0322-E', '0322-E-1', 'route_stops', 10, false),
      (4410, '324', '0324-A', '0324-A-1', 'route_stops', 10, false),
      (4411, '324', '0324-A', '0324-A-2', 'route_stops', 10, false),
      (4412, '325', '0325-A', '0325-A-1', 'route_stops', 10, false),
      (4413, '325', '0325-B', '0325-B-1', 'route_stops', 10, false),
      (4414, '325', '0325-C', '0325-C-1', 'route_stops', 10, false),
      (4415, '325', '0325-C', '0325-C-2', 'route_stops', 10, false),
      (4416, '329', '0329-A', '0329-A-1', 'route_stops', 10, false),
      (4417, '329', '0329-A', '0329-A-2', 'route_stops', 10, false),
      (4418, '329', '0329-B', '0329-B-1', 'route_stops', 10, false),
      (4419, '329', '0329-B', '0329-B-2', 'route_stops', 10, false),
      (4420, '329', '0329-C', '0329-C-1', 'route_stops', 10, false),
      (4421, '334', '0334-A', '0334-A-1', 'route_stops', 10, false),
      (4422, '334', '0334-A', '0334-A-2', 'route_stops', 10, false),
      (4423, '334', '0334-B', '0334-B-1', 'route_stops', 10, false),
      (4424, '334', '0334-B', '0334-B-2', 'route_stops', 10, false),
      (4425, '335', '0335-A', '0335-A-1', 'route_stops', 10, false),
      (4426, '335', '0335-A', '0335-A-2', 'route_stops', 10, false),
      (4430, '307', '0307-A', '0307-A-1', 'route_stops', 10, false),
      (4431, '307', '0307-A', '0307-A-2', 'route_stops', 10, true),
      (4432, '307', '0307-B', '0307-B-1', 'route_stops', 10, false),
      (4433, '307', '0307-B', '0307-B-2', 'route_stops', 10, true),
      (4434, '307', '0307-C', '0307-C-1', 'route_stops', 10, false),
      (4435, '307', '0307-C', '0307-C-2', 'route_stops', 10, true),
      (4436, '307', '0307-E', '0307-E-1', 'route_stops', 10, false),
      (4692, '300', '0300-L', null, 'nearby_stops', 10, false),
      (4692, '300', '0300-J', null, 'nearby_stops', 20, false),
      (4692, '300', '0300-O', null, 'nearby_stops', 30, false),
      (4693, '300', '0300-F', null, 'nearby_stops', 10, false),
      (4695, '300', '0300-C', null, 'nearby_stops', 10, false),
      (4695, '300', '0300-Y', null, 'nearby_stops', 20, false)
  ) as v(ruta_id, route_code, variant_family_code, variant_code, preview_scope, preview_priority, reverse_stop_order);
$function$;

comment on function public.ctp_preview_route_variant_map() is
  'Mapeo manual entre rutas productivas de Prueba y familias oficiales CTP para preview.';

grant execute on function public.ctp_preview_route_variant_map() to anon, authenticated;
