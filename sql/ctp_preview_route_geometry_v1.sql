set search_path = public, extensions;

create or replace function public.ctp_preview_route_geometry(
  p_ruta_id integer
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with preview_map as (
    select *
    from public.ctp_preview_route_variant_map()
    where ruta_id = p_ruta_id
    order by
      case preview_scope
        when 'route_stops' then 1
        when 'nearby_stops' then 2
        else 3
      end,
      preview_priority asc
    limit 1
  )
  select st_asgeojson(st_transform(rv.geom, 4326))::jsonb
  from preview_map pm
  join public.staging_ctp_official_route_variants rv
    on rv.route_code_normalized = public.normalize_route_code(pm.route_code)
   and rv.variant_family_code = pm.variant_family_code
   and (pm.variant_code is null or rv.variant_code = pm.variant_code)
  limit 1;
$$;

comment on function public.ctp_preview_route_geometry(integer) is
  'Devuelve la geometria oficial CTP de la mejor variante preview disponible para una ruta productiva.';

grant execute on function public.ctp_preview_route_geometry(integer) to anon, authenticated;
