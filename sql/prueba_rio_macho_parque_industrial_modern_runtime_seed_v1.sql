set search_path = public, extensions;

-- 0339-D branch: Rio Macho <-> Orosi <-> Cartago <-> Parque Industrial.
-- The inferred official sequences already follow each runtime direction.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4396,
  p_route_code := '339',
  p_variant_family_code := '0339-D',
  p_variant_code := '0339-D-1',
  p_nombre_ruta := 'RIO MACHO - OROSI - CARTAGO - PARQUE INDUSTRIAL',
  p_canton_inicio := 'RIO MACHO',
  p_canton_final := 'CARTAGO',
  p_sentido := 'ida',
  p_pattern_name := 'RIO MACHO - OROSI - CARTAGO - PARQUE INDUSTRIAL / IDA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_rio_macho_parque_industrial_modern_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4397,
  p_route_code := '339',
  p_variant_family_code := '0339-D',
  p_variant_code := '0339-D-2',
  p_nombre_ruta := 'PARQUE INDUSTRIAL - CARTAGO - OROSI - RIO MACHO',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'RIO MACHO',
  p_sentido := 'vuelta',
  p_pattern_name := 'PARQUE INDUSTRIAL - CARTAGO - OROSI - RIO MACHO / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_rio_macho_parque_industrial_modern_v1'
);
