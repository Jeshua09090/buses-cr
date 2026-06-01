set search_path = public, extensions;

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
  order by r.suggested_stop_sequence asc;
$$;

comment on function public.ctp_preview_route_stops(integer) is
  'Secuencias preview CTP con paradas ajustadas visualmente al trazo oficial para mapas de pasajero.';

grant execute on function public.ctp_preview_route_stops(integer) to anon, authenticated;
