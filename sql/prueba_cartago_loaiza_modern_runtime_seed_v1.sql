set search_path = public, extensions;

-- 0336-K branch: Cartago <-> Loaiza.
-- The inferred official sequences already follow each runtime direction.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4368,
  p_route_code := '336',
  p_variant_family_code := '0336-K',
  p_variant_code := '0336-K-1',
  p_nombre_ruta := 'CARTAGO - LOAIZA',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'LOAIZA',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - LOAIZA / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_loaiza_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4369,
  p_route_code := '336',
  p_variant_family_code := '0336-K',
  p_variant_code := '0336-K-2',
  p_nombre_ruta := 'LOAIZA - CARTAGO',
  p_canton_inicio := 'LOAIZA',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'LOAIZA - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_loaiza_modern_v1'
);
