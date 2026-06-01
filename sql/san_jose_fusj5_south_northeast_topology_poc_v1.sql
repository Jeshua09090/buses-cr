-- FU-SJ5 local-only POC for south/northeast transfer topology.
--
-- LOCAL-ONLY INVESTIGATION PACKAGE. Do not apply remotely.
--
-- Moovit-backed targets:
-- - Guadalupe: SAN JOSE - GUADALUPE - BARRIO PILAR.
-- - Parque La Paz: south/Seminario/Paso Ancho family near the park.
-- - Moravia: SAN JOSE - MORAVIA - DULCE NOMBRE DE CORONADO.
--
-- This POC intentionally excludes Desamparados, which is already packaged
-- remotely as san_jose_fusj3_desamparados_runtime_promotion_v1.

set search_path = public, extensions;

begin;

do $$
declare
  v_existing_ids integer;
  v_seed_patterns integer;
  v_seed_transfer_edges integer;
  v_seed_boarding_points integer;
  v_seed_stop_areas integer;
  v_missing_variants integer;
  v_missing_inferred integer;
begin
  select count(*)
  into v_existing_ids
  from public.rutas
  where id in (17230, 17232, 17234, 17235, 17250, 17251);

  if v_existing_ids > 0 then
    raise exception 'FU-SJ5 topology POC precondition failed: % target ruta ids already exist', v_existing_ids;
  end if;

  select count(*)
  into v_seed_patterns
  from public.route_patterns
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  if v_seed_patterns > 0 then
    raise exception 'FU-SJ5 topology POC precondition failed: % seed patterns already exist', v_seed_patterns;
  end if;

  select count(*)
  into v_seed_transfer_edges
  from public.planner_transfer_edges
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  select count(*)
  into v_seed_boarding_points
  from public.planner_boarding_points
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  select count(*)
  into v_seed_stop_areas
  from public.planner_stop_areas
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  if v_seed_transfer_edges > 0 or v_seed_boarding_points > 0 or v_seed_stop_areas > 0 then
    raise exception 'FU-SJ5 topology POC precondition failed: seeded transfer topology already exists (edges %, boarding %, areas %)',
      v_seed_transfer_edges, v_seed_boarding_points, v_seed_stop_areas;
  end if;

  select count(*)
  into v_missing_variants
  from (
    values
      ('0030-D-1'), ('0030-D-2'),
      ('0075-D-1'), ('0075-D-2'),
      ('0040-A-1'), ('0040-A-2')
  ) as expected(variant_code)
  where not exists (
    select 1
    from public.staging_ctp_official_route_variants rv
    where rv.variant_code = expected.variant_code
  );

  if v_missing_variants > 0 then
    raise exception 'FU-SJ5 topology POC precondition failed: % target variants missing', v_missing_variants;
  end if;

  select count(*)
  into v_missing_inferred
  from (
    values
      ('0030-D-1', 50), ('0030-D-2', 50),
      ('0075-D-1', 30), ('0075-D-2', 30),
      ('0040-A-1', 80), ('0040-A-2', 80)
  ) as expected(variant_code, min_stops)
  where (
    select count(*)
    from public.staging_ctp_route_stops_inferred i
    where i.variant_code = expected.variant_code
  ) < expected.min_stops;

  if v_missing_inferred > 0 then
    raise exception 'FU-SJ5 topology POC precondition failed: % target variants have too few inferred stops',
      v_missing_inferred;
  end if;
end $$;

do $$
declare
  v_max_id bigint;
begin
  select coalesce(max(id), 0)
  into v_max_id
  from public.planner_ctp_preview_route_bindings;
  perform setval(
    pg_get_serial_sequence('public.planner_ctp_preview_route_bindings', 'id'),
    greatest(v_max_id, 1),
    v_max_id > 0
  );

  select coalesce(max(id), 0)
  into v_max_id
  from public.route_patterns;
  perform setval(
    pg_get_serial_sequence('public.route_patterns', 'id'),
    greatest(v_max_id, 1),
    v_max_id > 0
  );

  select coalesce(max(id), 0)
  into v_max_id
  from public.route_pattern_stops;
  perform setval(
    pg_get_serial_sequence('public.route_pattern_stops', 'id'),
    greatest(v_max_id, 1),
    v_max_id > 0
  );

  select coalesce(max(id), 0)
  into v_max_id
  from public.service_windows;
  perform setval(
    pg_get_serial_sequence('public.service_windows', 'id'),
    greatest(v_max_id, 1),
    v_max_id > 0
  );
end $$;

with target_stop_ids as (
  select distinct (-200000000 - rs.stop_source_id)::integer as parada_id
  from public.staging_ctp_route_stops_inferred rs
  where rs.variant_code in (
    '0030-D-1', '0030-D-2',
    '0075-D-1', '0075-D-2',
    '0040-A-1', '0040-A-2'
  )
)
update public.paradas p
set metadata = p.metadata || jsonb_build_object(
      'san_jose_fusj5_topology_prior_metadata',
      p.metadata
    ),
    updated_at = timezone('utc'::text, now())
