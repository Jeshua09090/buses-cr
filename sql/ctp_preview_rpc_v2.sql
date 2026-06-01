set search_path = public, extensions;

drop function if exists public.ctp_preview_nearby_stops(double precision, double precision, integer, integer);
drop function if exists public.ctp_preview_route_stops(integer);
drop function if exists public.ctp_preview_route_variant_map();

create or replace function public.ctp_preview_route_variant_map()
returns table (
  ruta_id integer,
  route_code text,
  variant_family_code text,
  variant_code text,
  preview_scope text,
  preview_priority integer
)
language sql
stable
as $$
  select 4719, '323', '0323-B', '0323-B-1', 'route_stops', 10
  union all
  select 4719, '323', '0323-B', null, 'nearby_stops', 10
  union all
  select 4692, '300', '0300-L', null, 'nearby_stops', 10
  union all
  select 4692, '300', '0300-J', null, 'nearby_stops', 20
  union all
  select 4692, '300', '0300-O', null, 'nearby_stops', 30
  union all
  select 4693, '300', '0300-F', null, 'nearby_stops', 10
  union all
  select 4695, '300', '0300-C', null, 'nearby_stops', 10
  union all
  select 4695, '300', '0300-Y', null, 'nearby_stops', 20;
$$;

comment on function public.ctp_preview_route_variant_map() is
  'Mapa controlado de rutas productivas hacia familias y variantes oficiales del CTP habilitadas en preview.';

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
      pc.stop_source_id,
      coalesce(pc.stop_description, 'Parada oficial CTP') as stop_name,
      coalesce(nullif(r.nombre_ruta, ''), rv.description_raw, 'Ruta oficial CTP') as route_name_base,
      round(st_distance(s.geo, o.geo)::numeric)::integer as distance_m,
      pc.suggested_stop_sequence,
      pc.variant_code,
      row_number() over (
        partition by pm.ruta_id, pc.stop_source_id
        order by
          pm.preview_priority asc,
          case pc.promotion_tier when 'auto' then 1 when 'review' then 2 else 3 end,
          pc.family_promotion_rank asc,
          pc.suggested_stop_sequence asc,
          pc.variant_code asc
      ) as same_stop_rank
    from preview_map pm
    join public.staging_ctp_runtime_promotion_candidates pc
      on pc.route_code_normalized = public.normalize_route_code(pm.route_code)
     and pc.variant_family_code = pm.variant_family_code
     and (pm.variant_code is null or pc.variant_code = pm.variant_code)
     and pc.preview_eligible
     and pc.family_promotion_rank = 1
    join public.staging_ctp_official_stops s
      on s.source_id = pc.stop_source_id
    join public.staging_ctp_official_route_variants rv
      on rv.source_id = pc.variant_source_id
    left join public.rutas r
      on r.id = pm.ruta_id
    cross join origin o
    where st_dwithin(s.geo, o.geo, greatest(50, least(coalesce(p_radius_m, 400), 1200)))
  )
  select
    format('ctp:%s:%s', n.ruta_id, n.stop_source_id) as id,
    n.stop_name,
    n.ruta_id as route_id,
    n.route_name_base || ' · preview CTP' as route_name,
    n.route_code,
    n.distance_m
  from nearby n
  where n.same_stop_rank = 1
  order by n.distance_m asc, n.preview_priority asc, n.suggested_stop_sequence asc, n.variant_code asc
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;

comment on function public.ctp_preview_nearby_stops(double precision, double precision, integer, integer) is
  'Devuelve paradas oficiales del CTP cercanas usando promotion candidates limpios en lugar del staging crudo.';

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
      pc.suggested_stop_sequence,
      row_number() over (
        partition by s.source_id
        order by
          pm.preview_priority asc,
          case pc.promotion_tier when 'auto' then 1 when 'review' then 2 else 3 end,
          pc.family_promotion_rank asc,
          pc.suggested_stop_sequence asc,
          pc.variant_code asc
      ) as same_stop_rank
    from preview_map pm
    join public.staging_ctp_runtime_promotion_candidates pc
      on pc.route_code_normalized = public.normalize_route_code(pm.route_code)
     and pc.variant_family_code = pm.variant_family_code
     and (pm.variant_code is null or pc.variant_code = pm.variant_code)
     and pc.preview_eligible
     and pc.family_promotion_rank = 1
    join public.staging_ctp_official_stops s
      on s.source_id = pc.stop_source_id
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
  'Devuelve secuencias de paradas oficiales CTP usando solo promotion candidates elegibles para preview.';

grant execute on function public.ctp_preview_route_variant_map() to anon, authenticated;
grant execute on function public.ctp_preview_nearby_stops(double precision, double precision, integer, integer) to anon, authenticated;
grant execute on function public.ctp_preview_route_stops(integer) to anon, authenticated;
