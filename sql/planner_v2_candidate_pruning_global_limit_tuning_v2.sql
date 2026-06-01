-- Widen the modern planner global candidate cap one more step.
--
-- Cartago centro -> La Campina needs the direct 4227 boarding stop near Colegio
-- Nocturno. In dense downtown searches that stop ranks around rn_global=548, so
-- the 480 cap still left the planner preferring low-value connector transfers.
-- The per-pattern cap remains rn_pattern <= 3, which keeps the expansion bounded.
do $$
declare
  function_signature regprocedure :=
    'public.buscar_viajes_0_1_transbordo_v2(double precision,double precision,double precision,double precision,integer,integer,integer,integer,text,timestamp with time zone,boolean,integer)'::regprocedure;
  function_sql text;
begin
  select pg_get_functiondef(function_signature) into function_sql;

  function_sql := regexp_replace(
    function_sql,
    'and ocr[.]rn_global <= [0-9]+',
    'and ocr.rn_global <= 650',
    'g'
  );
  function_sql := regexp_replace(
    function_sql,
    'and dcr[.]rn_global <= [0-9]+',
    'and dcr.rn_global <= 650',
    'g'
  );

  if function_sql not like '%and ocr.rn_global <= 650%'
    or function_sql not like '%and dcr.rn_global <= 650%' then
    raise exception 'Could not update planner candidate global limits to 650';
  end if;

  execute function_sql;
end $$;

comment on function public.buscar_viajes_0_1_transbordo_v2(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  integer,
  integer,
  integer,
  text,
  timestamp with time zone,
  boolean,
  integer
) is 'Modern route-pattern planner with widened global nearby-stop pruning for dense Cartago origins.';
