set search_path = public, extensions;

create or replace function public.planner_ctp_variant_runtime_scanner(
  p_scope_stop_prefix text default 'PBA-3',
  p_scope_buffer_m integer default 120
)
returns table (
  route_code_normalized text,
  route_code text,
  variant_family_code text,
  variant_code text,
  direction_raw text,
  direction_normalized text,
  description_raw text,
  scope_stop_count integer,
  scope_stop_examples text,
  preview_route_id integer,
  preview_route_ids text,
  runtime_route_name text,
  has_exact_preview_binding boolean,
  has_family_preview_binding boolean,
  has_route_row boolean,
  has_pattern boolean,
  pattern_count integer,
  has_service_windows boolean,
  service_window_count integer,
  coverage_status text,
  missing_pieces text[]
)
language sql
stable
as $$
with scoped_stops as (
  select
    s.source_id,
    s.source_identifier,
    s.description_raw,
    s.geo
  from public.staging_ctp_official_stops s
  where s.source_identifier like p_scope_stop_prefix || '%'
),
scoped_variants as (
  select
    rv.source_id,
    rv.route_code,
    rv.route_code_normalized,
    rv.variant_family_code,
    rv.variant_code,
    rv.direction_raw,
    rv.direction_normalized,
    rv.description_raw,
    count(distinct ss.source_id)::integer as scope_stop_count,
    string_agg(
      distinct coalesce(ss.description_raw, ss.source_identifier),
      ' | '
      order by coalesce(ss.description_raw, ss.source_identifier)
    ) as scope_stop_examples
  from public.staging_ctp_official_route_variants rv
  join scoped_stops ss
    on st_dwithin(
      coalesce(
        rv.inference_geo,
        st_transform(coalesce(rv.geom_axis, rv.geom), 4326)::geography
      ),
      ss.geo,
      p_scope_buffer_m
    )
  group by
    rv.source_id,
    rv.route_code,
    rv.route_code_normalized,
    rv.variant_family_code,
    rv.variant_code,
    rv.direction_raw,
    rv.direction_normalized,
    rv.description_raw
),
preview_exact as (
  select
    m.variant_code,
    min(m.ruta_id)::integer as preview_route_id,
    string_agg(distinct m.ruta_id::text, ' | ' order by m.ruta_id::text) as preview_route_ids
  from public.ctp_preview_route_variant_map() m
  where m.variant_code is not null
    and m.preview_scope = 'route_stops'
  group by m.variant_code
),
preview_family as (
  select
    m.variant_family_code,
    string_agg(distinct m.ruta_id::text, ' | ' order by m.ruta_id::text) as family_route_ids
  from public.ctp_preview_route_variant_map() m
  where m.variant_family_code is not null
    and m.preview_scope = 'route_stops'
  group by m.variant_family_code
),
route_rows as (
  select
    r.id as ruta_id,
    r.nombre_ruta
  from public.rutas r
),
pattern_summary as (
  select
    rp.ruta_id,
    count(*)::integer as pattern_count
  from public.route_patterns rp
  group by rp.ruta_id
),
service_window_summary as (
  select
    rp.ruta_id,
    count(sw.*)::integer as service_window_count
  from public.route_patterns rp
  join public.service_windows sw
    on sw.pattern_id = rp.id
  group by rp.ruta_id
)
select
  sv.route_code_normalized,
  sv.route_code,
  sv.variant_family_code,
  sv.variant_code,
  sv.direction_raw,
  sv.direction_normalized,
  sv.description_raw,
  sv.scope_stop_count,
  sv.scope_stop_examples,
  pe.preview_route_id,
  pe.preview_route_ids,
  rr.nombre_ruta as runtime_route_name,
  (pe.preview_route_id is not null) as has_exact_preview_binding,
  (pf.family_route_ids is not null) as has_family_preview_binding,
  (rr.ruta_id is not null) as has_route_row,
  (coalesce(ps.pattern_count, 0) > 0) as has_pattern,
  coalesce(ps.pattern_count, 0) as pattern_count,
  (coalesce(sws.service_window_count, 0) > 0) as has_service_windows,
  coalesce(sws.service_window_count, 0) as service_window_count,
  case
    when pe.preview_route_id is not null
      and rr.ruta_id is not null
      and coalesce(ps.pattern_count, 0) > 0
      and coalesce(sws.service_window_count, 0) > 0
      then 'seeded_complete'
    when pe.preview_route_id is not null
      and (
        rr.ruta_id is not null
        or coalesce(ps.pattern_count, 0) > 0
        or coalesce(sws.service_window_count, 0) > 0
      )
      then 'seeded_partial'
    when pe.preview_route_id is not null
      then 'preview_bound_missing_runtime'
    when pf.family_route_ids is not null
      then 'family_only'
    else 'missing_seed'
  end as coverage_status,
  array_remove(
    array[
      case when pe.preview_route_id is null then 'missing_exact_preview_binding' end,
      case when pe.preview_route_id is null and pf.family_route_ids is not null then 'family_has_other_seeded_variant' end,
      case when pe.preview_route_id is not null and rr.ruta_id is null then 'missing_ruta_row' end,
      case when pe.preview_route_id is not null and coalesce(ps.pattern_count, 0) = 0 then 'missing_route_patterns' end,
      case when pe.preview_route_id is not null and coalesce(sws.service_window_count, 0) = 0 then 'missing_service_windows' end
    ],
    null
  ) as missing_pieces
from scoped_variants sv
left join preview_exact pe
  on pe.variant_code = sv.variant_code
left join preview_family pf
  on pf.variant_family_code = sv.variant_family_code
left join route_rows rr
  on rr.ruta_id = pe.preview_route_id
left join pattern_summary ps
  on ps.ruta_id = pe.preview_route_id
left join service_window_summary sws
  on sws.ruta_id = pe.preview_route_id
order by
  sv.route_code_normalized asc,
  sv.variant_family_code asc nulls last,
  sv.variant_code asc;
$$;

comment on function public.planner_ctp_variant_runtime_scanner(text, integer) is
  'Escanea variantes oficiales del CTP dentro de un scope geografico derivado de paradas oficiales y compara su cobertura contra preview map, rutas, route_patterns y service_windows.';

create or replace view public.planner_ctp_cartago_variant_runtime_scan as
select *
from public.planner_ctp_variant_runtime_scanner('PBA-3', 120);

comment on view public.planner_ctp_cartago_variant_runtime_scan is
  'Scanner de cobertura runtime para variantes oficiales del CTP que pasan por Cartago (scope PBA-3%).';

create or replace view public.planner_ctp_cartago_variant_runtime_scan_summary as
select
  coverage_status,
  count(*)::integer as variant_count,
  string_agg(variant_code, ' | ' order by variant_code) as variants
from public.planner_ctp_cartago_variant_runtime_scan
group by coverage_status
order by coverage_status;

comment on view public.planner_ctp_cartago_variant_runtime_scan_summary is
  'Resumen por estado de cobertura del scanner Cartago: seeded_complete, seeded_partial, family_only, missing_seed, etc.';

grant execute on function public.planner_ctp_variant_runtime_scanner(text, integer) to anon, authenticated;
grant select on public.planner_ctp_cartago_variant_runtime_scan to anon, authenticated;
grant select on public.planner_ctp_cartago_variant_runtime_scan_summary to anon, authenticated;
