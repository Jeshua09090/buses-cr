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
  seed.ruta_id,
  seed.codigo_ctp,
  seed.operador,
  seed.nombre_ruta,
  seed.canton_inicio,
  seed.canton_final,
  null::double precision,
  null::text,
  st_asgeojson(st_transform(rv.geom, 4326))::jsonb
from (
  values
    (4226, '328', 'AUTOTRANSPORTES EL GUARCO SOCIEDAD ANONIMA', 'CARTAGO-HACIENDA VIEJA-TEJAR-GUAYABAL', 'CARTAGO', 'CARTAGO', '0328-G-1'),
    (4689, '300', 'AUTO TRANSPORTES LUMACA SOCIEDAD ANONIMA', 'SAN JOSE-TEJAR', 'SAN JOSÉ', 'GUARCO', '0300-Q-1')
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
where ruta_id in (4226, 4689);

with selected_variants as (
  select 4226::integer as ruta_id, '0328-G-1'::text as variant_code
  union all
  select 4689::integer as ruta_id, '0300-Q-1'::text as variant_code
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

comment on table public.ruta_puntos is
  'Puntos legacy usados por fallback y mapa. En Prueba algunos corredores se siembran desde geometria oficial CTP.';
