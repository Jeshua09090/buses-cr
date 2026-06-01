set search_path = public, extensions;

-- 0339-B trunk: Cartago <-> Orosi <-> Rio Macho.
-- The inferred official sequence starts in Rio Macho and ends in Cartago, so
-- the Cartago->Rio Macho runtime route is reversed.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4390,
  p_route_code := '339',
  p_variant_family_code := '0339-B',
  p_variant_code := '0339-B-1',
  p_nombre_ruta := 'CARTAGO - OROSI - RIO MACHO',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'RIO MACHO',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - OROSI - RIO MACHO / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 35,
  p_reverse_stop_order := true,
  p_seed_source := 'preview_cartago_orosi_rio_macho_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4391,
  p_route_code := '339',
  p_variant_family_code := '0339-B',
  p_variant_code := '0339-B-2',
  p_nombre_ruta := 'RIO MACHO - OROSI - CARTAGO',
  p_canton_inicio := 'RIO MACHO',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'RIO MACHO - OROSI - CARTAGO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 35,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_cartago_orosi_rio_macho_modern_v1'
);
