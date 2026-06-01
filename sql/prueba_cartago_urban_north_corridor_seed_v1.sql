set search_path = public, extensions;

with seed_routes as (
  select *
  from (
    values
      (4400::bigint, '321'::text, 'CARTAGO - RESIDENCIAL LOS MOLINOS'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0321-A-1'::text),
      (4401::bigint, '321'::text, 'RESIDENCIAL LOS MOLINOS - CARTAGO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0321-A-2'::text),
      (4402::bigint, '322'::text, 'CARTAGO - LOYOLA - PEDREGAL - QUIRCOT'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0322-A-1'::text),
      (4403::bigint, '322'::text, 'CARTAGO - LOYOLA - PEDREGAL - QUIRCOT SALIENDO DE PEDREGAL'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0322-A-2'::text),
      (4404::bigint, '322'::text, 'CARTAGO - EL CARMEN - QUIRCOT - COOPERROSALES'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0322-B-1'::text),
      (4405::bigint, '322'::text, 'CARTAGO - EL CARMEN - QUIRCOT - COOPERROSALES POR SAN RAFAEL'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0322-B-2'::text),
      (4406::bigint, '322'::text, 'CARTAGO - EL CARMEN - QUIRCOT - ATARDECER'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0322-C-1'::text),
      (4407::bigint, '322'::text, 'CARTAGO - EL CARMEN - QUIRCOT - ATARDECER SALIENDO DEL ATARDECER'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0322-C-2'::text),
      (4408::bigint, '322'::text, 'CARTAGO - EL CARMEN - QUIRCOT - SAN RAFAEL'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0322-D-1'::text),
      (4409::bigint, '322'::text, 'CARTAGO - QUIRCOT - PEDREGAL - PARQUE INDUSTRIAL'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0322-E-1'::text),
      (4410::bigint, '324'::text, 'CARTAGO - EL BOSQUE - BLANQUILLO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0324-A-1'::text),
      (4411::bigint, '324'::text, 'BLANQUILLO - EL BOSQUE - CARTAGO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0324-A-2'::text),
      (4412::bigint, '325'::text, 'CARTAGO - SAN RAFAEL DE OREAMUNO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0325-A-1'::text),
      (4413::bigint, '325'::text, 'CARTAGO - BARRIO MARIA AUXILIADORA'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0325-B-1'::text),
      (4414::bigint, '325'::text, 'CARTAGO - VISTA HERMOSA - LA CATOLICA - AGROPECUARIO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0325-C-1'::text),
      (4415::bigint, '325'::text, 'AGROPECUARIO - LA CATOLICA - VISTA HERMOSA - CARTAGO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0325-C-2'::text),
      (4416::bigint, '329'::text, 'CARTAGO - SAN BLAS'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0329-A-1'::text),
      (4417::bigint, '329'::text, 'SAN BLAS - CARTAGO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0329-A-2'::text),
      (4418::bigint, '329'::text, 'CARTAGO - SAN BLAS - EL ALTO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0329-B-1'::text),
      (4419::bigint, '329'::text, 'EL ALTO - SAN BLAS - CARTAGO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0329-B-2'::text),
      (4420::bigint, '329'::text, 'EL ALTO - SAN BLAS - CARTAGO - PARQUE INDUSTRIAL'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0329-C-1'::text),
      (4421::bigint, '334'::text, 'CARTAGO - CABALLO BLANCO - DULCE NOMBRE'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0334-A-1'::text),
      (4422::bigint, '334'::text, 'DULCE NOMBRE - CABALLO BLANCO - CARTAGO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0334-A-2'::text),
      (4423::bigint, '334'::text, 'CARTAGO - BLANQUILLO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0334-B-1'::text),
      (4424::bigint, '334'::text, 'BLANQUILLO - CARTAGO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0334-B-2'::text),
      (4425::bigint, '335'::text, 'CARTAGO - AGUA CALIENTE - LOURDES'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0335-A-1'::text),
      (4426::bigint, '335'::text, 'LOURDES - AGUA CALIENTE - CARTAGO'::text, 'CARTAGO'::text, 'CARTAGO'::text, '0335-A-2'::text)
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
where ruta_id between 4400 and 4426;

with selected_variants as (
  select *
  from (
    values
      (4400::integer, '0321-A-1'::text),
      (4401::integer, '0321-A-2'::text),
      (4402::integer, '0322-A-1'::text),
      (4403::integer, '0322-A-2'::text),
      (4404::integer, '0322-B-1'::text),
      (4405::integer, '0322-B-2'::text),
      (4406::integer, '0322-C-1'::text),
      (4407::integer, '0322-C-2'::text),
      (4408::integer, '0322-D-1'::text),
      (4409::integer, '0322-E-1'::text),
      (4410::integer, '0324-A-1'::text),
      (4411::integer, '0324-A-2'::text),
      (4412::integer, '0325-A-1'::text),
      (4413::integer, '0325-B-1'::text),
      (4414::integer, '0325-C-1'::text),
      (4415::integer, '0325-C-2'::text),
      (4416::integer, '0329-A-1'::text),
      (4417::integer, '0329-A-2'::text),
      (4418::integer, '0329-B-1'::text),
      (4419::integer, '0329-B-2'::text),
      (4420::integer, '0329-C-1'::text),
      (4421::integer, '0334-A-1'::text),
      (4422::integer, '0334-A-2'::text),
      (4423::integer, '0334-B-1'::text),
      (4424::integer, '0334-B-2'::text),
      (4425::integer, '0335-A-1'::text),
      (4426::integer, '0335-A-2'::text)
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
