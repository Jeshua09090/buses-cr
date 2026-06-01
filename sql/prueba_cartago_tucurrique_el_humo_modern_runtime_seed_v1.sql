set search_path = public, extensions;

-- 0336-M branch: Cartago <-> Tucurrique <-> El Humo.
-- The inferred official sequences already follow each runtime direction.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4362,
  p_route_code := '336',
  p_variant_family_code := '0336-M',
  p_variant_code := '0336-M-1',
  p_nombre_ruta := 'CARTAGO - TUCURRIQUE - EL HUMO',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'EL HUMO',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - TUCURRIQUE - EL HUMO / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_tucurrique_el_humo_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4363,
  p_route_code := '336',
  p_variant_family_code := '0336-M',
  p_variant_code := '0336-M-2',
  p_nombre_ruta := 'EL HUMO - TUCURRIQUE - CARTAGO',
  p_canton_inicio := 'EL HUMO',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'EL HUMO - TUCURRIQUE - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_tucurrique_el_humo_modern_v1'
);
