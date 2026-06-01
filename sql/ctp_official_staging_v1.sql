set search_path = public, extensions;

create extension if not exists postgis with schema extensions;

create or replace function public.normalize_route_code(p_code text)
returns text
language sql
immutable
parallel safe
as $$
  select
    case
      when nullif(regexp_replace(coalesce(p_code, ''), '[^0-9]+', '', 'g'), '') is null then null
      else lpad(regexp_replace(coalesce(p_code, ''), '[^0-9]+', '', 'g'), 4, '0')
    end;
$$;

comment on function public.normalize_route_code(text) is
  'Normaliza codigos de ruta removiendo caracteres no numericos y rellenando a 4 digitos.';

create or replace function public.normalize_ctp_text(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(trim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '');
$$;

comment on function public.normalize_ctp_text(text) is
  'Normaliza textos oficiales del CTP recortando espacios y colapsando saltos de linea.';

create or replace function public.normalize_ctp_sentido(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select
    case upper(trim(coalesce(p_value, '')))
      when '1-2' then 'ida'
      when '2-1' then 'vuelta'
      when 'ANILLO HORARIO' then 'loop_horario'
      when 'ANILLO ANTIHORARIO' then 'loop_antihorario'
      when '' then 'sin_definir'
      else 'sin_definir'
    end;
$$;

comment on function public.normalize_ctp_sentido(text) is
  'Mapea el sentido oficial del CTP a etiquetas operativas internas.';

create or replace function public.extract_ctp_axis(p_geom geometry)
returns geometry(LineString, 4326)
language plpgsql
immutable
parallel safe
as $$
declare
  v_geom geometry;
begin
  if p_geom is null then
    return null;
  end if;

  v_geom := st_linemerge(st_collectionextract(st_force2d(p_geom), 2));

  if v_geom is null then
    return null;
  end if;

  if geometrytype(v_geom) = 'LINESTRING'
     and st_npoints(v_geom) >= 2 then
    return st_setsrid(v_geom, 4326)::geometry(LineString, 4326);
  end if;

  return null;
end;
$$;

comment on function public.extract_ctp_axis(geometry) is
  'Extrae un eje lineal util para inferencia de orden sobre una geometria oficial del CTP. Devuelve null cuando la geometria es ambigua.';

create table if not exists public.staging_ctp_official_stops (
  source_id bigint primary key,
  source_identifier text not null unique,
  description_raw text,
  description_normalized text generated always as (public.normalize_ctp_text(description_raw)) stored,
  lat double precision not null,
  lng double precision not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  geom geometry(Point, 4326) generated always as (
    st_setsrid(st_makepoint(lng, lat), 4326)
  ) stored,
  geo geography(Point, 4326) generated always as (
    st_setsrid(st_makepoint(lng, lat), 4326)::geography
  ) stored,
  constraint staging_ctp_official_stops_lat_chk check (lat between -90 and 90),
  constraint staging_ctp_official_stops_lng_chk check (lng between -180 and 180)
);

create index if not exists staging_ctp_official_stops_geo_gix
  on public.staging_ctp_official_stops
  using gist (geo);

create index if not exists staging_ctp_official_stops_desc_idx
  on public.staging_ctp_official_stops (description_normalized);

drop trigger if exists set_updated_at_staging_ctp_official_stops on public.staging_ctp_official_stops;
create trigger set_updated_at_staging_ctp_official_stops
before update on public.staging_ctp_official_stops
for each row
execute function public.set_updated_at();

create table if not exists public.staging_ctp_official_route_variants (
  source_id bigint primary key,
  route_code text not null,
  route_code_normalized text generated always as (public.normalize_route_code(route_code)) stored,
  variant_code text not null unique,
  description_raw text,
  description_normalized text generated always as (public.normalize_ctp_text(description_raw)) stored,
  direction_raw text,
  direction_normalized text generated always as (public.normalize_ctp_sentido(direction_raw)) stored,
  geom geometry(MultiLineString, 4326) not null,
  geom_axis geometry(LineString, 4326) generated always as (public.extract_ctp_axis(geom)) stored,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists staging_ctp_official_route_variants_route_code_idx
  on public.staging_ctp_official_route_variants (route_code_normalized);

create index if not exists staging_ctp_official_route_variants_variant_idx
  on public.staging_ctp_official_route_variants (variant_code);

create index if not exists staging_ctp_official_route_variants_geom_gix
  on public.staging_ctp_official_route_variants
  using gist (geom);

create index if not exists staging_ctp_official_route_variants_geom_axis_gix
  on public.staging_ctp_official_route_variants
  using gist (geom_axis)
  where geom_axis is not null;

drop trigger if exists set_updated_at_staging_ctp_official_route_variants on public.staging_ctp_official_route_variants;
create trigger set_updated_at_staging_ctp_official_route_variants
before update on public.staging_ctp_official_route_variants
for each row
execute function public.set_updated_at();

create table if not exists public.staging_ctp_route_stop_candidates (
  stop_source_id bigint not null references public.staging_ctp_official_stops(source_id) on delete cascade,
  variant_source_id bigint not null references public.staging_ctp_official_route_variants(source_id) on delete cascade,
  route_code_normalized text,
  variant_code text not null,
  direction_normalized text not null,
  snap_distance_m numeric(10, 2) not null,
  line_fraction numeric(9, 6),
  progress_m integer,
  route_axis_length_m integer,
  candidate_rank integer not null,
  nearby_variant_count integer not null,
  same_route_variant_count integer not null,
  nearest_distance_m numeric(10, 2) not null,
  second_nearest_distance_m numeric(10, 2),
  distance_gap_m numeric(10, 2),
  is_terminal_hint boolean not null default false,
  is_geometry_ambiguous boolean not null default false,
  confidence_score numeric(5, 4) not null,
  confidence_label text not null,
  ambiguity_reasons text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint staging_ctp_route_stop_candidates_pk primary key (stop_source_id, variant_source_id),
  constraint staging_ctp_route_stop_candidates_confidence_chk
    check (confidence_label in ('alta', 'media', 'baja', 'manual'))
);

create index if not exists staging_ctp_route_stop_candidates_variant_idx
  on public.staging_ctp_route_stop_candidates (variant_source_id, confidence_label, snap_distance_m);

create index if not exists staging_ctp_route_stop_candidates_stop_idx
  on public.staging_ctp_route_stop_candidates (stop_source_id, candidate_rank);

create index if not exists staging_ctp_route_stop_candidates_route_code_idx
  on public.staging_ctp_route_stop_candidates (route_code_normalized);

drop trigger if exists set_updated_at_staging_ctp_route_stop_candidates on public.staging_ctp_route_stop_candidates;
create trigger set_updated_at_staging_ctp_route_stop_candidates
before update on public.staging_ctp_route_stop_candidates
for each row
execute function public.set_updated_at();

create table if not exists public.staging_ctp_route_stops_inferred (
  variant_source_id bigint not null references public.staging_ctp_official_route_variants(source_id) on delete cascade,
  stop_source_id bigint not null references public.staging_ctp_official_stops(source_id) on delete cascade,
  route_code_normalized text,
  variant_code text not null,
  direction_normalized text not null,
  confidence_score numeric(5, 4) not null,
  confidence_label text not null,
  snap_distance_m numeric(10, 2) not null,
  line_fraction numeric(9, 6) not null,
  progress_m integer not null,
  progress_bucket integer not null,
  route_axis_length_m integer,
  suggested_stop_sequence integer not null,
  shared_corridor boolean not null default false,
  manual_review_required boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint staging_ctp_route_stops_inferred_pk primary key (variant_source_id, stop_source_id),
  constraint staging_ctp_route_stops_inferred_confidence_chk
    check (confidence_label in ('alta', 'media', 'baja', 'manual'))
);

create index if not exists staging_ctp_route_stops_inferred_variant_seq_idx
  on public.staging_ctp_route_stops_inferred (variant_source_id, suggested_stop_sequence);

create index if not exists staging_ctp_route_stops_inferred_stop_idx
  on public.staging_ctp_route_stops_inferred (stop_source_id);

drop trigger if exists set_updated_at_staging_ctp_route_stops_inferred on public.staging_ctp_route_stops_inferred;
create trigger set_updated_at_staging_ctp_route_stops_inferred
before update on public.staging_ctp_route_stops_inferred
for each row
execute function public.set_updated_at();

create or replace function public.refresh_staging_ctp_route_stop_inference(
  p_max_snap_m integer default 65,
  p_high_confidence_snap_m integer default 25,
  p_progress_bucket_m integer default 35
)
returns table (
  stage text,
  row_count bigint
)
language plpgsql
set search_path = public, extensions
as $$
declare
  v_candidate_count bigint;
  v_inferred_count bigint;
begin
  if p_max_snap_m < 10 or p_max_snap_m > 250 then
    raise exception 'p_max_snap_m fuera de rango (%). Usa un valor entre 10 y 250 metros.', p_max_snap_m;
  end if;

  if p_high_confidence_snap_m < 5 or p_high_confidence_snap_m > p_max_snap_m then
    raise exception 'p_high_confidence_snap_m debe estar entre 5 y p_max_snap_m (%).', p_high_confidence_snap_m;
  end if;

  if p_progress_bucket_m < 5 or p_progress_bucket_m > 200 then
    raise exception 'p_progress_bucket_m fuera de rango (%). Usa un valor entre 5 y 200 metros.', p_progress_bucket_m;
  end if;

  truncate table public.staging_ctp_route_stop_candidates;
  truncate table public.staging_ctp_route_stops_inferred;

  insert into public.staging_ctp_route_stop_candidates (
    stop_source_id,
    variant_source_id,
    route_code_normalized,
    variant_code,
    direction_normalized,
    snap_distance_m,
    line_fraction,
    progress_m,
    route_axis_length_m,
    candidate_rank,
    nearby_variant_count,
    same_route_variant_count,
    nearest_distance_m,
    second_nearest_distance_m,
    distance_gap_m,
    is_terminal_hint,
    is_geometry_ambiguous,
    confidence_score,
    confidence_label,
    ambiguity_reasons
  )
  with candidate_base as (
    select
      s.source_id as stop_source_id,
      rv.source_id as variant_source_id,
      rv.route_code_normalized,
      rv.variant_code,
      rv.direction_normalized,
      s.description_normalized as stop_description_normalized,
      round(
        st_distance(
          s.geo,
          coalesce(rv.geom_axis::geography, rv.geom::geography)
        )::numeric,
        2
      ) as snap_distance_m,
      case
        when rv.geom_axis is not null then
          st_linelocatepoint(rv.geom_axis, s.geom)::numeric(9, 6)
        else null
      end as line_fraction,
      case
        when rv.geom_axis is not null then
          round(
            (
              st_linelocatepoint(rv.geom_axis, s.geom)
              * st_length(rv.geom_axis::geography)
            )::numeric
          )::integer
        else null
      end as progress_m,
      case
        when rv.geom_axis is not null then
          round(st_length(rv.geom_axis::geography)::numeric)::integer
        else null
      end as route_axis_length_m,
      (rv.geom_axis is null) as is_geometry_ambiguous
    from public.staging_ctp_official_stops s
    join public.staging_ctp_official_route_variants rv
      on st_dwithin(
        s.geo,
        coalesce(rv.geom_axis::geography, rv.geom::geography),
        p_max_snap_m
      )
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
  heuristics as (
    select
      r.*,
      coalesce(r.stop_description_normalized, '') ~* '(TERMINAL|PARADA FINAL|PARADA INICIAL|ESTACION|ESTACIÓN|TERMINALES DE COSTA RICA|TERMINALES|ULTIMA PARADA|ÚLTIMA PARADA)' as is_terminal_hint
    from ranked r
  ),
  scored as (
    select
      h.*,
      round(
        greatest(
          0::numeric,
          least(
            1::numeric,
            (
              0.55
              * case
                  when h.snap_distance_m <= p_high_confidence_snap_m then 1.00
                  when h.snap_distance_m <= 40 then 0.78
                  when h.snap_distance_m <= 55 then 0.58
                  else 0.35
                end
            )
            + (
              0.30
              * case
                  when h.nearby_variant_count = 1 then 1.00
                  when coalesce(h.second_nearest_distance_m, h.snap_distance_m + 99) - h.snap_distance_m >= 20 then 0.82
                  when coalesce(h.second_nearest_distance_m, h.snap_distance_m + 99) - h.snap_distance_m >= 12 then 0.63
                  when h.nearby_variant_count <= 3 then 0.46
                  else 0.24
                end
            )
            + (
              0.15
              * case
                  when not h.is_geometry_ambiguous
                   and h.line_fraction between 0 and 1 then 1.00
                  when not h.is_geometry_ambiguous then 0.55
                  else 0.20
                end
            )
            - case
                when h.is_terminal_hint then 0.18
                else 0
              end
          )
        ),
        4
      ) as confidence_score
    from heuristics h
  )
  select
    s.stop_source_id,
    s.variant_source_id,
    s.route_code_normalized,
    s.variant_code,
    s.direction_normalized,
    s.snap_distance_m,
    s.line_fraction,
    s.progress_m,
    s.route_axis_length_m,
    s.candidate_rank,
    s.nearby_variant_count,
    s.same_route_variant_count,
    s.nearest_distance_m,
    s.second_nearest_distance_m,
    round(coalesce(s.second_nearest_distance_m - s.snap_distance_m, 999)::numeric, 2) as distance_gap_m,
    s.is_terminal_hint,
    s.is_geometry_ambiguous,
    s.confidence_score,
    case
      when s.is_geometry_ambiguous then 'manual'
      when s.is_terminal_hint and s.nearby_variant_count > 1 then 'manual'
      when s.confidence_score >= 0.85
       and s.snap_distance_m <= p_high_confidence_snap_m
       and s.nearby_variant_count = 1 then 'alta'
      when s.confidence_score >= 0.62 then 'media'
      else 'baja'
    end as confidence_label,
    array_remove(
      array[
        case when s.is_terminal_hint then 'terminal_hint' end,
        case when s.is_geometry_ambiguous then 'geometry_axis_missing' end,
        case when s.nearby_variant_count > 1 then 'shared_corridor' end,
        case when coalesce(s.second_nearest_distance_m - s.snap_distance_m, 999) < 12 then 'distance_tie' end,
        case when s.snap_distance_m > p_high_confidence_snap_m then 'distance_above_high_confidence' end
      ],
      null
    ) as ambiguity_reasons
  from scored s;

  get diagnostics v_candidate_count = row_count;

  insert into public.staging_ctp_route_stops_inferred (
    variant_source_id,
    stop_source_id,
    route_code_normalized,
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
      floor(c.progress_m::numeric / p_progress_bucket_m)::integer as progress_bucket,
      row_number() over (
        partition by c.variant_source_id, floor(c.progress_m::numeric / p_progress_bucket_m)::integer
        order by
          case c.confidence_label
            when 'alta' then 1
            when 'media' then 2
            when 'baja' then 3
            else 4
          end,
          c.snap_distance_m asc,
          c.stop_source_id asc
      ) as bucket_rank
    from public.staging_ctp_route_stop_candidates c
    where c.line_fraction is not null
      and c.progress_m is not null
  ),
  selected as (
    select
      d.*
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
    o.variant_code,
    o.direction_normalized,
    o.confidence_score,
    o.confidence_label,
    o.snap_distance_m,
    o.line_fraction,
    o.progress_m,
    o.progress_bucket,
    o.route_axis_length_m,
    o.suggested_stop_sequence,
    (o.nearby_variant_count > 1) as shared_corridor,
    (
      o.confidence_label = 'manual'
      or o.is_terminal_hint
      or o.is_geometry_ambiguous
    ) as manual_review_required
  from ordered o;

  get diagnostics v_inferred_count = row_count;

  return query
  select 'candidates'::text, coalesce(v_candidate_count, 0)
  union all
  select 'inferred'::text, coalesce(v_inferred_count, 0);
end;
$$;

grant execute on function public.refresh_staging_ctp_route_stop_inference(integer, integer, integer)
  to authenticated;

comment on function public.refresh_staging_ctp_route_stop_inference(integer, integer, integer) is
  'Reconstruye candidatos e inferencias parada->variante usando cercania espacial, exclusividad del corredor y progreso sobre la linea oficial del CTP.';

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
)
select
  rv.source_id as variant_source_id,
  rv.route_code_normalized,
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
  cs.min_snap_distance_m,
  cs.max_snap_distance_m,
  (
    rv.geom_axis is not null
    and coalesce(isu.inferred_stop_count, 0) >= 4
    and coalesce(cs.manual_count, 0) = 0
  ) as pilot_ready
from public.staging_ctp_official_route_variants rv
left join candidate_summary cs
  on cs.variant_source_id = rv.source_id
left join inferred_summary isu
  on isu.variant_source_id = rv.source_id
order by rv.route_code_normalized asc, rv.variant_code asc;

comment on view public.staging_ctp_route_stop_inference_summary is
  'Resumen QA por variante oficial del CTP: cuantos candidatos se detectaron, cuantas paradas quedaron inferidas y cuanta revision manual hace falta.';

create or replace view public.staging_ctp_route_stop_inference_qa as
select
  rv.route_code_normalized,
  rv.variant_code,
  rv.direction_normalized,
  rv.description_raw as variant_description,
  s.source_id as stop_source_id,
  s.source_identifier,
  s.description_raw as stop_description,
  c.snap_distance_m,
  c.line_fraction,
  c.progress_m,
  c.candidate_rank,
  c.nearby_variant_count,
  c.same_route_variant_count,
  c.confidence_score,
  c.confidence_label,
  c.is_terminal_hint,
  c.is_geometry_ambiguous,
  c.ambiguity_reasons,
  i.suggested_stop_sequence,
  i.manual_review_required
from public.staging_ctp_route_stop_candidates c
join public.staging_ctp_official_route_variants rv
  on rv.source_id = c.variant_source_id
join public.staging_ctp_official_stops s
  on s.source_id = c.stop_source_id
left join public.staging_ctp_route_stops_inferred i
  on i.variant_source_id = c.variant_source_id
 and i.stop_source_id = c.stop_source_id
order by
  rv.route_code_normalized asc,
  rv.variant_code asc,
  coalesce(i.suggested_stop_sequence, 2147483647) asc,
  c.snap_distance_m asc,
  s.source_id asc;

comment on view public.staging_ctp_route_stop_inference_qa is
  'Detalle QA parada->variante con score, distancia, secuencia sugerida y razones de ambiguedad.';

create or replace view public.staging_ctp_route_code_match_summary as
with official_routes as (
  select
    rv.route_code_normalized,
    count(*)::integer as official_variant_count,
    string_agg(rv.variant_code, ' | ' order by rv.variant_code) as official_variants
  from public.staging_ctp_official_route_variants rv
  group by rv.route_code_normalized
),
current_routes as (
  select
    public.normalize_route_code(r.codigo_ctp) as route_code_normalized,
    count(*)::integer as current_route_count,
    string_agg(
      coalesce(r.codigo_ctp, 'sin_codigo') || ' ' || coalesce(r.nombre_ruta, 'Ruta sin nombre'),
      ' | '
      order by r.id
    ) as current_routes
  from public.rutas r
  where public.normalize_route_code(r.codigo_ctp) is not null
  group by public.normalize_route_code(r.codigo_ctp)
)
select
  coalesce(o.route_code_normalized, c.route_code_normalized) as route_code_normalized,
  coalesce(o.official_variant_count, 0) as official_variant_count,
  coalesce(c.current_route_count, 0) as current_route_count,
  o.official_variants,
  c.current_routes,
  (
    coalesce(o.official_variant_count, 0) > 0
    and coalesce(c.current_route_count, 0) > 0
  ) as exists_in_both
from official_routes o
full join current_routes c
  on c.route_code_normalized = o.route_code_normalized
order by route_code_normalized asc nulls last;

comment on view public.staging_ctp_route_code_match_summary is
  'Compara cobertura por codigo entre las variantes oficiales del CTP y la tabla rutas actual.';

grant select on public.staging_ctp_official_stops to authenticated;
grant select on public.staging_ctp_official_route_variants to authenticated;
grant select on public.staging_ctp_route_stop_candidates to authenticated;
grant select on public.staging_ctp_route_stops_inferred to authenticated;
grant select on public.staging_ctp_route_stop_inference_summary to authenticated;
grant select on public.staging_ctp_route_stop_inference_qa to authenticated;
grant select on public.staging_ctp_route_code_match_summary to authenticated;

alter table public.staging_ctp_official_stops enable row level security;
alter table public.staging_ctp_official_route_variants enable row level security;
alter table public.staging_ctp_route_stop_candidates enable row level security;
alter table public.staging_ctp_route_stops_inferred enable row level security;

drop policy if exists staging_ctp_official_stops_read_authenticated on public.staging_ctp_official_stops;
create policy staging_ctp_official_stops_read_authenticated
on public.staging_ctp_official_stops
for select
to authenticated
using (true);

drop policy if exists staging_ctp_official_route_variants_read_authenticated on public.staging_ctp_official_route_variants;
create policy staging_ctp_official_route_variants_read_authenticated
on public.staging_ctp_official_route_variants
for select
to authenticated
using (true);

drop policy if exists staging_ctp_route_stop_candidates_read_authenticated on public.staging_ctp_route_stop_candidates;
create policy staging_ctp_route_stop_candidates_read_authenticated
on public.staging_ctp_route_stop_candidates
for select
to authenticated
using (true);

drop policy if exists staging_ctp_route_stops_inferred_read_authenticated on public.staging_ctp_route_stops_inferred;
create policy staging_ctp_route_stops_inferred_read_authenticated
on public.staging_ctp_route_stops_inferred
for select
to authenticated
using (true);

comment on table public.staging_ctp_official_stops is
  'Staging crudo de paradas oficiales del CTP descargadas desde SNIT/WFS, reproyectadas a EPSG:4326.';

comment on table public.staging_ctp_official_route_variants is
  'Staging crudo de variantes oficiales del CTP; una fila por desplazamiento oficial.';

comment on table public.staging_ctp_route_stop_candidates is
  'Candidatos espaciales parada->variante generados a partir del staging oficial del CTP.';

comment on table public.staging_ctp_route_stops_inferred is
  'Secuencia sugerida de paradas por variante oficial del CTP, lista para QA antes de tocar paradas/ruta_paradas/route_pattern_stops.';
