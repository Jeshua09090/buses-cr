-- LOCAL INVESTIGATION PACKAGE ONLY.
-- Do not apply this file to remote as-is.
--
-- 2026-05-22 Pavas investigation found that the promoted 0014 variants all
-- behave as Pavas -> San Jose service in the runtime. That solves neither
-- Cartago -> Pavas nor San Jose -> Pavas. Split a remote-ready FU-SJ1a
-- Sabana/Estadio package from this file before any remote apply.

set search_path = public, extensions;

begin;

do $$
declare
  v_existing_ids integer;
  v_missing_variants integer;
  v_missing_inferred integer;
begin
  select count(*)
  into v_existing_ids
  from public.rutas
  where id in (
    17071,
    17141, 17142, 17143, 17144, 17145, 17146, 17147, 17148, 17149, 17150
  );

  if v_existing_ids > 0 then
    raise exception 'FU-SJ1 precondition failed: % target rutas ids already exist', v_existing_ids;
  end if;

  select count(*)
  into v_missing_variants
  from (
    values
      ('0007-B-1'),
      ('0014-A-1'), ('0014-A-2'),
      ('0014-B-1'), ('0014-B-2'),
      ('0014-C-1'), ('0014-C-2'),
      ('0014-D-1'), ('0014-D-2'),
      ('0014-E-1'), ('0014-E-2')
  ) as expected(variant_code)
  where not exists (
    select 1
    from public.staging_ctp_official_route_variants rv
    where rv.variant_code = expected.variant_code
  );

  if v_missing_variants > 0 then
    raise exception 'FU-SJ1 precondition failed: % target CTP variants missing', v_missing_variants;
  end if;

  select count(*)
  into v_missing_inferred
  from (
    values
      ('0007-B-1', 40),
      ('0014-A-1', 40), ('0014-A-2', 40),
      ('0014-B-1', 35), ('0014-B-2', 35),
      ('0014-C-1', 35), ('0014-C-2', 35),
      ('0014-D-1', 30), ('0014-D-2', 30),
      ('0014-E-1', 30), ('0014-E-2', 30)
  ) as expected(variant_code, min_stops)
  where (
    select count(*)
    from public.staging_ctp_route_stops_inferred i
    where i.variant_code = expected.variant_code
  ) < expected.min_stops;

  if v_missing_inferred > 0 then
    raise exception 'FU-SJ1 precondition failed: % target variants have too few inferred stops', v_missing_inferred;
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
    '0007-B-1',
    '0014-A-1', '0014-A-2',
    '0014-B-1', '0014-B-2',
    '0014-C-1', '0014-C-2',
    '0014-D-1', '0014-D-2',
    '0014-E-1', '0014-E-2'
  )
)
update public.paradas p
set metadata = p.metadata || jsonb_build_object(
      'san_jose_fusj1_prior_metadata',
      p.metadata
    ),
    updated_at = timezone('utc'::text, now())
from target_stop_ids t
where p.id = t.parada_id
  and not (p.metadata ? 'san_jose_fusj1_prior_metadata');

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
  'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17141,
  '0014',
  '0014-A',
  '0014-A-1',
  'SAN JOSE - PAVAS - LOMAS DEL RIO',
  'SAN JOSE',
  'PAVAS',
  'ida',
  'SAN JOSE - PAVAS - LOMAS DEL RIO / IDA',
  'local',
  0.880,
  16,
  false,
  'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17142,
  '0014',
  '0014-A',
  '0014-A-2',
  'SAN JOSE - PAVAS - LOMAS DEL RIO',
  'PAVAS',
  'SAN JOSE',
  'vuelta',
  'SAN JOSE - PAVAS - LOMAS DEL RIO / VUELTA',
  'local',
  0.880,
  16,
  false,
  'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
);

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
  false,
  'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17144,
  '0014',
  '0014-B',
  '0014-B-2',
  'SAN JOSE - PAVAS ZONA 1',
  'PAVAS',
  'SAN JOSE',
  'vuelta',
  'SAN JOSE - PAVAS ZONA 1 / VUELTA',
  'local',
  0.870,
  18,
  false,
  'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
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
  false,
  'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17146,
  '0014',
  '0014-C',
  '0014-C-2',
  'SAN JOSE - PAVAS ZONA 2',
  'PAVAS',
  'SAN JOSE',
  'vuelta',
  'SAN JOSE - PAVAS ZONA 2 / VUELTA',
  'local',
  0.870,
  18,
  false,
  'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17147,
  '0014',
  '0014-D',
  '0014-D-1',
  'SAN JOSE - PAVAS - BOULEVARD - TOBIAS BOLANOS',
  'SAN JOSE',
  'PAVAS',
  'ida',
  'SAN JOSE - PAVAS BOULEVARD TOBIAS BOLANOS / IDA',
  'local',
  0.860,
  20,
  false,
  'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17148,
  '0014',
  '0014-D',
  '0014-D-2',
  'SAN JOSE - PAVAS - BOULEVARD - TOBIAS BOLANOS',
  'PAVAS',
  'SAN JOSE',
  'vuelta',
  'SAN JOSE - PAVAS BOULEVARD TOBIAS BOLANOS / VUELTA',
  'local',
  0.860,
  20,
  false,
  'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17149,
  '0014',
  '0014-E',
  '0014-E-1',
  'SAN JOSE - PAVAS - BOULEVARD - HOSPITAL PSIQUIATRICO',
  'SAN JOSE',
  'PAVAS',
  'ida',
  'SAN JOSE - PAVAS BOULEVARD HOSPITAL PSIQUIATRICO / IDA',
  'local',
  0.860,
  20,
  false,
  'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17150,
  '0014',
  '0014-E',
  '0014-E-2',
  'SAN JOSE - PAVAS - BOULEVARD - HOSPITAL PSIQUIATRICO',
  'PAVAS',
  'SAN JOSE',
  'vuelta',
  'SAN JOSE - PAVAS BOULEVARD HOSPITAL PSIQUIATRICO / VUELTA',
  'local',
  0.860,
  20,
  false,
  'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
);

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
  where metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
    and activo;

  select count(*)
  into v_windows
  from public.service_windows sw
  join public.route_patterns rp
    on rp.id = sw.pattern_id
  where rp.metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
    and sw.activo;

  select count(*)
  into v_bindings
  from public.planner_ctp_preview_route_bindings
  where metadata->>'seed_source' = 'san_jose_fusj1_sabana_pavas_runtime_promotion_v1'
    and activo;

  if v_routes <> 11 or v_patterns <> 11 or v_windows <> 66 or v_bindings <> 11 then
    raise exception 'FU-SJ1 postcondition failed: routes %, patterns %, windows %, bindings %',
      v_routes, v_patterns, v_windows, v_bindings;
  end if;
end $$;

commit;
