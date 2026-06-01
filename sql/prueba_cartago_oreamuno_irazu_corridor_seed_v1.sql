set search_path = public, extensions;

with seed_routes as (
  select *
  from (
    values
      (4430::bigint, '307'::text, 'CARTAGO - COT'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0307-A-1'::text),
      (4431::bigint, '307'::text, 'COT - CARTAGO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0307-A-2'::text),
      (4432::bigint, '307'::text, 'CARTAGO - TIERRA BLANCA - POTRERO CERRADO - SANATORIO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0307-B-1'::text),
      (4433::bigint, '307'::text, 'SANATORIO - POTRERO CERRADO - TIERRA BLANCA - CARTAGO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0307-B-2'::text),
      (4434::bigint, '307'::text, 'CARTAGO - SAN JUAN DE CHICUA - LA PASTORA - VOLCAN IRAZU'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0307-C-1'::text),
      (4435::bigint, '307'::text, 'VOLCAN IRAZU - LA PASTORA - SAN JUAN DE CHICUA - CARTAGO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0307-C-2'::text),
      (4436::bigint, '307'::text, 'TIERRA BLANCA - COT - PARQUE INDUSTRIAL'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0307-E-1'::text)
  ) as seed(ruta_id, codigo_ctp, nombre_ruta, canton_inicio, canton_final, variant_code)
)
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
  null::text,
  seed.nombre_ruta,
  seed.canton_inicio,
  seed.canton_final,
  null::double precision,
  st_asgeojson(st_transform(rv.geom, 4326))::jsonb
from seed_routes seed
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
where ruta_id between 4430 and 4436;

with selected_variants as (
  select *
  from (
    values
      (4430::integer, '0307-A-1'::text),
      (4431::integer, '0307-A-2'::text),
      (4432::integer, '0307-B-1'::text),
      (4433::integer, '0307-B-2'::text),
      (4434::integer, '0307-C-1'::text),
      (4435::integer, '0307-C-2'::text),
      (4436::integer, '0307-E-1'::text)
  ) as variants(ruta_id, variant_code)
),
points as (
  select
    sv.ruta_id,
    case when cardinality(dp.path) >= 2 then dp.path[1] else 1 end as segmento_id,
    row_number() over (
      partition by sv.ruta_id
      order by
        case when cardinality(dp.path) >= 2 then dp.path[1] else 1 end,
        case when cardinality(dp.path) >= 2 then dp.path[2] else dp.path[1] end
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
