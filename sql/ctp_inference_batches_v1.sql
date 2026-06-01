set search_path = public, extensions;

create or replace function public.reset_staging_ctp_route_stop_inference()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  truncate table public.staging_ctp_route_stop_candidates;
  truncate table public.staging_ctp_route_stops_inferred;
end;
$$;

comment on function public.reset_staging_ctp_route_stop_inference() is
  'Limpia las tablas derivadas de inferencia CTP para volver a procesar el staging completo por lotes.';

create or replace function public.list_staging_ctp_stop_batches(
  p_batch_size integer default 2000
)
returns table (
  batch_no integer,
  stop_source_min bigint,
  stop_source_max bigint,
  row_count integer
)
language sql
security definer
set search_path = public, extensions
as $$
  with ordered as (
    select
      s.source_id,
      row_number() over (order by s.source_id asc) as rn
    from public.staging_ctp_official_stops s
  ),
  grouped as (
    select
      floor((rn - 1)::numeric / greatest(1, p_batch_size))::integer as batch_idx,
      source_id
    from ordered
  )
  select
    g.batch_idx + 1 as batch_no,
    min(g.source_id) as stop_source_min,
    max(g.source_id) as stop_source_max,
    count(*)::integer as row_count
  from grouped g
  group by g.batch_idx
  order by g.batch_idx;
$$;

comment on function public.list_staging_ctp_stop_batches(integer) is
  'Devuelve rangos balanceados de source_id para procesar candidatos CTP por lotes de paradas.';

create or replace function public.list_staging_ctp_route_code_batches(
  p_batch_size integer default 10
)
returns table (
  batch_no integer,
  route_codes text[],
  route_count integer
)
language sql
security definer
set search_path = public, extensions
as $$
  with distinct_codes as (
    select distinct rv.route_code_normalized
    from public.staging_ctp_official_route_variants rv
    where rv.route_code_normalized is not null
  ),
  ordered as (
    select
      dc.route_code_normalized,
      row_number() over (order by dc.route_code_normalized asc) as rn
    from distinct_codes dc
  ),
  grouped as (
    select
      floor((rn - 1)::numeric / greatest(1, p_batch_size))::integer as batch_idx,
      route_code_normalized
    from ordered
  )
  select
    g.batch_idx + 1 as batch_no,
    array_agg(g.route_code_normalized order by g.route_code_normalized asc) as route_codes,
    count(*)::integer as route_count
  from grouped g
  group by g.batch_idx
  order by g.batch_idx;
$$;

comment on function public.list_staging_ctp_route_code_batches(integer) is
  'Agrupa codigos de ruta normalizados para reconstruir secuencias inferidas por lotes.';

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
  with scoped_stops as (
    select
      s.source_id,
      s.description_normalized,
      s.geom,
      s.geo
    from public.staging_ctp_official_stops s
    where s.source_id between p_stop_source_min and p_stop_source_max
  ),
  candidate_base as (
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
          coalesce(rv.geom_axis::geography, rv.geom::geography),
          false
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
              * st_length(rv.geom_axis::geography, false)
            )::numeric
          )::integer
        else null
      end as progress_m,
      case
        when rv.geom_axis is not null then
          round(st_length(rv.geom_axis::geography, false)::numeric)::integer
        else null
      end as route_axis_length_m,
      (rv.geom_axis is null) as is_geometry_ambiguous
    from scoped_stops s
    join public.staging_ctp_official_route_variants rv
      on st_dwithin(
        s.geo,
        coalesce(rv.geom_axis::geography, rv.geom::geography),
        p_max_snap_m,
        false
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
                  when not h.is_geometry_ambiguous and h.line_fraction between 0 and 1 then 1.00
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
  return coalesce(v_candidate_count, 0);
end;
$$;

comment on function public.refresh_staging_ctp_route_stop_candidates_batch(bigint, bigint, integer, integer) is
  'Reconstruye candidatos CTP para un rango de paradas. Mantiene la competencia global entre variantes y evita timeouts nacionales.';

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
  return coalesce(v_inferred_count, 0);
end;
$$;

comment on function public.refresh_staging_ctp_route_stops_inferred_batch(text[], integer) is
  'Reconstruye secuencias sugeridas CTP por lotes de codigos de ruta usando los candidatos ya calculados.';

create or replace function public.get_staging_ctp_inference_counts()
returns table (
  candidate_count bigint,
  inferred_count bigint,
  alta_count bigint,
  media_count bigint,
  baja_count bigint,
  manual_count bigint
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    (select count(*) from public.staging_ctp_route_stop_candidates) as candidate_count,
    (select count(*) from public.staging_ctp_route_stops_inferred) as inferred_count,
    (select count(*) from public.staging_ctp_route_stop_candidates where confidence_label = 'alta') as alta_count,
    (select count(*) from public.staging_ctp_route_stop_candidates where confidence_label = 'media') as media_count,
    (select count(*) from public.staging_ctp_route_stop_candidates where confidence_label = 'baja') as baja_count,
    (select count(*) from public.staging_ctp_route_stop_candidates where confidence_label = 'manual') as manual_count;
$$;

comment on function public.get_staging_ctp_inference_counts() is
  'Resumen rapido de candidatos e inferidas para validar una corrida nacional por lotes.';

grant execute on function public.reset_staging_ctp_route_stop_inference() to anon, authenticated;
grant execute on function public.list_staging_ctp_stop_batches(integer) to anon, authenticated;
grant execute on function public.list_staging_ctp_route_code_batches(integer) to anon, authenticated;
grant execute on function public.refresh_staging_ctp_route_stop_candidates_batch(bigint, bigint, integer, integer) to anon, authenticated;
grant execute on function public.refresh_staging_ctp_route_stops_inferred_batch(text[], integer) to anon, authenticated;
grant execute on function public.get_staging_ctp_inference_counts() to anon, authenticated;
