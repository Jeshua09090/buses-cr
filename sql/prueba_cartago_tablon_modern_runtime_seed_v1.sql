set search_path = public, extensions;

-- 0331-A branch: Cartago <-> Tablon.
-- The inferred official sequence for 1-2 starts in Tablon, so the
-- Cartago->Tablon runtime route is reversed.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4310,
  p_route_code := '331',
  p_variant_family_code := '0331-A',
  p_variant_code := '0331-A-1',
  p_nombre_ruta := 'CARTAGO - TABLON',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'TABLON',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - TABLON / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 35,
  p_reverse_stop_order := true,
  p_seed_source := 'preview_cartago_tablon_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4311,
  p_route_code := '331',
  p_variant_family_code := '0331-A',
  p_variant_code := '0331-A-2',
  p_nombre_ruta := 'TABLON - CARTAGO',
  p_canton_inicio := 'TABLON',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'TABLON - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 35,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_tablon_modern_v1'
);
