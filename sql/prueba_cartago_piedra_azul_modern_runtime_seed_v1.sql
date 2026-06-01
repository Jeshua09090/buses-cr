set search_path = public, extensions;

-- 0336-N branch: Cartago <-> Piedra Azul.
-- The inferred official sequence for 1-2 starts in Piedra Azul, so the
-- Cartago->Piedra Azul runtime route is reversed.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4370,
  p_route_code := '336',
  p_variant_family_code := '0336-N',
  p_variant_code := '0336-N-1',
  p_nombre_ruta := 'CARTAGO - PIEDRA AZUL',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'PIEDRA AZUL',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - PIEDRA AZUL / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := true,
  p_seed_source := 'preview_cartago_piedra_azul_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4371,
  p_route_code := '336',
  p_variant_family_code := '0336-N',
  p_variant_code := '0336-N-2',
  p_nombre_ruta := 'PIEDRA AZUL - CARTAGO',
  p_canton_inicio := 'PIEDRA AZUL',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'PIEDRA AZUL - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_piedra_azul_modern_v1'
);
