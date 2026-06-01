set search_path = public, extensions;

-- 0336-O branch: Penas Blancas -> Parque Industrial.
-- CTP currently exposes only the 2-1 variant for this branch. The inferred
-- sequence starts at Penas Blancas and ends at Parque Industrial, so keep the
-- official stop order.

select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := 4372,
  p_route_code := '336',
  p_variant_family_code := '0336-O',
  p_variant_code := '0336-O-2',
  p_nombre_ruta := 'PENAS BLANCAS - PARQUE INDUSTRIAL',
  p_canton_inicio := 'PENAS BLANCAS',
  p_canton_final := 'CARTAGO',
  p_sentido := 'vuelta',
  p_pattern_name := 'PENAS BLANCAS - PARQUE INDUSTRIAL / VUELTA',
  p_categoria_operativa := 'interurbana',
  p_clasificacion_confianza := 0.860,
  p_frecuencia_base_min := 45,
  p_reverse_stop_order := false,
  p_seed_source := 'preview_penas_blancas_parque_industrial_modern_v1'
);
