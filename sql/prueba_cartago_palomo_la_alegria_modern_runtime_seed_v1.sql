set search_path = public, extensions;

-- 0339-A branch: Cartago <-> Orosi <-> Palomo <-> La Alegria.
-- The inferred official sequences already follow each runtime direction.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4392,
  p_route_code := '339',
  p_variant_family_code := '0339-A',
  p_variant_code := '0339-A-1',
  p_nombre_ruta := 'CARTAGO - OROSI - PALOMO - LA ALEGRIA',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'LA ALEGRIA',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - OROSI - PALOMO - LA ALEGRIA / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_palomo_la_alegria_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4393,
  p_route_code := '339',
  p_variant_family_code := '0339-A',
  p_variant_code := '0339-A-2',
  p_nombre_ruta := 'LA ALEGRIA - PALOMO - OROSI - CARTAGO',
  p_canton_inicio := 'LA ALEGRIA',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'LA ALEGRIA - PALOMO - OROSI - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_palomo_la_alegria_modern_v1'
);
