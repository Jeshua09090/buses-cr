set search_path = public, extensions;

-- Allow true same-stop transfers in the modern planner.
-- Without this, a rider can alight and board at the same parada_id, but
-- buscar_viajes_0_1_transbordo_v2 cannot see the transfer unless there is an
-- explicit transfer edge. That hides good connections like Taras/San Nicolas
-- -> 0331 at Plaza Iglesias and lets worse long-walk fallbacks surface.

create or replace function public.planner_runtime_transfer_links(
  p_max_distance_m integer default null
)
returns table (
  parada_origen_id bigint,
  parada_destino_id bigint,
  distancia_caminando_m integer,
  transfer_type text,
  transfer_confidence numeric,
  transfer_source text
)
language sql
stable
set search_path = public, extensions
as $$
with same_stop_edges as (
  select
    p.id::bigint as parada_origen_id,
    p.id::bigint as parada_destino_id,
    0::integer as distancia_caminando_m,
    'same_stop'::text as transfer_type,
    1.00::numeric as transfer_confidence,
    'same_stop'::text as transfer_source
  from public.paradas p
  where p.activo = true
    and (p_max_distance_m is null or p_max_distance_m >= 0)
),
legacy_edges as (
  select
    t.parada_origen_id,
    t.parada_destino_id,
    t.distancia_caminando_m,
    'legacy'::text as transfer_type,
    0.50::numeric as transfer_confidence,
    'transbordos'::text as transfer_source
  from public.transbordos t
  where t.activo = true
    and (p_max_distance_m is null or t.distancia_caminando_m <= p_max_distance_m)

  union all

  select
    t.parada_destino_id,
    t.parada_origen_id,
    t.distancia_caminando_m,
    'legacy'::text as transfer_type,
    0.50::numeric as transfer_confidence,
    'transbordos'::text as transfer_source
  from public.transbordos t
  where t.activo = true
    and t.bidireccional = true
    and (p_max_distance_m is null or t.distancia_caminando_m <= p_max_distance_m)
),
boarding_ranked as (
  select
    b1.linked_parada_id as parada_origen_id,
    b2.linked_parada_id as parada_destino_id,
    e.distance_m as distancia_caminando_m,
    e.transfer_type,
    e.confidence as transfer_confidence,
    'boarding_edge'::text as transfer_source,
    row_number() over (
      partition by b1.linked_parada_id, b2.linked_parada_id
      order by
        case e.transfer_type
          when 'same_macro' then 0
          when 'hub_walk' then 1
          when 'nearby_walk' then 2
          else 3
        end asc,
        e.distance_m asc,
        e.confidence desc,
        e.id asc
    ) as rn
  from public.planner_transfer_edges e
  join public.planner_boarding_points b1
    on b1.id = e.from_boarding_point_id
   and b1.activo = true
   and b1.linked_parada_id is not null
  join public.planner_boarding_points b2
    on b2.id = e.to_boarding_point_id
   and b2.activo = true
   and b2.linked_parada_id is not null
   and b2.linked_parada_id <> b1.linked_parada_id
  where e.activo = true
    and (p_max_distance_m is null or e.distance_m <= p_max_distance_m)
),
boarding_best as (
  select
    parada_origen_id,
    parada_destino_id,
    distancia_caminando_m,
    transfer_type,
    transfer_confidence,
    transfer_source
  from boarding_ranked
  where rn = 1
),
combined as (
  select * from same_stop_edges
  union all
  select * from boarding_best
  union all
  select * from legacy_edges
),
ranked as (
  select
    c.*,
    row_number() over (
      partition by c.parada_origen_id, c.parada_destino_id
      order by
        case c.transfer_source
          when 'same_stop' then 0
          when 'boarding_edge' then 1
          else 2
        end asc,
        case c.transfer_type
          when 'same_stop' then 0
          when 'same_macro' then 1
          when 'hub_walk' then 2
          when 'nearby_walk' then 3
          else 4
        end asc,
        c.distancia_caminando_m asc,
        c.transfer_confidence desc
    ) as rn
  from combined c
)
select
  parada_origen_id,
  parada_destino_id,
  distancia_caminando_m,
  transfer_type,
  transfer_confidence,
  transfer_source
from ranked
where rn = 1;
$$;

comment on function public.planner_runtime_transfer_links(integer) is
  'Returns deduped transfer links for the planner, including zero-meter same-stop transfers.';

grant execute on function public.planner_runtime_transfer_links(integer) to anon, authenticated;
