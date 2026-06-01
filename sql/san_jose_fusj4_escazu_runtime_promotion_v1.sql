-- FU-SJ4: promote the minimal Escazu Centro connector proven by the local POC.
--
-- Moovit lists SAN JOSE - ESCAZU CENTRO near Escazu bus stops, and CTP staging
-- has matching 0009-I variants with stops within roughly 300m of Escazu centro.
-- The inferred CTP stop order starts on the Escazu side and ends near San Jose,
-- so this package promotes both variants with p_reverse_stop_order = true.

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
  where id in (17240, 17241);

  if v_existing_ids > 0 then
    raise exception 'FU-SJ4 Escazu precondition failed: % target ruta ids already exist', v_existing_ids;
  end if;

  select count(*)
  into v_seed_patterns
  from public.route_patterns
  where metadata->>'seed_source' = 'san_jose_fusj4_escazu_runtime_promotion_v1';

  if v_seed_patterns > 0 then
    raise exception 'FU-SJ4 Escazu precondition failed: % seed patterns already exist', v_seed_patterns;
  end if;

  select count(*)
  into v_missing_variants
  from (
    values ('0009-I-1'), ('0009-I-2')
  ) as expected(variant_code)
  where not exists (
    select 1
    from public.staging_ctp_official_route_variants rv
    where rv.variant_code = expected.variant_code
  );

  if v_missing_variants > 0 then
    raise exception 'FU-SJ4 Escazu precondition failed: % target variants missing', v_missing_variants;
  end if;

  select count(*)
  into v_missing_inferred
  from (
    values ('0009-I-1', 35), ('0009-I-2', 35)
  ) as expected(variant_code, min_stops)
  where (
    select count(*)
    from public.staging_ctp_route_stops_inferred i
    where i.variant_code = expected.variant_code
  ) < expected.min_stops;

  if v_missing_inferred > 0 then
    raise exception 'FU-SJ4 Escazu precondition failed: % target variants have too few inferred stops',
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
  where rs.variant_code in ('0009-I-1', '0009-I-2')
)
update public.paradas p
set metadata = p.metadata || jsonb_build_object(
      'san_jose_fusj4_escazu_prior_metadata',
      p.metadata
    ),
    updated_at = timezone('utc'::text, now())
from target_stop_ids t
where p.id = t.parada_id
  and not (p.metadata ? 'san_jose_fusj4_escazu_prior_metadata');

select public.planner_promote_ctp_variant_to_runtime(
  17240,
  '0009',
  '0009-I',
  '0009-I-1',
  'SAN JOSE - ESCAZU CENTRO',
  'SAN JOSE',
  'ESCAZU',
  'ida',
  'SAN JOSE - ESCAZU CENTRO / IDA',
  'local',
  0.860,
  20,
  true,
  'san_jose_fusj4_escazu_runtime_promotion_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  17241,
  '0009',
  '0009-I',
  '0009-I-2',
  'SAN JOSE - ESCAZU CENTRO',
  'SAN JOSE',
  'ESCAZU',
  'vuelta',
  'SAN JOSE - ESCAZU CENTRO / VUELTA',
  'local',
  0.860,
  20,
  true,
  'san_jose_fusj4_escazu_runtime_promotion_v1'
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
  where id in (17240, 17241);

  select count(*)
  into v_patterns
  from public.route_patterns
  where metadata->>'seed_source' = 'san_jose_fusj4_escazu_runtime_promotion_v1'
    and activo;

  select count(*)
  into v_windows
  from public.service_windows sw
  join public.route_patterns rp
    on rp.id = sw.pattern_id
  where rp.metadata->>'seed_source' = 'san_jose_fusj4_escazu_runtime_promotion_v1'
    and sw.activo;

  select count(*)
  into v_bindings
  from public.planner_ctp_preview_route_bindings
  where metadata->>'seed_source' = 'san_jose_fusj4_escazu_runtime_promotion_v1'
    and activo;

  select count(*)
  into v_route_points
  from public.ruta_puntos
  where ruta_id in (17240, 17241);

  if v_routes <> 2 or v_patterns <> 2 or v_windows <> 12 or v_bindings <> 2 or v_route_points < 70 then
    raise exception 'FU-SJ4 Escazu postcondition failed: routes %, patterns %, windows %, bindings %, route_points %',
      v_routes, v_patterns, v_windows, v_bindings, v_route_points;
  end if;
end $$;

commit;
