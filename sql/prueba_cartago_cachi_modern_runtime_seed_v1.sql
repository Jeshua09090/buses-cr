set search_path = public, extensions;

-- 0336-J branch: Cartago <-> Cachi.
-- The inferred official sequences already follow each runtime direction.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4364,
  p_route_code := '336',
  p_variant_family_code := '0336-J',
  p_variant_code := '0336-J-1',
  p_nombre_ruta := 'CARTAGO - CACHI',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'CACHI',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - CACHI / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 35,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_cachi_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4365,
  p_route_code := '336',
  p_variant_family_code := '0336-J',
  p_variant_code := '0336-J-2',
  p_nombre_ruta := 'CACHI - CARTAGO',
  p_canton_inicio := 'CACHI',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'CACHI - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 35,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_cachi_modern_v1'
);
