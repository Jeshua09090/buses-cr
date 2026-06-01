set search_path = public, extensions;

create or replace function public.ctp_locate_official_variants_near_point(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 120
)
returns table (
  route_code text,
  variant_code text,
  description_raw text,
  direction_raw text,
  distance_m integer,
  has_geom_axis boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as geo
  )
  select
    rv.route_code,
    rv.variant_code,
    rv.description_raw,
    rv.direction_raw,
    round(
      st_distance(
        coalesce(rv.geom_axis::geography, rv.geom::geography),
        o.geo
      )
    )::integer as distance_m,
    (rv.geom_axis is not null) as has_geom_axis
  from public.staging_ctp_official_route_variants rv
  cross join origin o
  where st_dwithin(
    coalesce(rv.geom_axis::geography, rv.geom::geography),
    o.geo,
    greatest(20, least(coalesce(p_radius_m, 120), 1000))
  )
  order by distance_m asc, rv.route_code asc, rv.variant_code asc;
$$;

comment on function public.ctp_locate_official_variants_near_point(double precision, double precision, integer) is
  'Ubica variantes oficiales CTP que pasan cerca de un punto. Sirve para rastrear rutas por geometria cuando el nombre publico no coincide con el runtime.';

grant execute on function public.ctp_locate_official_variants_near_point(double precision, double precision, integer)
to anon, authenticated;

create or replace function public.ctp_locate_official_stops_near_point(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 120
)
returns table (
  stop_source_id bigint,
  stop_name text,
  distance_m integer
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as geo
  )
  select
    s.source_id as stop_source_id,
    coalesce(s.description_raw, 'Parada oficial CTP') as stop_name,
    round(st_distance(s.geo, o.geo))::integer as distance_m
  from public.staging_ctp_official_stops s
  cross join origin o
  where st_dwithin(
    s.geo,
    o.geo,
    greatest(20, least(coalesce(p_radius_m, 120), 1000))
  )
  order by distance_m asc, s.source_id asc;
$$;

comment on function public.ctp_locate_official_stops_near_point(double precision, double precision, integer) is
  'Ubica paradas oficiales CTP cercanas a un punto para inspeccion manual por mapa/zona.';

grant execute on function public.ctp_locate_official_stops_near_point(double precision, double precision, integer)
to anon, authenticated;
