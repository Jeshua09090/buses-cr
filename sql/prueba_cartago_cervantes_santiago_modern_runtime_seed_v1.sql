set search_path = public, extensions;

-- 0338-A trunk: Cartago <-> Paraiso <-> Birrisito <-> Cervantes <-> Santiago.
-- The inferred official sequence starts in Santiago and ends in Cartago, so
-- the Cartago->Santiago runtime route is reversed.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4380,
  p_route_code := '338',
  p_variant_family_code := '0338-A',
  p_variant_code := '0338-A-1',
  p_nombre_ruta := 'CARTAGO - PARAISO - BIRRISITO - CERVANTES - SANTIAGO',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'SANTIAGO',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - PARAISO - BIRRISITO - CERVANTES - SANTIAGO / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 35,
  p_reverse_stop_order := true,
  p_seed_source := 'preview_cartago_cervantes_santiago_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4381,
  p_route_code := '338',
  p_variant_family_code := '0338-A',
  p_variant_code := '0338-A-2',
  p_nombre_ruta := 'SANTIAGO - CERVANTES - BIRRISITO - PARAISO - CARTAGO',
  p_canton_inicio := 'SANTIAGO',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'SANTIAGO - CERVANTES - BIRRISITO - PARAISO - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 35,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_cervantes_santiago_modern_v1'
);
