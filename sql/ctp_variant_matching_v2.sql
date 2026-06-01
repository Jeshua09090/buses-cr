set search_path = public, extensions;

create or replace function public.ctp_variant_family_code(p_variant_code text)
returns text
language sql
immutable
parallel safe
as $$
  select
    case
      when nullif(trim(coalesce(p_variant_code, '')), '') is null then null
      when trim(p_variant_code) ~ '^[^-]+-[^-]+-[0-9]+$' then regexp_replace(trim(p_variant_code), '-[0-9]+$', '')
      else trim(p_variant_code)
    end;
$$;

comment on function public.ctp_variant_family_code(text) is
  'Reduce un codigo de variante oficial del CTP a su familia operacional, por ejemplo 0300-L-1 -> 0300-L.';

create or replace function public.ctp_signed_lateral_offset_m(
  p_line geometry(LineString, 4326),
  p_point geometry(Point, 4326)
)
returns double precision
language plpgsql
immutable
parallel safe
as $$
declare
  v_fraction double precision;
  v_start_fraction double precision;
  v_end_fraction double precision;
  v_anchor geometry(Point, 3857);
  v_start_point geometry(Point, 3857);
  v_end_point geometry(Point, 3857);
  v_point geometry(Point, 3857);
  v_dx double precision;
  v_dy double precision;
  v_px double precision;
  v_py double precision;
  v_cross double precision;
  v_length double precision;
begin
  if p_line is null or p_point is null or st_npoints(p_line) < 2 then
    return null;
  end if;

  v_fraction := st_linelocatepoint(p_line, p_point);

  if v_fraction is null then
    return null;
  end if;

  v_start_fraction := greatest(0::double precision, v_fraction - 0.0015);
  v_end_fraction := least(1::double precision, v_fraction + 0.0015);

  if v_start_fraction = v_end_fraction then
    v_start_fraction := greatest(0::double precision, v_fraction - 0.003);
    v_end_fraction := least(1::double precision, v_fraction + 0.003);
  end if;

  v_anchor := st_transform(st_lineinterpolatepoint(p_line, v_fraction), 3857);
  v_start_point := st_transform(st_lineinterpolatepoint(p_line, v_start_fraction), 3857);
  v_end_point := st_transform(st_lineinterpolatepoint(p_line, v_end_fraction), 3857);
  v_point := st_transform(p_point, 3857);

  v_dx := st_x(v_end_point) - st_x(v_start_point);
  v_dy := st_y(v_end_point) - st_y(v_start_point);
  v_px := st_x(v_point) - st_x(v_anchor);
  v_py := st_y(v_point) - st_y(v_anchor);
  v_length := sqrt(power(v_dx, 2) + power(v_dy, 2));

  if v_length = 0 then
    return null;
  end if;

  v_cross := (v_dx * v_py) - (v_dy * v_px);
  return v_cross / v_length;
end;
$$;

comment on function public.ctp_signed_lateral_offset_m(geometry, geometry) is
  'Calcula el offset lateral firmado de una parada respecto al eje de una variante CTP para aproximar el lado de abordaje.';

alter table public.staging_ctp_official_route_variants
  add column if not exists variant_family_code text;

create index if not exists staging_ctp_official_route_variants_family_idx
  on public.staging_ctp_official_route_variants (route_code_normalized, variant_family_code, direction_normalized);

alter table public.staging_ctp_route_stop_candidates
  add column if not exists variant_family_code text;

alter table public.staging_ctp_route_stop_candidates
  add column if not exists same_family_variant_count integer;

alter table public.staging_ctp_route_stop_candidates
  add column if not exists family_direction_variant_count integer;

alter table public.staging_ctp_route_stop_candidates
  add column if not exists progress_bucket integer;

alter table public.staging_ctp_route_stop_candidates
  add column if not exists bucket_candidate_count integer;

alter table public.staging_ctp_route_stop_candidates
  add column if not exists signed_lateral_offset_m numeric(10, 2);

alter table public.staging_ctp_route_stop_candidates
  add column if not exists lateral_offset_m numeric(10, 2);

alter table public.staging_ctp_route_stop_candidates
  add column if not exists distance_score numeric(5, 4);

alter table public.staging_ctp_route_stop_candidates
  add column if not exists direction_score numeric(5, 4);

alter table public.staging_ctp_route_stop_candidates
  add column if not exists corridor_competition_score numeric(5, 4);

alter table public.staging_ctp_route_stop_candidates
  add column if not exists side_of_road_score numeric(5, 4);

alter table public.staging_ctp_route_stop_candidates
  add column if not exists progress_consistency_score numeric(5, 4);

alter table public.staging_ctp_route_stop_candidates
  add column if not exists manual_rule_score numeric(5, 4);

alter table public.staging_ctp_route_stop_candidates
  add column if not exists is_hub_stop boolean not null default false;

create index if not exists staging_ctp_route_stop_candidates_family_idx
  on public.staging_ctp_route_stop_candidates (variant_family_code, confidence_label, candidate_rank);

alter table public.staging_ctp_route_stops_inferred
  add column if not exists variant_family_code text;

create index if not exists staging_ctp_route_stops_inferred_family_idx
  on public.staging_ctp_route_stops_inferred (variant_family_code, stop_source_id);

create table if not exists public.staging_ctp_preferred_stop_variant_links (
  id bigint generated by default as identity primary key,
  stop_source_identifier text not null references public.staging_ctp_official_stops(source_identifier) on delete cascade,
  variant_code text not null references public.staging_ctp_official_route_variants(variant_code) on delete cascade,
  weight numeric(5, 4) not null default 0.1800,
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint staging_ctp_preferred_stop_variant_links_weight_chk
    check (weight >= 0 and weight <= 0.5000)
);

