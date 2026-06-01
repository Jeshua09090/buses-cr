-- Rollback for the local investigation package only.
-- See san_jose_fusj1_sabana_pavas_runtime_promotion_v1.sql for the remote-apply warning.

set search_path = public, extensions;

begin;

do $$
declare
  v_routes integer;
  v_patterns integer;
  v_windows integer;
  v_bindings integer;
begin
  select count(*)
  into v_routes
  from public.rutas
  where id in (
    17071,
    17141, 17142, 17143, 17144, 17145, 17146, 17147, 17148, 17149, 17150
  );

  select count(*)
  into v_patterns
  from public.route_patterns
  where metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1';

  select count(*)
  into v_windows
  from public.service_windows sw
  join public.route_patterns rp
    on rp.id = sw.pattern_id
  where rp.metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1';

  select count(*)
  into v_bindings
  from public.planner_ctp_preview_route_bindings
  where metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1';

  if v_routes <> 11 or v_patterns <> 11 or v_windows <> 66 or v_bindings <> 11 then
    raise exception 'FU-SJ1 rollback precondition failed: routes %, patterns %, windows %, bindings %',
      v_routes, v_patterns, v_windows, v_bindings;
  end if;
end $$;

delete from public.route_patterns
where metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1';

delete from public.planner_ctp_preview_route_bindings
where metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1';

delete from public.ruta_puntos
where ruta_id in (
  17071,
  17141, 17142, 17143, 17144, 17145, 17146, 17147, 17148, 17149, 17150
);

delete from public.rutas
where id in (
  17071,
  17141, 17142, 17143, 17144, 17145, 17146, 17147, 17148, 17149, 17150
);

update public.paradas p
set metadata = p.metadata->'san_jose_fusj1_prior_metadata',
    updated_at = timezone('utc'::text, now())
where p.id < 0
  and p.metadata ? 'san_jose_fusj1_prior_metadata'
  and p.metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1';

delete from public.paradas p
where p.id < 0
  and p.metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
  and not (p.metadata ? 'san_jose_fusj1_prior_metadata')
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
begin
  select count(*)
  into v_routes
  from public.rutas
  where id in (
    17071,
    17141, 17142, 17143, 17144, 17145, 17146, 17147, 17148, 17149, 17150
  );

  select count(*)
  into v_patterns
  from public.route_patterns
  where metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1';

  select count(*)
  into v_windows
  from public.service_windows
  where metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1';

  select count(*)
  into v_bindings
  from public.planner_ctp_preview_route_bindings
  where metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
    or ruta_id in (
      17071,
      17141, 17142, 17143, 17144, 17145, 17146, 17147, 17148, 17149, 17150
    );

  select count(*)
  into v_route_points
  from public.ruta_puntos
  where ruta_id in (
    17071,
    17141, 17142, 17143, 17144, 17145, 17146, 17147, 17148, 17149, 17150
  );

  select count(*)
  into v_unreferenced_synthetic_stops
  from public.paradas p
  where p.id < 0
    and p.metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
    and not (p.metadata ? 'san_jose_fusj1_prior_metadata')
    and not exists (
      select 1
      from public.route_pattern_stops rps
      where rps.parada_id = p.id
    );

  if v_routes <> 0
    or v_patterns <> 0
    or v_windows <> 0
    or v_bindings <> 0
    or v_route_points <> 0
    or v_unreferenced_synthetic_stops <> 0 then
    raise exception 'FU-SJ1 rollback postcondition failed: routes %, patterns %, windows %, bindings %, route_points %, unreferenced_stops %',
      v_routes, v_patterns, v_windows, v_bindings, v_route_points, v_unreferenced_synthetic_stops;
  end if;
end $$;

commit;
