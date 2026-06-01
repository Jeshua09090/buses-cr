set search_path = public, extensions;

-- 0331-E branch: Cartago <-> Tobosi <-> Quebradillas.
-- The inferred official sequence for 1-2 starts in the Tobosi/Quebradillas
-- side, so the Cartago->Tobosi runtime route is reversed.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4314,
  p_route_code := '331',
  p_variant_family_code := '0331-E',
  p_variant_code := '0331-E-1',
  p_nombre_ruta := 'CARTAGO - TOBOSI - QUEBRADILLAS',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'QUEBRADILLAS',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - TOBOSI - QUEBRADILLAS / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 35,
  p_reverse_stop_order := true,
  p_seed_source := 'preview_cartago_tobosi_quebradillas_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4315,
  p_route_code := '331',
  p_variant_family_code := '0331-E',
  p_variant_code := '0331-E-2',
  p_nombre_ruta := 'QUEBRADILLAS - TOBOSI - CARTAGO',
  p_canton_inicio := 'QUEBRADILLAS',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'QUEBRADILLAS - TOBOSI - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 35,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_tobosi_quebradillas_modern_v1'
);