create unique index if not exists staging_ctp_preferred_stop_variant_links_unique_idx
  on public.staging_ctp_preferred_stop_variant_links (stop_source_identifier, variant_code);

drop trigger if exists set_updated_at_staging_ctp_preferred_stop_variant_links on public.staging_ctp_preferred_stop_variant_links;
create trigger set_updated_at_staging_ctp_preferred_stop_variant_links
before update on public.staging_ctp_preferred_stop_variant_links
for each row
execute function public.set_updated_at();

create table if not exists public.staging_ctp_blocked_stop_variant_links (
  id bigint generated by default as identity primary key,
  stop_source_identifier text not null references public.staging_ctp_official_stops(source_identifier) on delete cascade,
  variant_code text not null references public.staging_ctp_official_route_variants(variant_code) on delete cascade,
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists staging_ctp_blocked_stop_variant_links_unique_idx
  on public.staging_ctp_blocked_stop_variant_links (stop_source_identifier, variant_code);

drop trigger if exists set_updated_at_staging_ctp_blocked_stop_variant_links on public.staging_ctp_blocked_stop_variant_links;
create trigger set_updated_at_staging_ctp_blocked_stop_variant_links
before update on public.staging_ctp_blocked_stop_variant_links
for each row
execute function public.set_updated_at();

create table if not exists public.staging_ctp_transfer_hub_rules (
  id bigint generated by default as identity primary key,
  hub_key text not null,
  hub_name text not null,
  arrival_stop_identifier text not null references public.staging_ctp_official_stops(source_identifier) on delete cascade,
  departure_stop_identifier text not null references public.staging_ctp_official_stops(source_identifier) on delete cascade,
  from_route_code text,
  from_variant_family_code text,
  to_route_code text,
  to_variant_family_code text,
  walk_radius_m integer not null default 160,
  transfer_penalty_seconds integer not null default 90,
  priority integer not null default 100,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint staging_ctp_transfer_hub_rules_radius_chk
    check (walk_radius_m between 10 and 1000),
  constraint staging_ctp_transfer_hub_rules_penalty_chk
    check (transfer_penalty_seconds between 0 and 3600)
);

create index if not exists staging_ctp_transfer_hub_rules_lookup_idx
  on public.staging_ctp_transfer_hub_rules (
    active,
    coalesce(from_route_code, ''),
    coalesce(from_variant_family_code, ''),
    coalesce(to_route_code, ''),
    coalesce(to_variant_family_code, ''),
    priority
  );

drop trigger if exists set_updated_at_staging_ctp_transfer_hub_rules on public.staging_ctp_transfer_hub_rules;
create trigger set_updated_at_staging_ctp_transfer_hub_rules
before update on public.staging_ctp_transfer_hub_rules
for each row
execute function public.set_updated_at();

create table if not exists public.staging_ctp_gold_cases (
  id bigint generated by default as identity primary key,
  case_label text not null,
  case_type text not null default 'gold',
  origin_lat double precision not null,
  origin_lng double precision not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  expected_route_code text,
  expected_variant_family_code text,
  expected_direction_normalized text,
  expected_board_stop_identifier text,
  transfer_required boolean,
  expected_hub_key text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint staging_ctp_gold_cases_type_chk
    check (case_type in ('gold', 'same_street_trap', 'hub_anchor')),
  constraint staging_ctp_gold_cases_origin_lat_chk
    check (origin_lat between -90 and 90),
  constraint staging_ctp_gold_cases_origin_lng_chk
    check (origin_lng between -180 and 180),
  constraint staging_ctp_gold_cases_destination_lat_chk
    check (destination_lat between -90 and 90),
  constraint staging_ctp_gold_cases_destination_lng_chk
    check (destination_lng between -180 and 180)
);

drop trigger if exists set_updated_at_staging_ctp_gold_cases on public.staging_ctp_gold_cases;
create trigger set_updated_at_staging_ctp_gold_cases
before update on public.staging_ctp_gold_cases
for each row
execute function public.set_updated_at();

alter table public.staging_ctp_preferred_stop_variant_links enable row level security;
alter table public.staging_ctp_blocked_stop_variant_links enable row level security;
alter table public.staging_ctp_transfer_hub_rules enable row level security;
alter table public.staging_ctp_gold_cases enable row level security;

drop policy if exists staging_ctp_preferred_stop_variant_links_read_authenticated on public.staging_ctp_preferred_stop_variant_links;
create policy staging_ctp_preferred_stop_variant_links_read_authenticated
on public.staging_ctp_preferred_stop_variant_links
for select
to authenticated
using (true);

drop policy if exists staging_ctp_blocked_stop_variant_links_read_authenticated on public.staging_ctp_blocked_stop_variant_links;
create policy staging_ctp_blocked_stop_variant_links_read_authenticated
on public.staging_ctp_blocked_stop_variant_links
for select
to authenticated
using (true);

drop policy if exists staging_ctp_transfer_hub_rules_read_authenticated on public.staging_ctp_transfer_hub_rules;
create policy staging_ctp_transfer_hub_rules_read_authenticated
on public.staging_ctp_transfer_hub_rules
for select
to authenticated
using (true);

drop policy if exists staging_ctp_gold_cases_read_authenticated on public.staging_ctp_gold_cases;
create policy staging_ctp_gold_cases_read_authenticated
on public.staging_ctp_gold_cases
for select
to authenticated
using (true);

grant select on public.staging_ctp_preferred_stop_variant_links to authenticated;
grant select on public.staging_ctp_blocked_stop_variant_links to authenticated;
grant select on public.staging_ctp_transfer_hub_rules to authenticated;
grant select on public.staging_ctp_gold_cases to authenticated;

comment on table public.staging_ctp_preferred_stop_variant_links is
  'Reglas manuales de preferencia por parada->variante para resolver corredores ambiguos sin editar el dataset oficial.';

comment on table public.staging_ctp_blocked_stop_variant_links is
  'Reglas manuales para bloquear asociaciones parada->variante cuando la inferencia espacial se equivoca.';

comment on table public.staging_ctp_transfer_hub_rules is
  'Anclas explicitas de hubs y terminales para preferir transbordos reales sobre simples cercanias entre paradas.';

comment on table public.staging_ctp_gold_cases is
  'Casos oro y trampas conocidas para validar la calidad del matching y del planner antes de promover a runtime.';

create or replace function public.refresh_staging_ctp_variant_derived_fields()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '30min'
as $$
declare
  v_updated bigint := 0;
begin
  update public.staging_ctp_official_route_variants rv
  set
    inference_geo = coalesce(rv.geom_axis::geometry, rv.geom)::geography,
    axis_length_m = case
      when rv.geom_axis is not null then round(st_length(rv.geom_axis::geography, false)::numeric)::integer
      else null
    end,
    variant_family_code = public.ctp_variant_family_code(rv.variant_code),
    updated_at = clock_timestamp()
  where rv.inference_geo is distinct from coalesce(rv.geom_axis::geometry, rv.geom)::geography
     or rv.axis_length_m is distinct from case
       when rv.geom_axis is not null then round(st_length(rv.geom_axis::geography, false)::numeric)::integer
       else null
     end
     or rv.variant_family_code is distinct from public.ctp_variant_family_code(rv.variant_code);

  get diagnostics v_updated = row_count;
  return coalesce(v_updated, 0);
end;
$$;

comment on function public.refresh_staging_ctp_variant_derived_fields() is
  'Materializa geografia, longitud y familia operacional para mejorar el matching parada->variante del CTP.';

create or replace function public.refresh_staging_ctp_route_stop_candidates_batch(
  p_stop_source_min bigint,
  p_stop_source_max bigint,
  p_max_snap_m integer default 65,
  p_high_confidence_snap_m integer default 25
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '10min'
as $$
declare
  v_candidate_count bigint := 0;
  v_progress_bucket_m integer := 35;
begin
  if p_stop_source_min is null or p_stop_source_max is null or p_stop_source_min > p_stop_source_max then
    raise exception 'Rango invalido de source_id para paradas (% - %).', p_stop_source_min, p_stop_source_max;
  end if;

  if p_max_snap_m < 10 or p_max_snap_m > 250 then
    raise exception 'p_max_snap_m fuera de rango (%). Usa un valor entre 10 y 250 metros.', p_max_snap_m;
  end if;

  if p_high_confidence_snap_m < 5 or p_high_confidence_snap_m > p_max_snap_m then
    raise exception 'p_high_confidence_snap_m debe estar entre 5 y p_max_snap_m (%).', p_high_confidence_snap_m;
  end if;

  delete from public.staging_ctp_route_stop_candidates
  where stop_source_id between p_stop_source_min and p_stop_source_max;

  insert into public.staging_ctp_route_stop_candidates (
    stop_source_id,
    variant_source_id,
    route_code_normalized,
    variant_family_code,
    variant_code,
    direction_normalized,
    snap_distance_m,
    line_fraction,
    progress_m,
    route_axis_length_m,
    candidate_rank,
    nearby_variant_count,
    same_route_variant_count,
    same_family_variant_count,
    family_direction_variant_count,
    progress_bucket,
    bucket_candidate_count,
    nearest_distance_m,
    second_nearest_distance_m,
    distance_gap_m,
    signed_lateral_offset_m,
    lateral_offset_m,
    distance_score,
    direction_score,
    corridor_competition_score,
    side_of_road_score,
    progress_consistency_score,
    manual_rule_score,
    is_terminal_hint,
    is_hub_stop,
    is_geometry_ambiguous,
    confidence_score,
    confidence_label,
    ambiguity_reasons
  )
  with preferred_rules as (
    select
      pr.stop_source_identifier,
      pr.variant_code,
      max(pr.weight) as weight
    from public.staging_ctp_preferred_stop_variant_links pr
    where pr.active
    group by pr.stop_source_identifier, pr.variant_code
  ),
  blocked_rules as (
    select
      br.stop_source_identifier,
      br.variant_code
    from public.staging_ctp_blocked_stop_variant_links br
    where br.active
  ),
  hub_stops as (
    select distinct hub_stop_identifier
    from (
      select hr.arrival_stop_identifier as hub_stop_identifier
      from public.staging_ctp_transfer_hub_rules hr
      where hr.active
      union all
      select hr.departure_stop_identifier as hub_stop_identifier
      from public.staging_ctp_transfer_hub_rules hr
      where hr.active
    ) as unioned
  ),
  scoped_stops as (
    select
      s.source_id,
      s.source_identifier,
      s.description_normalized,
      s.geom,
      s.geo
    from public.staging_ctp_official_stops s
    where s.source_id between p_stop_source_min and p_stop_source_max
  ),
  candidate_base as (
    select
      s.source_id as stop_source_id,
      s.source_identifier,
      rv.source_id as variant_source_id,
      rv.route_code_normalized,
      rv.variant_family_code,
      rv.variant_code,
      rv.direction_normalized,
      s.description_normalized as stop_description_normalized,
      round(st_distance(s.geo, rv.inference_geo, false)::numeric, 2) as snap_distance_m,
      case
        when rv.geom_axis is not null then st_linelocatepoint(rv.geom_axis, s.geom)::numeric(9, 6)
        else null
      end as line_fraction,
      case
        when rv.geom_axis is not null then round((st_linelocatepoint(rv.geom_axis, s.geom) * rv.axis_length_m)::numeric)::integer
        else null
      end as progress_m,
      rv.axis_length_m as route_axis_length_m,
      round(offsets.signed_lateral_offset_m_raw::numeric, 2) as signed_lateral_offset_m,
      round(abs(offsets.signed_lateral_offset_m_raw)::numeric, 2) as lateral_offset_m,
      coalesce(pr.weight, 0) as preferred_rule_weight,
      (hs.hub_stop_identifier is not null) as is_hub_stop,
      (rv.geom_axis is null) as is_geometry_ambiguous
    from scoped_stops s
    join public.staging_ctp_official_route_variants rv
      on st_dwithin(s.geo, rv.inference_geo, p_max_snap_m, false)
    left join preferred_rules pr
      on pr.stop_source_identifier = s.source_identifier
     and pr.variant_code = rv.variant_code
    left join blocked_rules br
      on br.stop_source_identifier = s.source_identifier
     and br.variant_code = rv.variant_code
    left join hub_stops hs
      on hs.hub_stop_identifier = s.source_identifier
    left join lateral (
      select public.ctp_signed_lateral_offset_m(rv.geom_axis, s.geom) as signed_lateral_offset_m_raw
    ) offsets on true
    where br.variant_code is null
  ),
  ranked as (
    select
      cb.*,
      row_number() over (
        partition by cb.stop_source_id
        order by cb.snap_distance_m asc, cb.variant_source_id asc
      ) as candidate_rank,
      count(*) over (
        partition by cb.stop_source_id
      ) as nearby_variant_count,
      count(*) over (
        partition by cb.stop_source_id, cb.route_code_normalized
      ) as same_route_variant_count,
      count(*) over (
        partition by cb.stop_source_id, cb.route_code_normalized, cb.variant_family_code
      ) as same_family_variant_count,
      count(*) over (
        partition by cb.stop_source_id, cb.route_code_normalized, cb.variant_family_code, cb.direction_normalized
      ) as family_direction_variant_count,
      first_value(cb.snap_distance_m) over (
        partition by cb.stop_source_id
        order by cb.snap_distance_m asc, cb.variant_source_id asc
        rows between unbounded preceding and unbounded following
      ) as nearest_distance_m,
      nth_value(cb.snap_distance_m, 2) over (
        partition by cb.stop_source_id
        order by cb.snap_distance_m asc, cb.variant_source_id asc
        rows between unbounded preceding and unbounded following
      ) as second_nearest_distance_m
    from candidate_base cb
  ),
  bucketed as (
    select
      r.*,
      case
        when r.progress_m is not null then floor(r.progress_m::numeric / v_progress_bucket_m)::integer
        else null
      end as progress_bucket
    from ranked r
  ),
  enriched as (
    select
      b.*,
      count(*) over (
        partition by b.variant_source_id, b.progress_bucket
      ) as bucket_candidate_count,
      coalesce(b.stop_description_normalized, '') ~* '(TERMINAL|PARADA FINAL|PARADA INICIAL|ESTACION|ESTACION CENTRAL|TERMINALES DE COSTA RICA|TERMINALES|ULTIMA PARADA)' as is_terminal_hint
    from bucketed b
  ),
  scored as (
    select
      e.*,
      round(
        case
          when e.snap_distance_m <= p_high_confidence_snap_m then 1.0000
          when e.snap_distance_m <= 40 then 0.8200
          when e.snap_distance_m <= 55 then 0.6400
          else 0.3800
        end,
        4
      ) as distance_score,
      round(
        case
          when e.direction_normalized like 'loop_%' then 0.5500
          when e.family_direction_variant_count = 1 then 1.0000
          when e.same_family_variant_count = 1 then 0.8400
          when e.same_family_variant_count <= 2 then 0.6800
          else 0.4200
        end,
        4
      ) as direction_score,
      round(
        case
          when e.nearby_variant_count = 1 then 1.0000
          when e.same_family_variant_count = 1 and e.nearby_variant_count <= 3 then 0.8800
          when e.nearby_variant_count <= 5 then 0.6600
          when e.nearby_variant_count <= 10 then 0.4600
          else 0.2200
        end,
        4
      ) as corridor_competition_score,
      round(
        case
          when e.is_geometry_ambiguous or e.line_fraction is null then 0.4000
          when e.same_family_variant_count > e.family_direction_variant_count then 0.5200
          when coalesce(e.lateral_offset_m, 999) <= 8 then 1.0000
          when coalesce(e.lateral_offset_m, 999) <= 15 then 0.7800
          when coalesce(e.lateral_offset_m, 999) <= 25 then 0.5600
          else 0.2600
        end,
        4
      ) as side_of_road_score,
      round(
        case
          when e.progress_bucket is null then 0.3000
          when e.bucket_candidate_count <= 1 then 1.0000
          when e.bucket_candidate_count = 2 then 0.7000
          when e.bucket_candidate_count = 3 then 0.4200
          else 0.1800
        end,
        4
      ) as progress_consistency_score,
      round(
        case
          when e.preferred_rule_weight > 0 then least(1.0000, 0.6200 + e.preferred_rule_weight)
          when e.is_hub_stop then 0.4500
          else 0.6000
        end,
        4
      ) as manual_rule_score
    from enriched e
  ),
  finalized as (
    select
      s.*,
      round(
        greatest(
          0::numeric,
          least(
            1::numeric,
            (s.distance_score * 0.3000)
            + (s.direction_score * 0.1600)
            + (s.corridor_competition_score * 0.1800)
            + (s.side_of_road_score * 0.1100)
            + (s.progress_consistency_score * 0.1500)
            + (s.manual_rule_score * 0.1000)
            - case when s.is_terminal_hint then 0.1200 else 0 end
            - case when s.is_hub_stop then 0.1000 else 0 end
            - case when s.is_geometry_ambiguous then 0.1800 else 0 end
          )
        ),
        4
      ) as confidence_score
    from scored s
  )
  select
    f.stop_source_id,
    f.variant_source_id,
    f.route_code_normalized,
    f.variant_family_code,
    f.variant_code,
    f.direction_normalized,
    f.snap_distance_m,
    f.line_fraction,
    f.progress_m,
    f.route_axis_length_m,
    f.candidate_rank,
    f.nearby_variant_count,
    f.same_route_variant_count,
    f.same_family_variant_count,
    f.family_direction_variant_count,
    f.progress_bucket,
    f.bucket_candidate_count,
    f.nearest_distance_m,
    f.second_nearest_distance_m,
    round(coalesce(f.second_nearest_distance_m - f.snap_distance_m, 999)::numeric, 2) as distance_gap_m,
    f.signed_lateral_offset_m,
    f.lateral_offset_m,
    f.distance_score,
    f.direction_score,
    f.corridor_competition_score,
    f.side_of_road_score,
    f.progress_consistency_score,
    f.manual_rule_score,
    f.is_terminal_hint,
    f.is_hub_stop,
    f.is_geometry_ambiguous,
    f.confidence_score,
    case
      when f.is_geometry_ambiguous then 'manual'
      when f.is_hub_stop and f.nearby_variant_count > 2 then 'manual'
      when f.is_terminal_hint and f.nearby_variant_count > 1 then 'manual'
      when f.same_family_variant_count >= 8 then 'manual'
      when f.confidence_score >= 0.8400
       and f.candidate_rank = 1
       and coalesce(f.bucket_candidate_count, 1) = 1
       and f.nearby_variant_count <= 2
       and not f.is_terminal_hint
       and not f.is_hub_stop then 'alta'
      when f.confidence_score >= 0.6000 then 'media'
      else 'baja'
    end as confidence_label,
    array_remove(
      array[
        case when f.is_terminal_hint then 'terminal_hint' end,
        case when f.is_hub_stop then 'hub_stop' end,
        case when f.is_geometry_ambiguous then 'geometry_axis_missing' end,
        case when f.nearby_variant_count > 1 then 'shared_corridor' end,
        case when f.same_family_variant_count > 1 then 'shared_family_corridor' end,
        case when f.same_family_variant_count > f.family_direction_variant_count then 'opposite_direction_available' end,
        case when coalesce(f.bucket_candidate_count, 0) > 1 then 'progress_bucket_conflict' end,
        case when coalesce(f.second_nearest_distance_m - f.snap_distance_m, 999) < 12 then 'distance_tie' end,
        case when f.preferred_rule_weight > 0 then 'preferred_rule' end,
        case when f.snap_distance_m > p_high_confidence_snap_m then 'distance_above_high_confidence' end
      ],
      null
    ) as ambiguity_reasons
  from finalized f;

  get diagnostics v_candidate_count = row_count;
  return coalesce(v_candidate_count, 0);
end;
$$;

comment on function public.refresh_staging_ctp_route_stop_candidates_batch(bigint, bigint, integer, integer) is
  'Reconstruye candidatos CTP con score por componentes: distancia, direccion, corredor compartido, lado de abordaje, consistencia y reglas manuales.';

create or replace function public.refresh_staging_ctp_route_stops_inferred_batch(
  p_route_codes text[],
  p_progress_bucket_m integer default 35
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '10min'
as $$
declare
  v_route_codes text[];
  v_inferred_count bigint := 0;
begin
  v_route_codes := array(
    select distinct c
    from unnest(coalesce(p_route_codes, '{}'::text[])) as c
    where nullif(trim(c), '') is not null
  );

  if coalesce(array_length(v_route_codes, 1), 0) = 0 then
    raise exception 'p_route_codes debe incluir al menos un codigo normalizado';
  end if;

  if p_progress_bucket_m < 5 or p_progress_bucket_m > 200 then
    raise exception 'p_progress_bucket_m fuera de rango (%). Usa un valor entre 5 y 200 metros.', p_progress_bucket_m;
  end if;

  delete from public.staging_ctp_route_stops_inferred
  where route_code_normalized = any(v_route_codes);

  insert into public.staging_ctp_route_stops_inferred (
    variant_source_id,
    stop_source_id,
    route_code_normalized,
    variant_family_code,
    variant_code,
    direction_normalized,
    confidence_score,
    confidence_label,
    snap_distance_m,
    line_fraction,
    progress_m,
    progress_bucket,
    route_axis_length_m,
    suggested_stop_sequence,
    shared_corridor,
    manual_review_required
  )
  with deduped as (
    select
      c.*,
      floor(c.progress_m::numeric / p_progress_bucket_m)::integer as dedup_progress_bucket,
      row_number() over (
        partition by c.variant_source_id, floor(c.progress_m::numeric / p_progress_bucket_m)::integer
        order by
          case c.confidence_label
            when 'alta' then 1
            when 'media' then 2
            when 'baja' then 3
            else 4
          end,
          c.progress_consistency_score desc nulls last,
          c.distance_score desc nulls last,
          c.snap_distance_m asc,
          c.stop_source_id asc
      ) as bucket_rank
    from public.staging_ctp_route_stop_candidates c
    where c.route_code_normalized = any(v_route_codes)
      and c.line_fraction is not null
      and c.progress_m is not null
  ),
  selected as (
    select d.*
    from deduped d
    where d.bucket_rank = 1
  ),
  ordered as (
    select
      s.*,
      row_number() over (
        partition by s.variant_source_id
        order by s.progress_m asc, s.snap_distance_m asc, s.stop_source_id asc
      ) as suggested_stop_sequence
    from selected s
  )
  select
    o.variant_source_id,
    o.stop_source_id,
    o.route_code_normalized,
    o.variant_family_code,
    o.variant_code,
    o.direction_normalized,
    o.confidence_score,
    o.confidence_label,
    o.snap_distance_m,
    o.line_fraction,
    o.progress_m,
    o.dedup_progress_bucket as progress_bucket,
    o.route_axis_length_m,
    o.suggested_stop_sequence,
    (o.nearby_variant_count > 1) as shared_corridor,
    (
      o.confidence_label = 'manual'
      or o.is_terminal_hint
      or o.is_hub_stop
      or o.is_geometry_ambiguous
      or coalesce(o.bucket_candidate_count, 0) > 2
      or coalesce(o.same_family_variant_count, 0) >= 6
    ) as manual_review_required
  from ordered o;

  get diagnostics v_inferred_count = row_count;
  return coalesce(v_inferred_count, 0);
end;
$$;

comment on function public.refresh_staging_ctp_route_stops_inferred_batch(text[], integer) is
  'Reconstruye secuencias sugeridas CTP usando bucket dedupe, score enriquecido y reglas para enviar hubs y conflictos a revision manual.';

create or replace function public.refresh_staging_ctp_route_stops_inferred_all_batches(
  p_route_batch_size integer default 10,
  p_progress_bucket_m integer default 35
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '0'
as $$
declare
  v_batch record;
  v_total bigint := 0;
begin
  if p_route_batch_size < 1 or p_route_batch_size > 100 then
    raise exception 'p_route_batch_size fuera de rango (%). Usa un valor entre 1 y 100.', p_route_batch_size;
  end if;

  for v_batch in
    select b.route_codes
    from public.list_staging_ctp_route_code_batches(p_route_batch_size) b
    order by b.batch_no asc
  loop
    v_total := v_total + public.refresh_staging_ctp_route_stops_inferred_batch(v_batch.route_codes, p_progress_bucket_m);
  end loop;

  return coalesce(v_total, 0);
end;
$$;

comment on function public.refresh_staging_ctp_route_stops_inferred_all_batches(integer, integer) is
  'Reconstruye solo las inferidas CTP por lotes de codigos de ruta, reutilizando los candidatos ya calculados.';

create or replace function public.run_staging_ctp_inference_job(p_run_label text)
returns void
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '0'
as $$
declare
  v_started_at timestamptz := clock_timestamp();
  v_finished_at timestamptz;
  v_counts record;
begin
  insert into public.staging_ctp_inference_runs (
    run_label,
    started_at,
    status
  )
  values (
    p_run_label,
    v_started_at,
    'running'
  );

  perform public.refresh_staging_ctp_route_stop_inference_batched();
  select *
  into v_counts
  from public.get_staging_ctp_inference_counts();

  v_finished_at := clock_timestamp();

  update public.staging_ctp_inference_runs
  set
    status = 'completed',
    finished_at = v_finished_at,
    updated_at = v_finished_at,
    candidates_count = v_counts.candidate_count,
    inferred_count = v_counts.inferred_count,
    error_message = null
  where run_label = p_run_label;
exception
  when others then
    v_finished_at := clock_timestamp();

    update public.staging_ctp_inference_runs
    set
      status = 'failed',
      finished_at = v_finished_at,
      updated_at = v_finished_at,
      error_message = left(sqlerrm, 4000)
    where run_label = p_run_label;

    raise;
end;
$$;

comment on function public.run_staging_ctp_inference_job(text) is
  'Orquesta una corrida nacional del matching CTP y registra tiempos reales usando clock_timestamp().';

drop view if exists public.staging_ctp_route_stop_inference_qa;
drop view if exists public.staging_ctp_route_stop_inference_summary;
drop view if exists public.staging_ctp_variant_family_summary;
drop view if exists public.staging_ctp_corridor_conflicts_qa;
drop view if exists public.staging_ctp_transfer_hub_rule_qa;
drop view if exists public.staging_ctp_runtime_promotion_candidates;

create or replace view public.staging_ctp_runtime_promotion_candidates as
with scored as (
  select
    i.variant_source_id,
    i.stop_source_id,
    i.route_code_normalized,
    i.variant_family_code,
    i.variant_code,
    i.direction_normalized,
    i.confidence_score,
    i.confidence_label,
    i.snap_distance_m,
    i.line_fraction,
    i.progress_m,
    i.progress_bucket,
    i.route_axis_length_m,
    i.suggested_stop_sequence,
    i.shared_corridor,
    i.manual_review_required,
    c.nearby_variant_count,
    c.same_route_variant_count,
    c.same_family_variant_count,
    c.family_direction_variant_count,
    c.bucket_candidate_count,
    c.distance_score,
    c.direction_score,
    c.corridor_competition_score,
    c.side_of_road_score,
    c.progress_consistency_score,
    c.manual_rule_score,
    c.is_terminal_hint,
    c.is_hub_stop,
    c.is_geometry_ambiguous,
    c.ambiguity_reasons,
    s.source_identifier,
    s.description_raw as stop_description,
    s.lat,
    s.lng
  from public.staging_ctp_route_stops_inferred i
  join public.staging_ctp_route_stop_candidates c
    on c.variant_source_id = i.variant_source_id
   and c.stop_source_id = i.stop_source_id
  join public.staging_ctp_official_stops s
    on s.source_id = i.stop_source_id
),
classified as (
  select
    sc.*,
    case
      when sc.manual_review_required then 'hold'
      when sc.confidence_label = 'alta' then 'auto'
      when sc.confidence_label = 'media'
       and coalesce(sc.same_family_variant_count, 0) = 1
       and coalesce(sc.family_direction_variant_count, 0) = 1
       and sc.confidence_score >= 0.8500
       and not sc.is_terminal_hint
       and not sc.is_hub_stop then 'review'
      when sc.confidence_label = 'media'
       and coalesce(sc.nearby_variant_count, 0) <= 6
       and coalesce(sc.same_family_variant_count, 0) <= 3
       and not sc.is_terminal_hint
       and not sc.is_hub_stop then 'review'
      when sc.confidence_label = 'media' then 'hold'
      else 'hold'
    end as promotion_tier,
    array_remove(
      array[
        case when sc.manual_review_required then 'manual_review_required' end,
        case when sc.confidence_label = 'alta' then 'high_confidence' end,
        case when sc.confidence_label = 'media' then 'medium_confidence' end,
        case when sc.shared_corridor then 'shared_corridor' end,
        case when sc.is_terminal_hint then 'terminal_hint' end,
        case when sc.is_hub_stop then 'hub_stop' end,
        case when coalesce(sc.same_family_variant_count, 0) > 1 then 'shared_family_corridor' end
      ],
      null
    ) as promotion_reasons
  from scored sc
),
ranked as (
  select
    cl.*,
    row_number() over (
      partition by cl.stop_source_id, cl.variant_family_code
      order by
        case cl.promotion_tier
          when 'auto' then 1
          when 'review' then 2
          else 3
        end,
        case cl.confidence_label
          when 'alta' then 1
          when 'media' then 2
          when 'baja' then 3
          else 4
        end,
        cl.confidence_score desc,
        cl.snap_distance_m asc,
        cl.suggested_stop_sequence asc
    ) as family_promotion_rank
  from classified cl
)
select
  r.*,
  (
    r.family_promotion_rank = 1
    and r.promotion_tier in ('auto', 'review')
  ) as preview_eligible
from ranked r;

comment on view public.staging_ctp_runtime_promotion_candidates is
  'Capa de promotion para preview/runtime: separa asociaciones auto, review y hold sin tocar todavia las tablas productivas.';

create or replace view public.staging_ctp_variant_family_summary as
select
  rv.route_code_normalized,
  rv.variant_family_code,
  rv.direction_normalized,
  count(distinct rv.source_id)::integer as variant_count,
  count(*) filter (where pc.promotion_tier = 'auto')::integer as auto_promotion_count,
  count(*) filter (where pc.promotion_tier = 'review')::integer as review_promotion_count,
  count(*) filter (where pc.promotion_tier = 'hold')::integer as hold_promotion_count,
  count(*) filter (where pc.preview_eligible)::integer as preview_eligible_count
from public.staging_ctp_official_route_variants rv
left join public.staging_ctp_runtime_promotion_candidates pc
  on pc.variant_source_id = rv.source_id
group by
  rv.route_code_normalized,
  rv.variant_family_code,
  rv.direction_normalized
order by rv.route_code_normalized asc, rv.variant_family_code asc, rv.direction_normalized asc;

comment on view public.staging_ctp_variant_family_summary is
  'Resumen QA por familia operacional: cuantas paradas podrian promoverse automatico, con revision o quedar retenidas.';

create or replace view public.staging_ctp_corridor_conflicts_qa as
select
  s.source_id as stop_source_id,
  s.source_identifier,
  s.description_raw as stop_description,
  count(*)::integer as candidate_count,
  count(distinct c.route_code_normalized)::integer as route_code_count,
  count(distinct c.variant_family_code)::integer as variant_family_count,
  bool_or(c.is_terminal_hint) as has_terminal_hint,
  bool_or(c.is_hub_stop) as is_hub_stop,
  min(c.snap_distance_m) as min_snap_distance_m,
  string_agg(distinct c.route_code_normalized, ', ' order by c.route_code_normalized) as route_codes,
  string_agg(distinct c.variant_family_code, ', ' order by c.variant_family_code) as variant_families
from public.staging_ctp_route_stop_candidates c
join public.staging_ctp_official_stops s
  on s.source_id = c.stop_source_id
group by s.source_id, s.source_identifier, s.description_raw
having count(*) >= 6
    or count(distinct c.variant_family_code) >= 3
    or bool_or(c.is_terminal_hint)
    or bool_or(c.is_hub_stop)
order by candidate_count desc, variant_family_count desc, min_snap_distance_m asc, s.source_id asc;

comment on view public.staging_ctp_corridor_conflicts_qa is
  'Lista las paradas donde el algoritmo ve demasiadas variantes o familias, util para revisar corredores compartidos y casos misma-calle.';

create or replace view public.staging_ctp_transfer_hub_rule_qa as
select
  hr.id,
  hr.hub_key,
  hr.hub_name,
  hr.from_route_code,
  hr.from_variant_family_code,
  hr.to_route_code,
  hr.to_variant_family_code,
  hr.walk_radius_m,
  hr.transfer_penalty_seconds,
  hr.priority,
  hr.active,
  hr.notes,
  arrival.source_id as arrival_stop_source_id,
  arrival.description_raw as arrival_stop_description,
  departure.source_id as departure_stop_source_id,
  departure.description_raw as departure_stop_description,
  (
    arrival.source_id is not null
    and departure.source_id is not null
  ) as anchors_resolved
from public.staging_ctp_transfer_hub_rules hr
left join public.staging_ctp_official_stops arrival
  on arrival.source_identifier = hr.arrival_stop_identifier
left join public.staging_ctp_official_stops departure
  on departure.source_identifier = hr.departure_stop_identifier
order by hr.priority asc, hr.hub_name asc, hr.id asc;

comment on view public.staging_ctp_transfer_hub_rule_qa is
  'Verifica que los hubs y sus anclas de llegada/salida queden resueltos contra el staging oficial del CTP.';

create or replace view public.staging_ctp_route_stop_inference_summary as
with candidate_summary as (
  select
    c.variant_source_id,
    count(*) as candidate_count,
    count(*) filter (where c.confidence_label = 'alta') as alta_count,
    count(*) filter (where c.confidence_label = 'media') as media_count,
    count(*) filter (where c.confidence_label = 'baja') as baja_count,
    count(*) filter (where c.confidence_label = 'manual') as manual_count,
    min(c.snap_distance_m) as min_snap_distance_m,
    max(c.snap_distance_m) as max_snap_distance_m
  from public.staging_ctp_route_stop_candidates c
  group by c.variant_source_id
),
inferred_summary as (
  select
    i.variant_source_id,
    count(*) as inferred_stop_count,
    count(*) filter (where i.manual_review_required) as inferred_manual_count
  from public.staging_ctp_route_stops_inferred i
  group by i.variant_source_id
),
promotion_summary as (
  select
    pc.variant_source_id,
    count(*) filter (where pc.promotion_tier = 'auto') as auto_promotion_count,
    count(*) filter (where pc.promotion_tier = 'review') as review_promotion_count,
    count(*) filter (where pc.promotion_tier = 'hold') as hold_promotion_count
  from public.staging_ctp_runtime_promotion_candidates pc
  group by pc.variant_source_id
)
select
  rv.source_id as variant_source_id,
  rv.route_code_normalized,
  rv.variant_family_code,
  rv.variant_code,
  rv.direction_normalized,
  rv.description_raw,
  (rv.geom_axis is not null) as has_axis,
  coalesce(cs.candidate_count, 0)::integer as candidate_count,
  coalesce(cs.alta_count, 0)::integer as alta_count,
  coalesce(cs.media_count, 0)::integer as media_count,
  coalesce(cs.baja_count, 0)::integer as baja_count,
  coalesce(cs.manual_count, 0)::integer as manual_count,
  coalesce(isu.inferred_stop_count, 0)::integer as inferred_stop_count,
  coalesce(isu.inferred_manual_count, 0)::integer as inferred_manual_count,
  coalesce(ps.auto_promotion_count, 0)::integer as auto_promotion_count,
  coalesce(ps.review_promotion_count, 0)::integer as review_promotion_count,
  coalesce(ps.hold_promotion_count, 0)::integer as hold_promotion_count,
  cs.min_snap_distance_m,
  cs.max_snap_distance_m,
  (
    rv.geom_axis is not null
    and coalesce(ps.auto_promotion_count, 0) >= 4
    and coalesce(isu.inferred_manual_count, 0) = 0
  ) as pilot_ready
from public.staging_ctp_official_route_variants rv
left join candidate_summary cs
  on cs.variant_source_id = rv.source_id
left join inferred_summary isu
  on isu.variant_source_id = rv.source_id
left join promotion_summary ps
  on ps.variant_source_id = rv.source_id
order by rv.route_code_normalized asc, rv.variant_code asc;

comment on view public.staging_ctp_route_stop_inference_summary is
  'Resumen QA por variante y familia oficial del CTP, incluyendo candidatos, inferidas y nivel de promocion a preview/runtime.';

create or replace view public.staging_ctp_route_stop_inference_qa as
select
  rv.route_code_normalized,
  rv.variant_family_code,
  rv.variant_code,
  rv.direction_normalized,
  rv.description_raw as variant_description,
  s.source_id as stop_source_id,
  s.source_identifier,
  s.description_raw as stop_description,
  c.snap_distance_m,
  c.line_fraction,
  c.progress_m,
  c.progress_bucket,
  c.bucket_candidate_count,
  c.candidate_rank,
  c.nearby_variant_count,
  c.same_route_variant_count,
  c.same_family_variant_count,
  c.family_direction_variant_count,
  c.signed_lateral_offset_m,
  c.lateral_offset_m,
  c.distance_score,
  c.direction_score,
  c.corridor_competition_score,
  c.side_of_road_score,
  c.progress_consistency_score,
  c.manual_rule_score,
  c.confidence_score,
  c.confidence_label,
  c.is_terminal_hint,
  c.is_hub_stop,
  c.is_geometry_ambiguous,
  c.ambiguity_reasons,
  i.suggested_stop_sequence,
  i.manual_review_required,
  pc.promotion_tier,
  pc.preview_eligible,
  pc.family_promotion_rank
from public.staging_ctp_route_stop_candidates c
join public.staging_ctp_official_route_variants rv
  on rv.source_id = c.variant_source_id
join public.staging_ctp_official_stops s
  on s.source_id = c.stop_source_id
left join public.staging_ctp_route_stops_inferred i
  on i.variant_source_id = c.variant_source_id
 and i.stop_source_id = c.stop_source_id
left join public.staging_ctp_runtime_promotion_candidates pc
  on pc.variant_source_id = c.variant_source_id
 and pc.stop_source_id = c.stop_source_id
order by
  rv.route_code_normalized asc,
  rv.variant_family_code asc,
  rv.variant_code asc,
  coalesce(i.suggested_stop_sequence, 2147483647) asc,
  c.snap_distance_m asc,
  s.source_id asc;

comment on view public.staging_ctp_route_stop_inference_qa is
  'Detalle QA del matching parada->variante con score por componentes, promotion tier y elegibilidad para preview.';

grant select on public.staging_ctp_runtime_promotion_candidates to authenticated;
grant select on public.staging_ctp_variant_family_summary to authenticated;
grant select on public.staging_ctp_corridor_conflicts_qa to authenticated;
grant select on public.staging_ctp_transfer_hub_rule_qa to authenticated;
grant select on public.staging_ctp_route_stop_inference_summary to authenticated;
grant select on public.staging_ctp_route_stop_inference_qa to authenticated;
