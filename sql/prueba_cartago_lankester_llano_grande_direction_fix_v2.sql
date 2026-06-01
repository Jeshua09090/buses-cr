set search_path = public, extensions;

-- 0366-B-1 already comes Cartago -> Las Pavas in inferred stop order.
-- The v1 direction fix intentionally reversed 0366-A-1, but 0366-B-1 must stay natural.

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
  p_seed_source := 'preview_cartago_llano_grande_v1'
);
