set search_path = public, extensions;

-- 0331-F branch: Cartago <-> Tobosi <-> Quebradillas por Barrancas.
-- The inferred official sequence starts on the Barrancas/Quebradillas side
-- and ends in Cartago, so the Cartago-bound pair mirrors the 0331-E seed.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4316,
  p_route_code := '331',
  p_variant_family_code := '0331-F',
  p_variant_code := '0331-F-1',
  p_nombre_ruta := 'CARTAGO - TOBOSI - QUEBRADILLAS POR BARRANCAS',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'QUEBRADILLAS',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - TOBOSI - QUEBRADILLAS POR BARRANCAS / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 35,
  p_reverse_stop_order := true,
  p_seed_source := 'preview_cartago_tobosi_quebradillas_barrancas_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4317,
  p_route_code := '331',
  p_variant_family_code := '0331-F',
  p_variant_code := '0331-F-2',
  p_nombre_ruta := 'QUEBRADILLAS POR BARRANCAS - TOBOSI - CARTAGO',
  p_canton_inicio := 'QUEBRADILLAS',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'QUEBRADILLAS POR BARRANCAS - TOBOSI - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 35,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_tobosi_quebradillas_barrancas_modern_v1'
);