from target_stop_ids t
where p.id = t.parada_id
  and not (p.metadata ? 'san_jose_fusj5_topology_prior_metadata');

select public.planner_promote_ctp_variant_to_runtime(
  17230,
  '0030',
  '0030-D',
  '0030-D-1',
  'SAN JOSE - GUADALUPE - BARRIO PILAR',
  'SAN JOSE',
  'GUADALUPE',
  'ida',
  'SAN JOSE - GUADALUPE - BARRIO PILAR / IDA POC',
  'local',
  0.860,
  20,
  false,
  'san_jose_fusj5_south_northeast_topology_poc_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17234,
  '0030',
  '0030-D',
  '0030-D-2',
  'SAN JOSE - GUADALUPE - BARRIO PILAR',
  'GUADALUPE',
  'SAN JOSE',
  'vuelta',
  'SAN JOSE - GUADALUPE - BARRIO PILAR / VUELTA POC',
  'local',
  0.860,
  20,
  false,
  'san_jose_fusj5_south_northeast_topology_poc_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17232,
  '0075',
  '0075-D',
  '0075-D-1',
  'SAN JOSE - MONTE AZUL - SEMINARIO - LOMA LINDA - MADEIRAS',
  'SAN JOSE',
  'SEMINARIO',
  'ida',
  'SAN JOSE - MONTE AZUL - SEMINARIO - LOMA LINDA - MADEIRAS / IDA POC',
  'local',
  0.860,
  20,
  false,
  'san_jose_fusj5_south_northeast_topology_poc_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17235,
  '0075',
  '0075-D',
  '0075-D-2',
  'SAN JOSE - MONTE AZUL - SEMINARIO - LOMA LINDA - MADEIRAS',
  'SEMINARIO',
  'SAN JOSE',
  'vuelta',
  'SAN JOSE - MONTE AZUL - SEMINARIO - LOMA LINDA - MADEIRAS / VUELTA POC',
  'local',
  0.860,
  20,
  true,
  'san_jose_fusj5_south_northeast_topology_poc_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17250,
  '0040',
  '0040-A',
  '0040-A-1',
  'SAN JOSE - MORAVIA - DULCE NOMBRE DE CORONADO',
  'SAN JOSE',
  'MORAVIA',
  'ida',
  'SAN JOSE - MORAVIA - DULCE NOMBRE DE CORONADO / IDA POC',
  'local',
  0.860,
  20,
  false,
  'san_jose_fusj5_south_northeast_topology_poc_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17251,
  '0040',
  '0040-A',
  '0040-A-2',
  'SAN JOSE - MORAVIA - DULCE NOMBRE DE CORONADO',
  'MORAVIA',
  'SAN JOSE',
  'vuelta',
  'SAN JOSE - MORAVIA - DULCE NOMBRE DE CORONADO / VUELTA POC',
  'local',
  0.860,
  20,
  true,
  'san_jose_fusj5_south_northeast_topology_poc_v1'
);

with stop_seed(area_id, parada_id) as (
  values
    (-905101::bigint, -42218::bigint),
    (-905102::bigint, -3769::bigint),
    (-905103::bigint, -3641::bigint),
    (-905104::bigint, -200003551::bigint),
    (-905105::bigint, -200002021::bigint),
    (-905106::bigint, -21331::bigint),
    (-905107::bigint, -200018348::bigint),
    (-905108::bigint, 1143::bigint),
    (-905109::bigint, 1811::bigint)
),
source_stops as (
  select
    s.area_id,
    s.parada_id,
    p.nombre,
    p.lat::double precision as lat,
    p.lng::double precision as lng
  from stop_seed s
  join public.paradas p
    on p.id = s.parada_id
)
insert into public.planner_stop_areas (
  id,
  area_key,
  cluster_level,
  area_name,
  lat,
  lng,
  radius_m,
  stop_count,
  route_count,
  family_count,
  shared_corridor_stop_count,
  dominant_name_share,
  activo,
  source,
  metadata
)
select
  area_id,
  'fusj5_manual_area_' || abs(parada_id)::text,
  'micro',
  coalesce(nombre, 'FU-SJ5 transfer'),
  lat,
  lng,
  20,
  1,
  1,
  1,
  0,
  1,
  true,
  'manual',
  jsonb_build_object(
    'seed_source', 'san_jose_fusj5_south_northeast_topology_poc_v1',
    'linked_parada_id', parada_id
  )
from source_stops;

