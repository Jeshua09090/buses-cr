-- FU-SJ1a: promote CTP 0007-B-1 Sabana/Estadio connector only.
--
-- This intentionally excludes 0014 Pavas variants. Local investigation on
-- 2026-05-22 found 0014 has a direction-specific runtime gap for
-- San Jose/Cartago -> Pavas, while 0007-B-1 validated cleanly for
-- Estadio Nacional and ICE Sabana.

set search_path = public, extensions;

begin;

do $$
declare
  v_existing_ids integer;
  v_missing_variants integer;
  v_inferred_stops integer;
begin
  select count(*)
  into v_existing_ids
  from public.rutas
  where id = 17071;

  if v_existing_ids > 0 then
    raise exception 'FU-SJ1a precondition failed: target ruta id 17071 already exists';
  end if;

  select count(*)
  into v_missing_variants
  from (
    values ('0007-B-1')
  ) as expected(variant_code)
  where not exists (
    select 1
    from public.staging_ctp_official_route_variants rv
    where rv.variant_code = expected.variant_code
  );

  if v_missing_variants > 0 then
    raise exception 'FU-SJ1a precondition failed: target CTP variant 0007-B-1 missing';
  end if;

  select count(*)
  into v_inferred_stops
  from public.staging_ctp_route_stops_inferred i
  where i.variant_code = '0007-B-1';

  if v_inferred_stops < 40 then
    raise exception 'FU-SJ1a precondition failed: inferred stops for 0007-B-1 too low: %', v_inferred_stops;
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
  where rs.variant_code = '0007-B-1'
)
update public.paradas p
set metadata = p.metadata || jsonb_build_object(
      'san_jose_fusj1a_prior_metadata',
      p.metadata
    ),
    updated_at = timezone('utc'::text, now())
from target_stop_ids t
where p.id = t.parada_id
  and not (p.metadata ? 'san_jose_fusj1a_prior_metadata');

select public.planner_promote_ctp_variant_to_runtime(
  17071,
  '0007',
  '0007-B',
  '0007-B-1',
  'SAN JOSE - SABANA - ESTADIO',
  'SAN JOSE',
  'SABANA',
  'loop',
  'SAN JOSE - SABANA - ESTADIO / ANILLO',
  'local',
  0.880,
  20,
  false,
  'san_jose_fusj1a_sabana_estadio_runtime_promotion_v1'
);

do $$
declare
  v_routes integer;
  v_patterns integer;
  v_windows integer;
  v_bindings integer;
  v_route_points integer;
begin
  select count(*)
  into v_routes
  from public.rutas
  where id = 17071;

  select count(*)
  into v_patterns
  from public.route_patterns
  where metadata->>'seed_source' = 'san_jose_fusj1a_sabana_estadio_runtime_promotion_v1'
    and activo;

  select count(*)
  into v_windows
  from public.service_windows sw
  join public.route_patterns rp
    on rp.id = sw.pattern_id
  where rp.metadata->>'seed_source' = 'san_jose_fusj1a_sabana_estadio_runtime_promotion_v1'
    and sw.activo;

  select count(*)
  into v_bindings
  from public.planner_ctp_preview_route_bindings
  where metadata->>'seed_source' = 'san_jose_fusj1a_sabana_estadio_runtime_promotion_v1'
    and activo;

  select count(*)
  into v_route_points
  from public.ruta_puntos
  where ruta_id = 17071;

  if v_routes <> 1 or v_patterns <> 1 or v_windows <> 6 or v_bindings <> 1 or v_route_points < 40 then
    raise exception 'FU-SJ1a postcondition failed: routes %, patterns %, windows %, bindings %, route_points %',
      v_routes, v_patterns, v_windows, v_bindings, v_route_points;
  end if;
end $$;

commit;
