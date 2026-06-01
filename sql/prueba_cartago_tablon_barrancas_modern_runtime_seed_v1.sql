set search_path = public, extensions;

-- 0331-B branch: Cartago <-> Tablon por Barrancas.
-- The inferred official sequence for 1-2 starts in Tablon, so the
-- Cartago->Tablon runtime route is reversed.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4312,
  p_route_code := '331',
  p_variant_family_code := '0331-B',
  p_variant_code := '0331-B-1',
  p_nombre_ruta := 'CARTAGO - TABLON POR BARRANCAS',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'TABLON',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - TABLON POR BARRANCAS / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.850,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := true,
  p_seed_source := 'preview_cartago_tablon_barrancas_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4313,
  p_route_code := '331',
  p_variant_family_code := '0331-B',
  p_variant_code := '0331-B-2',
  p_nombre_ruta := 'TABLON POR BARRANCAS - CARTAGO',
  p_canton_inicio := 'TABLON',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'TABLON POR BARRANCAS - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.850,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_tablon_barrancas_modern_v1'
);
