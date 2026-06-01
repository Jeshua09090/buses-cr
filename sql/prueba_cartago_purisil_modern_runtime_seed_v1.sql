set search_path = public, extensions;

-- 0339-C branch: Cartago <-> Orosi <-> Rio Macho <-> Purisil.
-- The inferred official sequence for 1-2 starts in Purisil, so the
-- Cartago->Purisil runtime route is reversed.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4394,
  p_route_code := '339',
  p_variant_family_code := '0339-C',
  p_variant_code := '0339-C-1',
  p_nombre_ruta := 'CARTAGO - OROSI - RIO MACHO - PURISIL',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'PURISIL',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - OROSI - RIO MACHO - PURISIL / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := true,
  p_seed_source := 'preview_cartago_purisil_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4395,
  p_route_code := '339',
  p_variant_family_code := '0339-C',
  p_variant_code := '0339-C-2',
  p_nombre_ruta := 'PURISIL - RIO MACHO - OROSI - CARTAGO',
  p_canton_inicio := 'PURISIL',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'PURISIL - RIO MACHO - OROSI - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_purisil_modern_v1'
);
