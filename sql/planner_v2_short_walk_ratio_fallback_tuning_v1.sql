-- Keeps the v2 fallback from ranking a short urban bus trip above better
-- candidates when the user still walks almost the whole origin-destination span.

create or replace function public.planner_short_walk_ratio_penalty(
  p_straight_line_m integer,
  p_total_walk_m integer
)
returns integer
language sql
immutable
as $$
  select case
    when p_straight_line_m is null or p_straight_line_m <= 0 or p_total_walk_m is null then 0
    when p_straight_line_m <= 1000
      and p_total_walk_m >= 450
      and (p_total_walk_m::numeric / p_straight_line_m::numeric) > 0.85 then 260
    when p_straight_line_m <= 1200
      and p_total_walk_m >= 500
      and (p_total_walk_m::numeric / p_straight_line_m::numeric) > 0.70 then 180
    else 0
  end;
$$;

do $migration$
declare
  function_signature regprocedure := 'public.buscar_viajes_0_1_transbordo_v2(double precision,double precision,double precision,double precision,integer,integer,integer,integer,text,timestamp with time zone,boolean,integer)'::regprocedure;
  ddl text := pg_get_functiondef(function_signature);
  straight_line_expression text := $expr$st_distance(
    st_setsrid(st_makepoint(p_origen_lng, p_origen_lat), 4326)::geography,
    st_setsrid(st_makepoint(p_destino_lng, p_destino_lat), 4326)::geography
  )::integer$expr$;
  old_score_select text := $old$  results.score,
  results.ruta_1_id,$old$;
  new_score_select text;
  old_order text := $old$order by results.score asc, results.transbordos asc, results.caminata_total_m asc$old$;
  new_order text;
begin
  new_score_select := '  (results.score + public.planner_short_walk_ratio_penalty(' || straight_line_expression || ', results.caminata_total_m))::numeric as score,' || chr(10) || '  results.ruta_1_id,';
  new_order := 'order by (results.score + public.planner_short_walk_ratio_penalty(' || straight_line_expression || ', results.caminata_total_m)) asc, results.transbordos asc, results.caminata_total_m asc';

  if position(old_score_select in ddl) = 0 then
    raise exception 'Expected v2 score select snippet was not found';
  end if;

  if position(old_order in ddl) = 0 then
    raise exception 'Expected v2 order snippet was not found';
  end if;

  ddl := replace(ddl, old_score_select, new_score_select);
  ddl := replace(ddl, old_order, new_order);
  execute ddl;
end;
$migration$;
