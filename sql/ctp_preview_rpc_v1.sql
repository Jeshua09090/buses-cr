set search_path = public, extensions;

create or replace function public.ctp_preview_route_variant_map()
returns table (
  ruta_id integer,
  route_code text,
  variant_code text,
  preview_scope text,
  preview_priority integer
)
language sql
stable
as $$
  select 4719, '323', '0323-B-1', 'route_stops', 10
  union all
  select 4719, '323', '0323-B-1', 'nearby_stops', 10
  union all
  select 4692, '300', '0300-L-1', 'nearby_stops', 10
  union all
  select 4692, '300', '0300-L-2', 'nearby_stops', 20
  union all
  select 4692, '300', '0300-O-3', 'nearby_stops', 30;
$$;

comment on function public.ctp_preview_route_variant_map() is
  'Mapa controlado de rutas productivas hacia variantes oficiales del CTP disponibles solo para preview en la app.';

create or replace function public.ctp_preview_nearby_stops(
  p_lat double precision,
  p_lng double precision,
  p_limit integer default 6,
  p_radius_m integer default 400
)
returns table (
  id text,
  stop_name text,
  route_id integer,
  route_name text,
  route_code text,
  distance_m integer
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as geo
  ),
  preview_map as (
    select *
    from public.ctp_preview_route_variant_map()
    where preview_scope = 'nearby_stops'
  ),
  nearby as (
    select
      pm.ruta_id,
      pm.route_code,
      pm.preview_priority,
      s.source_id as stop_source_id,
      coalesce(s.description_raw, 'Parada oficial CTP') as stop_name,
      coalesce(nullif(r.nombre_ruta, ''), rv.description_raw, 'Ruta oficial CTP') as route_name_base,
      round(st_distance(s.geo, o.geo)::numeric)::integer as distance_m,
      i.suggested_stop_sequence,
      row_number() over (
        partition by pm.ruta_id, s.source_id
        order by pm.preview_priority asc, i.suggested_stop_sequence asc, rv.source_id asc
      ) as same_stop_rank
    from preview_map pm
    join public.staging_ctp_official_route_variants rv
      on rv.variant_code = pm.variant_code
    join public.staging_ctp_route_stops_inferred i
      on i.variant_source_id = rv.source_id
    join public.staging_ctp_official_stops s
      on s.source_id = i.stop_source_id
    left join public.rutas r
      on r.id = pm.ruta_id
    cross join origin o
    where st_dwithin(s.geo, o.geo, greatest(50, least(coalesce(p_radius_m, 400), 1200)))
      and i.confidence_label in ('alta', 'media', 'baja')
      and coalesce(i.manual_review_required, false) = false
  )
  select
    format('ctp:%s:%s', n.ruta_id, n.stop_source_id) as id,
    n.stop_name,
    n.ruta_id as route_id,
    n.route_name_base || ' - preview CTP' as route_name,
    n.route_code,
    n.distance_m
  from nearby n
  where n.same_stop_rank = 1
  order by n.distance_m asc, n.preview_priority asc, n.suggested_stop_sequence asc
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;

comment on function public.ctp_preview_nearby_stops(double precision, double precision, integer, integer) is
  'Devuelve paradas oficiales del CTP cercanas para un preview controlado en la app sin tocar la red productiva.';

create or replace function public.ctp_preview_route_stops(
  p_ruta_id integer
)
returns table (
  parada_id integer,
  nombre text,
  lat double precision,
  lng double precision,
  tiene_techo boolean,
  accesible boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with preview_map as (
    select *
    from public.ctp_preview_route_variant_map()
    where preview_scope = 'route_stops'
      and ruta_id = p_ruta_id
  ),
  staged as (
    select
      (-1 * s.source_id)::integer as parada_id,
      coalesce(s.description_raw, 'Parada oficial CTP') as nombre,
      s.lat,
      s.lng,
      null::boolean as tiene_techo,
      null::boolean as accesible,
      i.suggested_stop_sequence,
      row_number() over (
        partition by s.source_id
        order by pm.preview_priority asc, i.suggested_stop_sequence asc, rv.source_id asc
      ) as same_stop_rank
    from preview_map pm
    join public.staging_ctp_official_route_variants rv
      on rv.variant_code = pm.variant_code
    join public.staging_ctp_route_stops_inferred i
      on i.variant_source_id = rv.source_id
    join public.staging_ctp_official_stops s
      on s.source_id = i.stop_source_id
    where i.confidence_label in ('alta', 'media', 'baja')
      and coalesce(i.manual_review_required, false) = false
  )
  select
    staged.parada_id,
    staged.nombre,
    staged.lat,
    staged.lng,
    staged.tiene_techo,
    staged.accesible
  from staged
  where staged.same_stop_rank = 1
  order by staged.suggested_stop_sequence asc;
$$;

comment on function public.ctp_preview_route_stops(integer) is
  'Devuelve una secuencia de paradas oficiales del CTP para rutas habilitadas en preview dentro de la app.';

grant execute on function public.ctp_preview_route_variant_map() to anon, authenticated;
grant execute on function public.ctp_preview_nearby_stops(double precision, double precision, integer, integer) to anon, authenticated;
grant execute on function public.ctp_preview_route_stops(integer) to anon, authenticated;
