set search_path = public, extensions;

with route_variants as (
  select *
  from (
    values
      (93001::integer, '0300-J-1'::text, 18::integer),
      (93002::integer, '0300-L-2'::text, 18::integer),
      (93003::integer, '0300-K-2'::text, 20::integer),
      (93004::integer, '0300-M-2'::text, 20::integer),
      (93005::integer, '0300-R-2'::text, 20::integer),
      (93006::integer, '0300-U-2'::text, 22::integer)
  ) as variants(ruta_id, variant_code, frecuencia_base_min)
)
update public.rutas r
set geometry = st_asgeojson(st_transform(rv.geom, 4326))::jsonb
from route_variants v
join public.staging_ctp_official_route_variants rv
  on rv.variant_code = v.variant_code
where r.id = v.ruta_id;

with route_variants as (
  select *
  from (
    values
      (93001::integer, '0300-J-1'::text, 18::integer),
      (93002::integer, '0300-L-2'::text, 18::integer),
      (93003::integer, '0300-K-2'::text, 20::integer),
      (93004::integer, '0300-M-2'::text, 20::integer),
      (93005::integer, '0300-R-2'::text, 20::integer),
      (93006::integer, '0300-U-2'::text, 22::integer)
  ) as variants(ruta_id, variant_code, frecuencia_base_min)
),
target_patterns as (
  select
    rp.id as pattern_id,
    v.ruta_id,
    v.variant_code,
    v.frecuencia_base_min
  from route_variants v
  join public.route_patterns rp
    on rp.ruta_id = v.ruta_id
   and rp.fuente = 'importacion'
   and coalesce(rp.metadata ->> 'seed_source', '') = 'preview_route300_rio_loro_moovit_variants_v1'
)
update public.service_windows sw
set frecuencia_promedio_min = tp.frecuencia_base_min,
    updated_at = timezone('utc', now()),
    metadata = coalesce(sw.metadata, '{}'::jsonb) || jsonb_build_object(
      'wait_fix_source', 'preview_route300_rio_loro_moovit_variants_fix_v1'
    )
from target_patterns tp
where sw.pattern_id = tp.pattern_id
  and sw.activo = true;