with stop_seed(area_id, boarding_point_id, parada_id) as (
  values
    (-905101::bigint, -905201::bigint, -42218::bigint),
    (-905102::bigint, -905202::bigint, -3769::bigint),
    (-905103::bigint, -905203::bigint, -3641::bigint),
    (-905104::bigint, -905204::bigint, -200003551::bigint),
    (-905105::bigint, -905205::bigint, -200002021::bigint),
    (-905106::bigint, -905206::bigint, -21331::bigint),
    (-905107::bigint, -905207::bigint, -200018348::bigint),
    (-905108::bigint, -905208::bigint, 1143::bigint),
    (-905109::bigint, -905209::bigint, 1811::bigint)
),
source_stops as (
  select
    s.area_id,
    s.boarding_point_id,
    s.parada_id,
    p.nombre,
    p.lat::double precision as lat,
    p.lng::double precision as lng
  from stop_seed s
  join public.paradas p
    on p.id = s.parada_id
)
insert into public.planner_boarding_points (
  id,
  boarding_key,
  area_id,
  linked_parada_id,
  boarding_name,
  lat,
  lng,
  stop_count,
  route_count,
  family_count,
  activo,
  source,
  metadata
)
select
  boarding_point_id,
  'fusj5_manual_boarding_' || abs(parada_id)::text,
  area_id,
  parada_id,
  coalesce(nombre, 'FU-SJ5 transfer'),
  lat,
  lng,
  1,
  1,
  1,
  true,
  'manual',
  jsonb_build_object(
    'seed_source', 'san_jose_fusj5_south_northeast_topology_poc_v1',
    'linked_parada_id', parada_id
  )
from source_stops;

insert into public.planner_transfer_edges (
  id,
  from_boarding_point_id,
  to_boarding_point_id,
  from_area_id,
  to_area_id,
  transfer_type,
  distance_m,
  confidence,
  activo,
  source,
  metadata
) values
  (-905301, -905201, -905204, -905101, -905104, 'nearby_walk', 245, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905302, -905204, -905201, -905104, -905101, 'nearby_walk', 245, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905303, -905202, -905204, -905102, -905104, 'nearby_walk', 265, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905304, -905204, -905202, -905104, -905102, 'nearby_walk', 265, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905305, -905201, -905205, -905101, -905105, 'nearby_walk', 274, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905306, -905205, -905201, -905105, -905101, 'nearby_walk', 274, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905307, -905203, -905205, -905103, -905105, 'nearby_walk', 281, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905308, -905205, -905203, -905105, -905103, 'nearby_walk', 281, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905309, -905206, -905204, -905106, -905104, 'nearby_walk', 292, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905310, -905204, -905206, -905104, -905106, 'nearby_walk', 292, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905311, -905207, -905204, -905107, -905104, 'nearby_walk', 358, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905312, -905204, -905207, -905104, -905107, 'nearby_walk', 358, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905313, -905208, -905205, -905108, -905105, 'nearby_walk', 592, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905314, -905205, -905208, -905105, -905108, 'nearby_walk', 592, 0.95, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905315, -905209, -905205, -905109, -905105, 'nearby_walk', 793, 0.90, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb),
  (-905316, -905205, -905209, -905105, -905109, 'nearby_walk', 793, 0.90, true, 'manual', '{"seed_source":"san_jose_fusj5_south_northeast_topology_poc_v1"}'::jsonb);

do $$
declare
  v_routes integer;
  v_patterns integer;
  v_windows integer;
  v_bindings integer;
  v_route_points integer;
  v_transfer_edges integer;
  v_boarding_points integer;
  v_stop_areas integer;
begin
  select count(*)
  into v_routes
  from public.rutas
  where id in (17230, 17232, 17234, 17235, 17250, 17251);

  select count(*)
  into v_patterns
  from public.route_patterns
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1'
    and activo;

  select count(*)
  into v_windows
  from public.service_windows sw
  join public.route_patterns rp
    on rp.id = sw.pattern_id
  where rp.metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1'
    and sw.activo;

  select count(*)
  into v_bindings
  from public.planner_ctp_preview_route_bindings
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1'
    and activo;

  select count(*)
  into v_route_points
  from public.ruta_puntos
  where ruta_id in (17230, 17232, 17234, 17235, 17250, 17251);

  select count(*)
  into v_transfer_edges
  from public.planner_transfer_edges
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1'
    and activo;

  select count(*)
  into v_boarding_points
  from public.planner_boarding_points
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1'
    and activo;

  select count(*)
  into v_stop_areas
  from public.planner_stop_areas
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1'
    and activo;

  if v_routes <> 6
    or v_patterns <> 6
    or v_windows <> 36
    or v_bindings <> 6
    or v_route_points < 300
    or v_transfer_edges <> 16
    or v_boarding_points <> 9
    or v_stop_areas <> 9 then
    raise exception 'FU-SJ5 topology POC postcondition failed: routes %, patterns %, windows %, bindings %, route_points %, transfer_edges %, boarding_points %, stop_areas %',
      v_routes, v_patterns, v_windows, v_bindings, v_route_points, v_transfer_edges, v_boarding_points, v_stop_areas;
  end if;
end $$;

commit;
