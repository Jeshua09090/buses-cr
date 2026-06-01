set search_path = public, extensions;

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
  4190,
  '328',
  'AUTOTRANSPORTES EL GUARCO SOCIEDAD ANONIMA',
  'CARTAGO-SAN ISIDRO - EL MOLINO',
  'CARTAGO',
  'CARTAGO',
  null::double precision,
  null::text,
  st_asgeojson(st_transform(rv.geom, 4326))::jsonb
from public.staging_ctp_official_route_variants rv
where rv.variant_code = '0328-D-1'
on conflict (id) do update
set codigo_ctp = excluded.codigo_ctp,
    operador = excluded.operador,
    nombre_ruta = excluded.nombre_ruta,
    canton_inicio = excluded.canton_inicio,
    canton_final = excluded.canton_final,
    geometry = excluded.geometry;

delete from public.ruta_puntos
where ruta_id = 4190;

with points as (
  select
    case
      when cardinality(dp.path) >= 2 then dp.path[1]
      else 1
    end as segmento_id,
    row_number() over (
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
  from public.staging_ctp_official_route_variants rv
  cross join lateral st_dumppoints(st_transform(rv.geom, 4326)) as dp
  where rv.variant_code = '0328-D-1'
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
  -1 * (4190 * 100000 + p.point_order) as id,
  4190,
  p.lat,
  p.lng,
  p.point_order,
  st_setsrid(st_makepoint(p.lng, p.lat), 4326)::geography,
  p.segmento_id
from points p;
