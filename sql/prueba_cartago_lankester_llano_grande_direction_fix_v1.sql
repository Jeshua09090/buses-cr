set search_path = public, extensions;

-- The inferred CTP stop order for these outbound variants is destination -> Cartago.
-- Re-promote the outbound runtime patterns reversed so planner boarding/alighting
-- follows the rider direction from Terminal Cartago.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4440,
  p_route_code := '336',
  p_variant_family_code := '0336-B',
  p_variant_code := '0336-B-1',
  p_nombre_ruta := 'CARTAGO - LAGUNA DE DONA ANA - OBREROS Y CAMPESINOS - LOS HELECHOS',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'PARAISO',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - LA LAGUNA - LOS HELECHOS / IDA',
  p_categoria_operativa := 'local',
  p_clasificacion_confianza := 0.880,
  p_frecuencia_base_min := 24,
  p_reverse_stop_order := true,
  p_seed_source := 'preview_cartago_laguna_helechos_lankester_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4442,
  p_route_code := '366',
  p_variant_family_code := '0366-A',
  p_variant_code := '0366-A-1',
  p_nombre_ruta := 'CARTAGO - LLANO GRANDE',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'CARTAGO',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - LLANO GRANDE / IDA',
  p_categoria_operativa := 'local',
  p_clasificacion_confianza := 0.900,
  p_frecuencia_base_min := 30,
  p_reverse_stop_order := true,
  p_seed_source := 'preview_cartago_llano_grande_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4444,
  p_route_code := '366',
  p_variant_family_code := '0366-B',
  p_variant_code := '0366-B-1',
  p_nombre_ruta := 'CARTAGO - LLANO GRANDE CON ENTRADA A LAS PAVAS',
  p_canton_inicio := 'CARTAGO',
  p_canton_final := 'CARTAGO',
  p_sentido := 'ida',
  p_pattern_name := 'CARTAGO - LLANO GRANDE - LAS PAVAS / IDA',
  p_categoria_operativa := 'local',
  p_clasificacion_confianza := 0.890,
  p_frecuencia_base_min := 36,
  p_reverse_stop_order := true,
  p_seed_source := 'preview_cartago_llano_grande_v1'
);
