-- Broaden the global nearby-stop cap used by the modern planner.
--
-- After seeding more Cartago regional/runtime patterns, dense downtown origins can
-- have hundreds of candidate pattern-stop rows before a practical local route
-- appears. Keeping rn_pattern <= 3 preserves per-route pruning, while a wider
-- rn_global cap lets local routes such as Cartago-San Isidro/El Molino and
-- Cartago-Tablon compete instead of forcing odd regional "connector" trips.
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
    'and ocr.rn_global <= 480',
    'g'
  );
  function_sql := regexp_replace(
    function_sql,
    'and dcr[.]rn_global <= [0-9]+',
    'and dcr.rn_global <= 480',
    'g'
  );

  if function_sql not like '%and ocr.rn_global <= 480%'
    or function_sql not like '%and dcr.rn_global <= 480%' then
    raise exception 'Could not update planner candidate global limits';
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
