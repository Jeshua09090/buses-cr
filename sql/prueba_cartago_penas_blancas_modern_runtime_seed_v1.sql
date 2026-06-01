set search_path = public, extensions;

-- 0336-L branch: Cartago <-> Penas Blancas.
-- The inferred official sequences already follow each runtime direction.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4366,
  p_route_code := '336',
  p_variant_family_code := '0336-L',
  p_variant_code := '0336-L-1',
  p_nombre_ruta := 'CARTAGO - PENAS BLANCAS',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'PENAS BLANCAS',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - PENAS BLANCAS / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_penas_blancas_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4367,
  p_route_code := '336',
  p_variant_family_code := '0336-L',
  p_variant_code := '0336-L-2',
  p_nombre_ruta := 'PENAS BLANCAS - CARTAGO',
  p_canton_inicio := 'PENAS BLANCAS',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'PENAS BLANCAS - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_penas_blancas_modern_v1'
);
