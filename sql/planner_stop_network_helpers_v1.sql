set search_path = public, extensions;

create or replace view public.planner_linked_parada_display_names as
select
  ranked.parada_id,
  ranked.parada_nombre,
  ranked.boarding_key,
  ranked.boarding_name,
  ranked.parent_area_id,
  ranked.linked_distance_m,
  ranked.family_count,
  ranked.route_count
from (
  select
    bp.linked_parada_id as parada_id,
    coalesce(
      nullif(trim(bp.boarding_name), ''),
      nullif(trim(p.nombre), ''),
      'Parada de buses'
    ) as parada_nombre,
    bp.boarding_key,
    bp.boarding_name,
    bp.parent_area_id,
    coalesce((bp.metadata ->> 'linked_parada_distance_m')::integer, 999999) as linked_distance_m,
    bp.family_count,
    bp.route_count,
    row_number() over (
      partition by bp.linked_parada_id
      order by
        coalesce((bp.metadata ->> 'linked_parada_distance_m')::integer, 999999) asc,
        bp.family_count desc,
        bp.route_count desc,
        bp.id asc
    ) as rn
  from public.planner_boarding_points bp
  left join public.paradas p
    on p.id = bp.linked_parada_id
  where bp.activo = true
    and bp.linked_parada_id is not null
) ranked
where ranked.rn = 1;

grant select on public.planner_linked_parada_display_names to anon, authenticated;

create or replace function public.planner_nearby_runtime_stops(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 600
)
returns table (
  parada_id bigint,
  parada_nombre text,
  distance_m integer,
  source text
)
language sql
stable
set search_path = public, extensions
as $$
with point as (
  select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
),
boarding_ranked as (
  select
    bp.linked_parada_id as parada_id,
    coalesce(
      nullif(trim(bp.boarding_name), ''),
      nullif(trim(display_name.parada_nombre), ''),
      'Parada de buses'
    ) as parada_nombre,
    st_distance(bp.geo, point.g)::integer as distance_m,
    row_number() over (
      partition by bp.linked_parada_id
      order by
        st_distance(bp.geo, point.g) asc,
        bp.family_count desc,
        bp.route_count desc,
        bp.id asc
    ) as rn
  from point
  join public.planner_boarding_points bp
    on bp.activo = true
   and bp.linked_parada_id is not null
   and st_dwithin(bp.geo, point.g, p_radius_m)
  left join public.planner_linked_parada_display_names display_name
    on display_name.parada_id = bp.linked_parada_id
),
boarding_best as (
  select
    parada_id,
    parada_nombre,
    distance_m,
    'boarding_point'::text as source
  from boarding_ranked
  where rn = 1
),
raw_only as (
  select
    p.id as parada_id,
    coalesce(nullif(trim(p.nombre), ''), 'Parada de buses') as parada_nombre,
    st_distance(p.geo, point.g)::integer as distance_m,
    'raw_parada'::text as source
  from point
  join public.paradas p
    on p.activo = true
   and st_dwithin(p.geo, point.g, p_radius_m)
  where not exists (
    select 1
    from boarding_best bb
    where bb.parada_id = p.id
  )
)
select *
from boarding_best
union all
select *
from raw_only;
$$;

grant execute on function public.planner_nearby_runtime_stops(double precision, double precision, integer)
  to anon, authenticated;

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
with legacy_edges as (
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
          when 'boarding_edge' then 0
          else 1
        end asc,
        case c.transfer_type
          when 'same_macro' then 0
          when 'hub_walk' then 1
          when 'nearby_walk' then 2
          else 3
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

grant execute on function public.planner_runtime_transfer_links(integer)
  to anon, authenticated;

comment on view public.planner_linked_parada_display_names is
  'Mejor nombre disponible por parada runtime, priorizando boarding points enlazados sobre nombres legacy genericos.';

comment on function public.planner_nearby_runtime_stops(double precision, double precision, integer) is
  'Devuelve paradas runtime cercanas usando primero boarding_points enlazados y luego fallback a public.paradas.';

comment on function public.planner_runtime_transfer_links(integer) is
  'Combina planner_transfer_edges y transbordos legacy en un set de transferencias runtime deduplicado.';
