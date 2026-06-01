set search_path = public, extensions;

create or replace function public.route_stop_quality_audit(
  p_ruta_id integer default null,
  p_sentido text default null
)
returns table (
  ruta_id bigint,
  nombre_ruta text,
  codigo_ctp text,
  sentido text,
  parada_id bigint,
  parada_nombre text,
  ruta_paradas_orden integer,
  route_pattern_stop_sequence integer,
  route_pattern_ids bigint[],
  visible_en_app boolean,
  issues text[]
)
language sql
stable
set search_path = public, extensions
as $$
with ruta_side as (
  select
    rp.ruta_id::bigint as ruta_id,
    rp.sentido,
    rp.parada_id::bigint as parada_id,
    min(rp.orden) as ruta_paradas_orden
  from public.ruta_paradas rp
  where (p_ruta_id is null or rp.ruta_id = p_ruta_id)
    and (p_sentido is null or rp.sentido = p_sentido)
  group by rp.ruta_id, rp.sentido, rp.parada_id
),
pattern_side as (
  select
    rp.ruta_id::bigint as ruta_id,
    rp.sentido,
    rps.parada_id::bigint as parada_id,
    min(rps.stop_sequence) as route_pattern_stop_sequence,
    array_agg(distinct rp.id order by rp.id) as route_pattern_ids
  from public.route_patterns rp
  join public.route_pattern_stops rps
    on rps.pattern_id = rp.id
  where rp.activo = true
    and (p_ruta_id is null or rp.ruta_id = p_ruta_id)
    and (p_sentido is null or rp.sentido = p_sentido)
  group by rp.ruta_id, rp.sentido, rps.parada_id
),
joined as (
  select
    coalesce(rs.ruta_id, ps.ruta_id) as ruta_id,
    coalesce(rs.sentido, ps.sentido) as sentido,
    coalesce(rs.parada_id, ps.parada_id) as parada_id,
    rs.ruta_paradas_orden,
    ps.route_pattern_stop_sequence,
    ps.route_pattern_ids
  from ruta_side rs
  full join pattern_side ps
    on ps.ruta_id = rs.ruta_id
   and ps.sentido = rs.sentido
   and ps.parada_id = rs.parada_id
)
select
  j.ruta_id,
  r.nombre_ruta,
  r.codigo_ctp,
  j.sentido,
  j.parada_id,
  coalesce(nullif(trim(p.nombre), ''), 'Parada sin nombre') as parada_nombre,
  j.ruta_paradas_orden,
  j.route_pattern_stop_sequence,
  coalesce(j.route_pattern_ids, '{}'::bigint[]) as route_pattern_ids,
  (j.route_pattern_stop_sequence is not null) as visible_en_app,
  array_remove(
    array[
      case when p.id is null then 'missing_in_paradas' end,
      case when p.id is not null and coalesce(nullif(trim(p.nombre), ''), '') = '' then 'missing_stop_name' end,
      case when j.ruta_paradas_orden is null then 'missing_in_ruta_paradas' end,
      case when j.route_pattern_stop_sequence is null then 'missing_in_route_pattern_stops' end
    ],
    null
  ) as issues
from joined j
join public.rutas r
  on r.id = j.ruta_id
left join public.paradas p
  on p.id = j.parada_id
order by
  j.ruta_id asc,
  j.sentido asc,
  coalesce(j.ruta_paradas_orden, j.route_pattern_stop_sequence, 2147483647) asc,
  j.parada_id asc;
$$;

grant execute on function public.route_stop_quality_audit(integer, text)
  to authenticated;

comment on function public.route_stop_quality_audit(integer, text) is
  'Audita por ruta y sentido si una parada existe en paradas, ruta_paradas y route_pattern_stops, y si por tanto queda visible para la app.';

create or replace function public.route_stop_quality_summary(
  p_ruta_id integer default null,
  p_sentido text default null
)
returns table (
  ruta_id bigint,
  nombre_ruta text,
  codigo_ctp text,
  sentido text,
  ruta_paradas_count integer,
  route_pattern_stops_count integer,
  missing_in_route_pattern_stops_count integer,
  missing_in_ruta_paradas_count integer,
  unnamed_stops_count integer,
  duplicate_route_orders_count integer,
  duplicate_pattern_sequences_count integer,
  visible_en_app boolean
)
language sql
stable
set search_path = public, extensions
as $$
with audit as (
  select *
  from public.route_stop_quality_audit(p_ruta_id, p_sentido)
),
route_order_duplicates as (
  select
    rp.ruta_id::bigint as ruta_id,
    rp.sentido,
    count(*)::integer as duplicate_route_orders_count
  from (
    select
      ruta_id,
      sentido,
      orden
    from public.ruta_paradas
    where (p_ruta_id is null or ruta_id = p_ruta_id)
      and (p_sentido is null or sentido = p_sentido)
    group by ruta_id, sentido, orden
    having count(*) > 1
  ) rp
  group by rp.ruta_id, rp.sentido
),
pattern_sequence_duplicates as (
  select
    rp.ruta_id::bigint as ruta_id,
    rp.sentido,
    count(*)::integer as duplicate_pattern_sequences_count
  from (
    select
      rps.pattern_id,
      rps.stop_sequence
    from public.route_pattern_stops rps
    group by rps.pattern_id, rps.stop_sequence
    having count(*) > 1
  ) dup
  join public.route_patterns rp
    on rp.id = dup.pattern_id
  where rp.activo = true
    and (p_ruta_id is null or rp.ruta_id = p_ruta_id)
    and (p_sentido is null or rp.sentido = p_sentido)
  group by rp.ruta_id, rp.sentido
)
select
  audit.ruta_id,
  max(audit.nombre_ruta) as nombre_ruta,
  max(audit.codigo_ctp) as codigo_ctp,
  audit.sentido,
  count(*) filter (where audit.ruta_paradas_orden is not null)::integer as ruta_paradas_count,
  count(*) filter (where audit.route_pattern_stop_sequence is not null)::integer as route_pattern_stops_count,
  count(*) filter (
    where 'missing_in_route_pattern_stops' = any(audit.issues)
  )::integer as missing_in_route_pattern_stops_count,
  count(*) filter (
    where 'missing_in_ruta_paradas' = any(audit.issues)
  )::integer as missing_in_ruta_paradas_count,
  count(*) filter (
    where 'missing_stop_name' = any(audit.issues)
  )::integer as unnamed_stops_count,
  coalesce(max(rod.duplicate_route_orders_count), 0) as duplicate_route_orders_count,
  coalesce(max(psd.duplicate_pattern_sequences_count), 0) as duplicate_pattern_sequences_count,
  (
    count(*) filter (where 'missing_in_route_pattern_stops' = any(audit.issues)) = 0
    and count(*) filter (where audit.route_pattern_stop_sequence is not null) > 0
  ) as visible_en_app
from audit
left join route_order_duplicates rod
  on rod.ruta_id = audit.ruta_id
 and rod.sentido = audit.sentido
left join pattern_sequence_duplicates psd
  on psd.ruta_id = audit.ruta_id
 and psd.sentido = audit.sentido
group by audit.ruta_id, audit.sentido
order by audit.ruta_id asc, audit.sentido asc;
$$;

grant execute on function public.route_stop_quality_summary(integer, text)
  to authenticated;

comment on function public.route_stop_quality_summary(integer, text) is
  'Resume por ruta y sentido los problemas de calidad de paradas: faltantes en route_pattern_stops, faltantes en ruta_paradas, nombres vacios y duplicados de secuencia.';
