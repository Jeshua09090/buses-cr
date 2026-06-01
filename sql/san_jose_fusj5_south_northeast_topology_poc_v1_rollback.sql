-- Rollback for FU-SJ5 south/northeast topology local POC.
--
-- Removes only rows created by
-- san_jose_fusj5_south_northeast_topology_poc_v1.sql.

set search_path = public, extensions;

begin;

do $$
declare
  v_routes integer;
  v_patterns integer;
  v_windows integer;
  v_bindings integer;
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
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  select count(*)
  into v_windows
  from public.service_windows sw
  join public.route_patterns rp
    on rp.id = sw.pattern_id
  where rp.metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  select count(*)
  into v_bindings
  from public.planner_ctp_preview_route_bindings
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  select count(*)
  into v_transfer_edges
  from public.planner_transfer_edges
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  select count(*)
  into v_boarding_points
  from public.planner_boarding_points
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  select count(*)
  into v_stop_areas
  from public.planner_stop_areas
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  if v_routes <> 6
    or v_patterns <> 6
    or v_windows <> 36
    or v_bindings <> 6
    or v_transfer_edges <> 16
    or v_boarding_points <> 9
    or v_stop_areas <> 9 then
    raise exception 'FU-SJ5 topology POC rollback precondition failed: routes %, patterns %, windows %, bindings %, transfer_edges %, boarding_points %, stop_areas %',
      v_routes, v_patterns, v_windows, v_bindings, v_transfer_edges, v_boarding_points, v_stop_areas;
  end if;
end $$;

delete from public.planner_transfer_edges
where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

delete from public.planner_boarding_points
where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

delete from public.planner_stop_areas
where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

delete from public.route_patterns
where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

delete from public.planner_ctp_preview_route_bindings
where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

delete from public.ruta_puntos
where ruta_id in (17230, 17232, 17234, 17235, 17250, 17251);

delete from public.rutas
where id in (17230, 17232, 17234, 17235, 17250, 17251);

update public.paradas p
set metadata = p.metadata->'san_jose_fusj5_topology_prior_metadata',
    updated_at = timezone('utc'::text, now())
where p.id < 0
  and p.metadata ? 'san_jose_fusj5_topology_prior_metadata'
  and p.metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

delete from public.paradas p
where p.id < 0
  and p.metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1'
  and not (p.metadata ? 'san_jose_fusj5_topology_prior_metadata')
  and not exists (
    select 1
    from public.route_pattern_stops rps
    where rps.parada_id = p.id
  );

do $$
declare
  v_routes integer;
  v_patterns integer;
  v_windows integer;
  v_bindings integer;
  v_route_points integer;
  v_unreferenced_synthetic_stops integer;
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
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  select count(*)
  into v_windows
  from public.service_windows
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  select count(*)
  into v_bindings
  from public.planner_ctp_preview_route_bindings
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1'
    or ruta_id in (17230, 17232, 17234, 17235, 17250, 17251);

  select count(*)
  into v_route_points
  from public.ruta_puntos
  where ruta_id in (17230, 17232, 17234, 17235, 17250, 17251);

  select count(*)
  into v_unreferenced_synthetic_stops
  from public.paradas p
  where p.id < 0
    and p.metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1'
    and not (p.metadata ? 'san_jose_fusj5_topology_prior_metadata')
    and not exists (
      select 1
      from public.route_pattern_stops rps
      where rps.parada_id = p.id
    );

  select count(*)
  into v_transfer_edges
  from public.planner_transfer_edges
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  select count(*)
  into v_boarding_points
  from public.planner_boarding_points
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  select count(*)
  into v_stop_areas
  from public.planner_stop_areas
  where metadata->>'seed_source' = 'san_jose_fusj5_south_northeast_topology_poc_v1';

  if v_routes <> 0
    or v_patterns <> 0
    or v_windows <> 0
    or v_bindings <> 0
    or v_route_points <> 0
    or v_unreferenced_synthetic_stops <> 0
    or v_transfer_edges <> 0
    or v_boarding_points <> 0
    or v_stop_areas <> 0 then
    raise exception 'FU-SJ5 topology POC rollback postcondition failed: routes %, patterns %, windows %, bindings %, route_points %, unreferenced_stops %, transfer_edges %, boarding_points %, stop_areas %',
      v_routes, v_patterns, v_windows, v_bindings, v_route_points, v_unreferenced_synthetic_stops,
      v_transfer_edges, v_boarding_points, v_stop_areas;
  end if;
end $$;

commit;
