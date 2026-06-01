set search_path = public, extensions;

alter table public.staging_ctp_official_route_variants
  add column if not exists inference_geo geography;

alter table public.staging_ctp_official_route_variants
  add column if not exists axis_length_m integer;

create index if not exists staging_ctp_official_route_variants_inference_geo_gix
  on public.staging_ctp_official_route_variants
  using gist (inference_geo);

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
    updated_at = timezone('utc', now())
  where rv.inference_geo is distinct from coalesce(rv.geom_axis::geometry, rv.geom)::geography
     or rv.axis_length_m is distinct from case
       when rv.geom_axis is not null then round(st_length(rv.geom_axis::geography, false)::numeric)::integer
       else null
     end;

  get diagnostics v_updated = row_count;
  return coalesce(v_updated, 0);
end;
$$;

comment on function public.refresh_staging_ctp_variant_derived_fields() is
  'Materializa geografia y longitud util para inferencia CTP sin recalcularlas por cada parada candidata.';

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
          rv.inference_geo,
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
              * rv.axis_length_m
            )::numeric
          )::integer
        else null
      end as progress_m,
      rv.axis_length_m as route_axis_length_m,
      (rv.geom_axis is null) as is_geometry_ambiguous
    from scoped_stops s
    join public.staging_ctp_official_route_variants rv
      on st_dwithin(
        s.geo,
        rv.inference_geo,
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
      coalesce(r.stop_description_normalized, '') ~* '(TERMINAL|PARADA FINAL|PARADA INICIAL|ESTACION|TERMINALES DE COSTA RICA|TERMINALES|ULTIMA PARADA)' as is_terminal_hint
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
  'Reconstruye candidatos CTP usando geografia y longitudes precomputadas para acelerar corridas nacionales.';

create or replace function public.refresh_staging_ctp_route_stop_inference_batched(
  p_stop_batch_size integer default 500,
  p_route_batch_size integer default 12,
  p_max_snap_m integer default 65,
  p_high_confidence_snap_m integer default 25,
  p_progress_bucket_m integer default 35,
  p_pause_ms integer default 0
)
returns table (
  stage text,
  row_count bigint
)
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '120min'
as $$
declare
  v_candidate_total bigint := 0;
  v_inferred_total bigint := 0;
  v_inserted bigint;
  v_stop_batch record;
  v_route_batch record;
begin
  if p_stop_batch_size < 100 or p_stop_batch_size > 10000 then
    raise exception 'p_stop_batch_size fuera de rango (%). Usa un valor entre 100 y 10000.', p_stop_batch_size;
  end if;

  if p_route_batch_size < 1 or p_route_batch_size > 100 then
    raise exception 'p_route_batch_size fuera de rango (%). Usa un valor entre 1 y 100.', p_route_batch_size;
  end if;

  if p_pause_ms < 0 or p_pause_ms > 10000 then
    raise exception 'p_pause_ms fuera de rango (%). Usa un valor entre 0 y 10000.', p_pause_ms;
  end if;

  perform public.reset_staging_ctp_route_stop_inference();
  perform public.refresh_staging_ctp_variant_derived_fields();

  analyze public.staging_ctp_official_stops;
  analyze public.staging_ctp_official_route_variants;

  for v_stop_batch in
    select *
    from public.list_staging_ctp_stop_batches(p_stop_batch_size)
    order by batch_no
  loop
    v_inserted := public.refresh_staging_ctp_route_stop_candidates_batch(
      v_stop_batch.stop_source_min,
      v_stop_batch.stop_source_max,
      p_max_snap_m,
      p_high_confidence_snap_m
    );
    v_candidate_total := v_candidate_total + coalesce(v_inserted, 0);

    if p_pause_ms > 0 then
      perform pg_sleep(p_pause_ms::numeric / 1000);
    end if;
  end loop;

  analyze public.staging_ctp_route_stop_candidates;

  for v_route_batch in
    select *
    from public.list_staging_ctp_route_code_batches(p_route_batch_size)
    order by batch_no
  loop
    v_inserted := public.refresh_staging_ctp_route_stops_inferred_batch(
      v_route_batch.route_codes,
      p_progress_bucket_m
    );
    v_inferred_total := v_inferred_total + coalesce(v_inserted, 0);

    if p_pause_ms > 0 then
      perform pg_sleep(p_pause_ms::numeric / 1000);
    end if;
  end loop;

  return query
  select 'candidates'::text, v_candidate_total
  union all
  select 'inferred'::text, v_inferred_total;
end;
$$;

comment on function public.refresh_staging_ctp_route_stop_inference_batched(integer, integer, integer, integer, integer, integer) is
  'Orquesta la inferencia CTP nacional por lotes dentro de Postgres para evitar timeouts de una sola consulta.';

create or replace function public.run_staging_ctp_inference_job(p_run_label text)
returns void
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '120min'
as $$
declare
  v_candidates bigint := 0;
  v_inferred bigint := 0;
begin
  insert into public.staging_ctp_inference_runs (run_label, status)
  values (p_run_label, 'running')
  on conflict (run_label) do update set
    status = 'running',
    started_at = timezone('utc', now()),
    finished_at = null,
    candidates_count = null,
    inferred_count = null,
    error_message = null,
    updated_at = timezone('utc', now());

  select
    max(case when stage = 'candidates' then row_count end),
    max(case when stage = 'inferred' then row_count end)
  into v_candidates, v_inferred
  from public.refresh_staging_ctp_route_stop_inference_batched();

  update public.staging_ctp_inference_runs
  set
    status = 'completed',
    finished_at = timezone('utc', now()),
    candidates_count = coalesce(v_candidates, 0),
    inferred_count = coalesce(v_inferred, 0),
    error_message = null,
    updated_at = timezone('utc', now())
  where run_label = p_run_label;
exception
  when others then
    update public.staging_ctp_inference_runs
    set
      status = 'failed',
      finished_at = timezone('utc', now()),
      error_message = sqlerrm,
      updated_at = timezone('utc', now())
    where run_label = p_run_label;
    raise;
end;
$$;

comment on function public.run_staging_ctp_inference_job(text) is
  'Ejecuta la inferencia CTP completa usando el orquestador por lotes y registra el resultado.';

grant execute on function public.refresh_staging_ctp_variant_derived_fields() to anon, authenticated;
grant execute on function public.refresh_staging_ctp_route_stop_inference_batched(integer, integer, integer, integer, integer, integer) to anon, authenticated;
