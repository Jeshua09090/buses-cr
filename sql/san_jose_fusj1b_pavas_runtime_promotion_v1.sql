-- FU-SJ1b: promote CTP 0014-B/C Pavas Zona 1/2 connectors.
--
-- This package intentionally promotes only the minimal Pavas set that validated
-- in the reverse-order POC. It excludes 0014-A/D/E and the Moovit-observed
-- PAVAS - UNIVERSIDAD DE COSTA RICA line, which is not present in current CTP
-- staging and remains a separate source gap.
--
-- Step 0 found the staged 0014-B/C variants are ordered Pavas -> San Jose.
-- Promoting them with p_reverse_stop_order = true creates usable
-- San Jose/Cartago -> Pavas downstream drops while preserving the original CTP
-- stop geometry.

set search_path = public, extensions;

begin;

do $$
declare
  v_existing_ids integer;
  v_seed_patterns integer;
  v_missing_variants integer;
  v_missing_inferred integer;
begin
  select count(*)
  into v_existing_ids
  from public.rutas
  where id in (17143, 17144, 17145, 17146);

  if v_existing_ids > 0 then
    raise exception 'FU-SJ1b Pavas precondition failed: % target ruta ids already exist', v_existing_ids;
  end if;

  select count(*)
  into v_seed_patterns
  from public.route_patterns
  where metadata->>'seed_source' = 'san_jose_fusj1b_pavas_runtime_promotion_v1';

  if v_seed_patterns > 0 then
    raise exception 'FU-SJ1b Pavas precondition failed: % seed patterns already exist', v_seed_patterns;
  end if;

  select count(*)
  into v_missing_variants
  from (
    values
      ('0014-B-1'), ('0014-B-2'),
      ('0014-C-1'), ('0014-C-2')
  ) as expected(variant_code)
  where not exists (
    select 1
    from public.staging_ctp_official_route_variants rv
    where rv.variant_code = expected.variant_code
  );

  if v_missing_variants > 0 then
    raise exception 'FU-SJ1b Pavas precondition failed: % target variants missing', v_missing_variants;
  end if;

  select count(*)
  into v_missing_inferred
  from (
    values
      ('0014-B-1', 35), ('0014-B-2', 35),
      ('0014-C-1', 35), ('0014-C-2', 35)
  ) as expected(variant_code, min_stops)
  where (
    select count(*)
    from public.staging_ctp_route_stops_inferred i
    where i.variant_code = expected.variant_code
  ) < expected.min_stops;

  if v_missing_inferred > 0 then
    raise exception 'FU-SJ1b Pavas precondition failed: % target variants have too few inferred stops',
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
    '0014-B-1', '0014-B-2',
    '0014-C-1', '0014-C-2'
  )
)
update public.paradas p
set metadata = p.metadata || jsonb_build_object(
      'san_jose_fusj1b_pavas_prior_metadata',
      p.metadata
    ),
    updated_at = timezone('utc'::text, now())
from target_stop_ids t
where p.id = t.parada_id
  and not (p.metadata ? 'san_jose_fusj1b_pavas_prior_metadata');

select public.planner_promote_ctp_variant_to_runtime(
  17143,
  '0014',
  '0014-B',
  '0014-B-1',
  'SAN JOSE - PAVAS ZONA 1',
  'SAN JOSE',
  'PAVAS',
  'ida',
  'SAN JOSE - PAVAS ZONA 1 / IDA',
  'local',
  0.870,
  18,
  true,
  'san_jose_fusj1b_pavas_runtime_promotion_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17144,
  '0014',
  '0014-B',
  '0014-B-2',
  'SAN JOSE - PAVAS ZONA 1',
  'SAN JOSE',
  'PAVAS',
  'vuelta',
  'SAN JOSE - PAVAS ZONA 1 / VUELTA',
  'local',
  0.870,
  18,
  true,
  'san_jose_fusj1b_pavas_runtime_promotion_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17145,
  '0014',
  '0014-C',
  '0014-C-1',
  'SAN JOSE - PAVAS ZONA 2',
  'SAN JOSE',
  'PAVAS',
  'ida',
  'SAN JOSE - PAVAS ZONA 2 / IDA',
  'local',
  0.870,
  18,
  true,
  'san_jose_fusj1b_pavas_runtime_promotion_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17146,
  '0014',
  '0014-C',
  '0014-C-2',
  'SAN JOSE - PAVAS ZONA 2',
  'SAN JOSE',
  'PAVAS',
  'vuelta',
  'SAN JOSE - PAVAS ZONA 2 / VUELTA',
  'local',
  0.870,
  18,
  true,
  'san_jose_fusj1b_pavas_runtime_promotion_v1'
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
  where id in (17143, 17144, 17145, 17146);

  select count(*)
  into v_patterns
  from public.route_patterns
  where metadata->>'seed_source' = 'san_jose_fusj1b_pavas_runtime_promotion_v1'
    and activo;

  select count(*)
  into v_windows
  from public.service_windows sw
  join public.route_patterns rp
    on rp.id = sw.pattern_id
  where rp.metadata->>'seed_source' = 'san_jose_fusj1b_pavas_runtime_promotion_v1'
    and sw.activo;

  select count(*)
  into v_bindings
  from public.planner_ctp_preview_route_bindings
  where metadata->>'seed_source' = 'san_jose_fusj1b_pavas_runtime_promotion_v1'
    and activo;

  select count(*)
  into v_route_points
  from public.ruta_puntos
  where ruta_id in (17143, 17144, 17145, 17146);

  if v_routes <> 4 or v_patterns <> 4 or v_windows <> 24 or v_bindings <> 4 or v_route_points < 100 then
    raise exception 'FU-SJ1b Pavas postcondition failed: routes %, patterns %, windows %, bindings %, route_points %',
      v_routes, v_patterns, v_windows, v_bindings, v_route_points;
  end if;
end $$;

commit;
