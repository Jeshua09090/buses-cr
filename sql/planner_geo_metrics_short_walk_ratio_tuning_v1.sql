-- Tightens the geo metric used by buscar_viajes_0_1_transbordo_v3.
-- Short urban trips should not reward a bus option when the user still walks
-- almost the entire origin-destination distance.

do $migration$
declare
  function_signature regprocedure := 'public.planner_calculate_journey_geo_metrics(double precision,double precision,double precision,double precision,bigint,bigint,bigint,bigint,bigint,bigint,text,numeric,integer)'::regprocedure;
  ddl text := pg_get_functiondef(function_signature);
  old_penalty text := $old$
    (
      case
        when q.total_walk_ratio is null then 0
        when q.total_walk_ratio > 0.55 and coalesce(q.total_walk_m, 0) >= 650 then 160
        when q.total_walk_ratio > 0.42 and coalesce(q.total_walk_m, 0) >= 550 then 80
        else 0
      end
    )::numeric as walk_ratio_penalty_m,$old$;
  new_penalty text := $new$
    (
      case
        when q.total_walk_ratio is null then 0
        when q.straight_line_m <= 1000
          and q.total_walk_ratio > 0.85
          and coalesce(q.total_walk_m, 0) >= 450 then 260
        when q.straight_line_m <= 1200
          and q.total_walk_ratio > 0.70
          and coalesce(q.total_walk_m, 0) >= 500 then 180
        when q.total_walk_ratio > 0.55 and coalesce(q.total_walk_m, 0) >= 650 then 160
        when q.total_walk_ratio > 0.42 and coalesce(q.total_walk_m, 0) >= 550 then 80
        else 0
      end
    )::numeric as walk_ratio_penalty_m,$new$;
  old_flag text := $old$
      case when p.total_walk_ratio > 0.42 and coalesce(p.total_walk_m, 0) >= 550 then 'walk_ratio_high' end$old$;
  new_flag text := $new$
      case
        when (
          p.straight_line_m <= 1000
          and p.total_walk_ratio > 0.85
          and coalesce(p.total_walk_m, 0) >= 450
        )
          or (
            p.straight_line_m <= 1200
            and p.total_walk_ratio > 0.70
            and coalesce(p.total_walk_m, 0) >= 500
          )
          or (
            p.total_walk_ratio > 0.42
            and coalesce(p.total_walk_m, 0) >= 550
          )
          then 'walk_ratio_high'
      end$new$;
begin
  if position(old_penalty in ddl) = 0 then
    raise exception 'Expected walk_ratio_penalty_m snippet was not found';
  end if;

  if position(old_flag in ddl) = 0 then
    raise exception 'Expected walk_ratio_high flag snippet was not found';
  end if;

  ddl := replace(ddl, old_penalty, new_penalty);
  ddl := replace(ddl, old_flag, new_flag);
  execute ddl;
end;
$migration$;
