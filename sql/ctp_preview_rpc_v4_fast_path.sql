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
  select 5332, '332', '0332-A', '0332-A-1', 'route_stops', 10, false
  union all
  select 5332, '332', '0332-A', null, 'nearby_stops', 10, false
  union all
  select 5333, '332', '0332-B', '0332-B-1', 'route_stops', 10, false
  union all
  select 5333, '332', '0332-B', null, 'nearby_stops', 10, false
  union all
  select 4190, '328', '0328-D', '0328-D-1', 'route_stops', 10, true
  union all
  select 4290, '328', '0328-D', '0328-D-2', 'route_stops', 10, false
  union all
  select 4190, '328', '0328-D', null, 'nearby_stops', 10, false
  union all
  select 4191, '328', '0328-E', '0328-E-1', 'route_stops', 10, true
  union all
  select 4291, '328', '0328-E', '0328-E-2', 'route_stops', 10, false
  union all
  select 4191, '328', '0328-E', null, 'nearby_stops', 10, false
  union all
  select 4191, '328', '0328-F', null, 'nearby_stops', 20, false
  union all
  select 4226, '328', '0328-G', '0328-G-1', 'route_stops', 10, false
  union all
  select 4226, '328', '0328-G', null, 'nearby_stops', 10, false
  union all
  select 4227, '328', '0328-G', '0328-G-2', 'route_stops', 10, false
  union all
  select 4227, '328', '0328-G', null, 'nearby_stops', 10, false
  union all
  select 4689, '300', '0300-Q', '0300-Q-1', 'route_stops', 10, true
  union all
  select 4689, '300', '0300-Q', null, 'nearby_stops', 10, false
  union all
  select 93001, '300', '0300-J', '0300-J-1', 'route_stops', 10, false
  union all
  select 93002, '300', '0300-L', '0300-L-2', 'route_stops', 10, false
  union all
  select 93003, '300', '0300-K', '0300-K-2', 'route_stops', 10, false
  union all
  select 93004, '300', '0300-M', '0300-M-2', 'route_stops', 10, false
  union all
  select 93005, '300', '0300-R', '0300-R-2', 'route_stops', 10, false
  union all
  select 93006, '300', '0300-U', '0300-U-2', 'route_stops', 10, false
  union all
  select 4719, '323', '0323-B', '0323-B-1', 'route_stops', 10, false
  union all
  select 4719, '323', '0323-B', null, 'nearby_stops', 10, false
  union all
  select 4330, '330', '0330-A', '0330-A-1', 'route_stops', 10, false
  union all
  select 4330, '330', '0330-A', null, 'nearby_stops', 10, false
  union all
  select 4331, '330', '0330-A', '0330-A-2', 'route_stops', 10, false
  union all
  select 4332, '330', '0330-A', '0330-A-3', 'route_stops', 20, false
  union all
  select 4333, '330', '0330-A', '0330-A-4', 'route_stops', 20, false
  union all
  select 4336, '330', '0330-A', '0330-A-5', 'route_stops', 30, false
  union all
  select 4337, '330', '0330-A', '0330-A-6', 'route_stops', 30, false
  union all
  select 4334, '331', '0331-H', '0331-H-1', 'route_stops', 10, false
  union all
  select 4334, '331', '0331-H', null, 'nearby_stops', 10, false
  union all
  select 4335, '331', '0331-H', '0331-H-2', 'route_stops', 10, false
  union all
  select 4400, '321', '0321-A', '0321-A-1', 'route_stops', 10, false
  union all
  select 4401, '321', '0321-A', '0321-A-2', 'route_stops', 10, false
  union all
  select 4402, '322', '0322-A', '0322-A-1', 'route_stops', 10, false
  union all
  select 4403, '322', '0322-A', '0322-A-2', 'route_stops', 20, false
  union all
  select 4404, '322', '0322-B', '0322-B-1', 'route_stops', 10, false
  union all
  select 4405, '322', '0322-B', '0322-B-2', 'route_stops', 20, false
  union all
  select 4406, '322', '0322-C', '0322-C-1', 'route_stops', 10, false
  union all
  select 4407, '322', '0322-C', '0322-C-2', 'route_stops', 20, false
  union all
  select 4408, '322', '0322-D', '0322-D-1', 'route_stops', 10, false
  union all
  select 4409, '322', '0322-E', '0322-E-1', 'route_stops', 10, false
  union all
  select 4410, '324', '0324-A', '0324-A-1', 'route_stops', 10, false
  union all
  select 4411, '324', '0324-A', '0324-A-2', 'route_stops', 10, false
  union all
  select 4412, '325', '0325-A', '0325-A-1', 'route_stops', 10, false
  union all
  select 4413, '325', '0325-B', '0325-B-1', 'route_stops', 10, false
  union all
  select 4414, '325', '0325-C', '0325-C-1', 'route_stops', 10, false
  union all
  select 4415, '325', '0325-C', '0325-C-2', 'route_stops', 10, false
  union all
  select 4416, '329', '0329-A', '0329-A-1', 'route_stops', 10, false
  union all
  select 4417, '329', '0329-A', '0329-A-2', 'route_stops', 10, false
  union all
  select 4418, '329', '0329-B', '0329-B-1', 'route_stops', 10, false
  union all
  select 4419, '329', '0329-B', '0329-B-2', 'route_stops', 10, false
  union all
  select 4420, '329', '0329-C', '0329-C-1', 'route_stops', 10, false
  union all
  select 4421, '334', '0334-A', '0334-A-1', 'route_stops', 10, false
  union all
  select 4422, '334', '0334-A', '0334-A-2', 'route_stops', 10, false
  union all
  select 4423, '334', '0334-B', '0334-B-1', 'route_stops', 10, false
  union all
  select 4424, '334', '0334-B', '0334-B-2', 'route_stops', 10, false
  union all
  select 4425, '335', '0335-A', '0335-A-1', 'route_stops', 10, false
  union all
  select 4426, '335', '0335-A', '0335-A-2', 'route_stops', 10, false
  union all
  select 4430, '307', '0307-A', '0307-A-1', 'route_stops', 10, false
  union all
  select 4431, '307', '0307-A', '0307-A-2', 'route_stops', 10, true
  union all
  select 4432, '307', '0307-B', '0307-B-1', 'route_stops', 10, false
  union all
  select 4433, '307', '0307-B', '0307-B-2', 'route_stops', 10, true
  union all
  select 4434, '307', '0307-C', '0307-C-1', 'route_stops', 10, false
  union all
  select 4435, '307', '0307-C', '0307-C-2', 'route_stops', 10, true
  union all
  select 4436, '307', '0307-E', '0307-E-1', 'route_stops', 10, false
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
  'Mapeo manual entre rutas productivas de Prueba y familias oficiales CTP para preview.';

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
  matched as (
    select
      pm.ruta_id,
      pm.route_code,
      pm.preview_priority,
      i.variant_source_id,
      i.stop_source_id,
      i.variant_family_code,
      i.variant_code,
      i.confidence_score,
      i.confidence_label,
      i.suggested_stop_sequence,
      c.nearby_variant_count,
      c.same_family_variant_count,
      c.family_direction_variant_count,
      c.is_terminal_hint,
      c.is_hub_stop,
      coalesce(s.description_raw, 'Parada oficial CTP') as stop_name,
      s.geo as stop_geo,
      coalesce(nullif(r.nombre_ruta, ''), rv.description_raw, 'Ruta oficial CTP') as route_name_base
    from preview_map pm
    join public.staging_ctp_route_stops_inferred i
      on i.route_code_normalized = public.normalize_route_code(pm.route_code)
     and i.variant_family_code = pm.variant_family_code
     and (pm.variant_code is null or i.variant_code = pm.variant_code)
     and not i.manual_review_required
     and i.confidence_label in ('alta', 'media')
    join public.staging_ctp_route_stop_candidates c
      on c.variant_source_id = i.variant_source_id
     and c.stop_source_id = i.stop_source_id
    join public.staging_ctp_official_stops s
      on s.source_id = i.stop_source_id
    join public.staging_ctp_official_route_variants rv
      on rv.source_id = i.variant_source_id
    left join public.rutas r
      on r.id = pm.ruta_id
    cross join origin o
    where st_dwithin(s.geo, o.geo, greatest(50, least(coalesce(p_radius_m, 400), 1200)))
  ),
  classified as (
    select
      m.*,
      case
        when m.confidence_label = 'alta' then 'auto'
        when m.confidence_label = 'media'
          and coalesce(m.same_family_variant_count, 0) = 1
          and coalesce(m.family_direction_variant_count, 0) = 1
          and m.confidence_score >= 0.8500
          and not m.is_terminal_hint
          and not m.is_hub_stop
          then 'review'
        when m.confidence_label = 'media'
          and coalesce(m.nearby_variant_count, 0) <= 6
          and coalesce(m.same_family_variant_count, 0) <= 3
          and not m.is_terminal_hint
          and not m.is_hub_stop
          then 'review'
        else 'hold'
      end as promotion_tier
    from matched m
  ),
  ranked as (
    select
      cl.*,
      row_number() over (
        partition by cl.stop_source_id, cl.variant_family_code
        order by
          case cl.promotion_tier
            when 'auto' then 1
            when 'review' then 2
            else 3
          end,
          case cl.confidence_label
            when 'alta' then 1
            when 'media' then 2
            else 3
          end,
          cl.confidence_score desc,
          cl.suggested_stop_sequence asc,
          cl.variant_code asc
      ) as family_promotion_rank
    from classified cl
  ),
  nearby as (
    select
      rnk.ruta_id,
      rnk.route_code,
      rnk.preview_priority,
      rnk.stop_source_id,
      rnk.stop_name,
      rnk.route_name_base,
      round(st_distance(rnk.stop_geo, o.geo)::numeric)::integer as distance_m,
      rnk.suggested_stop_sequence,
      rnk.variant_code,
      row_number() over (
        partition by rnk.ruta_id, rnk.stop_source_id
        order by
          rnk.preview_priority asc,
          case rnk.promotion_tier
            when 'auto' then 1
            when 'review' then 2
            else 3
          end,
          rnk.family_promotion_rank asc,
          rnk.suggested_stop_sequence asc,
          rnk.variant_code asc
      ) as same_stop_rank
    from ranked rnk
    cross join origin o
    where rnk.family_promotion_rank = 1
      and rnk.promotion_tier in ('auto', 'review')
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
  order by n.distance_m asc, n.preview_priority asc, n.suggested_stop_sequence asc, n.variant_code asc
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;

comment on function public.ctp_preview_nearby_stops(double precision, double precision, integer, integer) is
  'Fast path para preview CTP: evita la vista runtime completa y consulta solo familias habilitadas para preview.';

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
  candidate_source as (
    select
      pm.preview_priority,
      pm.reverse_stop_order,
      i.stop_source_id,
      i.variant_source_id,
      i.variant_family_code,
      i.variant_code,
      i.confidence_score,
      i.confidence_label,
      i.manual_review_required,
      i.suggested_stop_sequence,
      st_setsrid(st_makepoint(s.lng, s.lat), 4326) as stop_point,
      st_transform(rv.geom, 4326) as route_geom,
      (-1 * s.source_id)::integer as parada_id,
      coalesce(s.description_raw, 'Parada oficial CTP') as nombre,
      coalesce(s.description_normalized, s.description_raw, '') as nombre_normalizado,
      null::boolean as tiene_techo,
      null::boolean as accesible
    from preview_map pm
    join public.staging_ctp_route_stops_inferred i
      on i.route_code_normalized = public.normalize_route_code(pm.route_code)
     and i.variant_family_code = pm.variant_family_code
     and (pm.variant_code is null or i.variant_code = pm.variant_code)
    join public.staging_ctp_official_stops s
      on s.source_id = i.stop_source_id
    left join public.staging_ctp_official_route_variants rv
      on rv.source_id = i.variant_source_id
  ),
  candidate_matches as (
    select
      cs.*,
      least(
        st_distance(
          cs.stop_point::geography,
          st_startpoint(st_geometryn(cs.route_geom, 1))::geography
        ),
        st_distance(
          cs.stop_point::geography,
          st_endpoint(
            st_geometryn(
              cs.route_geom,
              greatest(1, st_numgeometries(cs.route_geom))
            )
          )::geography
        )
      ) as endpoint_distance_m
    from candidate_source cs
  ),
  matched as (
    select *
    from candidate_matches cm
    where (
        not cm.manual_review_required
        and cm.confidence_label in ('alta', 'media')
      )
      or (
        cm.manual_review_required
        and cm.confidence_label = 'manual'
        and cm.confidence_score >= 0.65
        and upper(cm.nombre_normalizado) like 'TERMINAL %'
        and cm.endpoint_distance_m <= 60
      )
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
  'Fast path para secuencias preview CTP: usa candidatas elegibles y terminales manuales pegadas al endpoint del shape.';

grant execute on function public.ctp_preview_nearby_stops(double precision, double precision, integer, integer) to anon, authenticated;
grant execute on function public.ctp_preview_route_stops(integer) to anon, authenticated;
