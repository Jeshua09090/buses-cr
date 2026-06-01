set search_path = public, extensions;

create or replace function public.ctp_preview_route_variant_map()
returns table (
  ruta_id integer,
  route_code text,
  variant_family_code text,
  variant_code text,
  preview_scope text,
  preview_priority integer,
  reverse_stop_order boolean
)
language sql
stable
as $$
  select 4190, '328', '0328-D', '0328-D-1', 'route_stops', 10, true
  union all
  select 4190, '328', '0328-D', null, 'nearby_stops', 10, false
  union all
  select 4191, '328', '0328-E', '0328-E-1', 'route_stops', 10, true
  union all
  select 4191, '328', '0328-E', null, 'nearby_stops', 10, false
  union all
  select 4191, '328', '0328-F', null, 'nearby_stops', 20, false
  union all
  select 4226, '328', '0328-G', '0328-G-1', 'route_stops', 10, false
  union all
  select 4226, '328', '0328-G', null, 'nearby_stops', 10, false
  union all
  select 4689, '300', '0300-Q', '0300-Q-1', 'route_stops', 10, true
  union all
  select 4689, '300', '0300-Q', null, 'nearby_stops', 10, false
  union all
  select 4719, '323', '0323-B', '0323-B-1', 'route_stops', 10, false
  union all
  select 4719, '323', '0323-B', null, 'nearby_stops', 10, false
  union all
  select 4692, '300', '0300-L', null, 'nearby_stops', 10, false
  union all
  select 4692, '300', '0300-J', null, 'nearby_stops', 20, false
  union all
  select 4692, '300', '0300-O', null, 'nearby_stops', 30, false
  union all
  select 4693, '300', '0300-F', null, 'nearby_stops', 10, false
  union all
  select 4695, '300', '0300-C', null, 'nearby_stops', 10, false
  union all
  select 4695, '300', '0300-Y', null, 'nearby_stops', 20, false;
$$;

comment on function public.ctp_preview_route_variant_map() is
  'Mapeo manual entre rutas productivas de Prueba y familias oficiales CTP para preview, con soporte para invertir secuencias.';

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
  matched as (
    select
      pm.preview_priority,
      pm.reverse_stop_order,
      i.stop_source_id,
      i.variant_source_id,
      i.variant_family_code,
      i.variant_code,
      i.confidence_score,
      i.confidence_label,
      i.suggested_stop_sequence,
      st_setsrid(st_makepoint(s.lng, s.lat), 4326) as stop_point,
      st_transform(rv.geom, 4326) as route_geom,
      (-1 * s.source_id)::integer as parada_id,
      coalesce(s.description_raw, 'Parada oficial CTP') as nombre,
      null::boolean as tiene_techo,
      null::boolean as accesible
    from preview_map pm
    join public.staging_ctp_route_stops_inferred i
      on i.route_code_normalized = public.normalize_route_code(pm.route_code)
     and i.variant_family_code = pm.variant_family_code
     and (pm.variant_code is null or i.variant_code = pm.variant_code)
     and not i.manual_review_required
     and i.confidence_label in ('alta', 'media')
    join public.staging_ctp_official_stops s
      on s.source_id = i.stop_source_id
    left join public.staging_ctp_official_route_variants rv
      on rv.source_id = i.variant_source_id
  ),
  ranked as (
    select
      m.*,
      row_number() over (
        partition by m.stop_source_id
        order by
          m.preview_priority asc,
          case m.confidence_label
            when 'alta' then 1
            when 'media' then 2
            else 3
          end,
          m.confidence_score desc,
          m.suggested_stop_sequence asc,
          m.variant_code asc
      ) as same_stop_rank
    from matched m
  )
  select
    r.parada_id,
    r.nombre,
    st_y(coalesce(st_closestpoint(r.route_geom, r.stop_point), r.stop_point)) as lat,
    st_x(coalesce(st_closestpoint(r.route_geom, r.stop_point), r.stop_point)) as lng,
    r.tiene_techo,
    r.accesible
  from ranked r
  where r.same_stop_rank = 1
  order by
    case
      when r.reverse_stop_order then -1 * r.suggested_stop_sequence
      else r.suggested_stop_sequence
    end asc;
$$;

comment on function public.ctp_preview_route_stops(integer) is
  'Secuencias preview CTP con paradas ajustadas al trazo oficial y soporte para invertir el orden cuando la ruta productiva lo necesite.';

grant execute on function public.ctp_preview_route_variant_map() to anon, authenticated;
grant execute on function public.ctp_preview_route_stops(integer) to anon, authenticated;
