-- Let regional direct boardings compete from dense Cartago origins.
--
-- Terminal Cartago -> Prusia/Sanatorio exposes a practical regional boarding at
-- AL COSTADO DE ESCUELA DE SORDOS for 0307-B/C. That stop is about 819 m from
-- the terminal pin and ranks around rn_global=797, so the 650 cap still favored
-- artificial connector transfers. The per-pattern cap stays at rn_pattern <= 3.
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
    'and ocr.rn_global <= 900',
    'g'
  );
  function_sql := regexp_replace(
    function_sql,
    'and dcr[.]rn_global <= [0-9]+',
    'and dcr.rn_global <= 900',
    'g'
  );

  if function_sql not like '%and ocr.rn_global <= 900%'
    or function_sql not like '%and dcr.rn_global <= 900%' then
    raise exception 'Could not update planner candidate global limits to 900';
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
