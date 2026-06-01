set search_path = public, extensions;

-- Cartago core missing runtime batch.
-- Selected from planner_ctp_cartago_variant_runtime_scan because these are
-- Cartago-facing corridors with official inferred stops and practical rider
-- value while comparing planner-lab with Moovit.

with seeds as (
  select *
  from (
    values
      (4800, '310', '0310-A', '0310-A-1', 'CARTAGO - LA CRUZ DE CARAVACA - EL ALTO', 'CARTAGO', 'OREAMUNO', 'ida', 'CARTAGO - LA CRUZ DE CARAVACA - EL ALTO / IDA', 'local', 0.880, 32, false),
      (4801, '310', '0310-A', '0310-A-2', 'EL ALTO - LA CRUZ DE CARAVACA - CARTAGO', 'OREAMUNO', 'CARTAGO', 'vuelta', 'EL ALTO - LA CRUZ DE CARAVACA - CARTAGO / VUELTA', 'local', 0.870, 32, true),
      (4802, '310', '0310-B', '0310-B-1', 'CARTAGO - EL ALTO - MATA DE MORA', 'CARTAGO', 'OREAMUNO', 'ida', 'CARTAGO - EL ALTO - MATA DE MORA / IDA', 'local', 0.870, 36, false),
      (4803, '310', '0310-B', '0310-B-2', 'MATA DE MORA - EL ALTO - CARTAGO', 'OREAMUNO', 'CARTAGO', 'vuelta', 'MATA DE MORA - EL ALTO - CARTAGO / VUELTA', 'local', 0.860, 36, true),
      (4804, '310', '0310-C', '0310-C-1', 'CARTAGO - FINCA PAEZ', 'CARTAGO', 'OREAMUNO', 'ida', 'CARTAGO - FINCA PAEZ / IDA', 'local', 0.860, 38, false),
      (4805, '310', '0310-C', '0310-C-2', 'FINCA PAEZ - CARTAGO', 'OREAMUNO', 'CARTAGO', 'vuelta', 'FINCA PAEZ - CARTAGO / VUELTA', 'local', 0.850, 38, true),
      (4806, '318', '0318-A', '0318-A-1', 'CARTAGO - LA ESTRELLA DEL GUARCO', 'CARTAGO', 'EL GUARCO', 'ida', 'CARTAGO - LA ESTRELLA DEL GUARCO / IDA', 'interurbana', 0.900, 32, true),
      (4807, '318', '0318-A', '0318-A-2', 'LA ESTRELLA DEL GUARCO - CARTAGO', 'EL GUARCO', 'CARTAGO', 'vuelta', 'LA ESTRELLA DEL GUARCO - CARTAGO / VUELTA', 'interurbana', 0.890, 32, false),
      (4808, '320', '0320-A', '0320-A-1', 'CARTAGO - LA ANGELINA', 'CARTAGO', 'CARTAGO', 'ida', 'CARTAGO - LA ANGELINA / IDA', 'local', 0.890, 30, true),
      (4809, '320', '0320-A', '0320-A-2', 'LA ANGELINA - CARTAGO', 'CARTAGO', 'CARTAGO', 'vuelta', 'LA ANGELINA - CARTAGO / VUELTA', 'local', 0.880, 30, false),
      (4810, '323', '0323-A', '0323-A-1', 'CARTAGO - TARAS - OCHOMOGO', 'CARTAGO', 'CARTAGO', 'loop', 'CARTAGO - TARAS - OCHOMOGO / ANILLO', 'local', 0.860, 22, false),
      (4811, '323', '0323-C', '0323-C-1', 'CARTAGO - LA LIMA', 'CARTAGO', 'CARTAGO', 'ida', 'CARTAGO - LA LIMA / IDA', 'local', 0.850, 24, true),
      (4812, '325', '0325-D', '0325-D-1', 'SAN RAFAEL DE OREAMUNO - PARQUE INDUSTRIAL', 'OREAMUNO', 'CARTAGO', 'ida', 'SAN RAFAEL DE OREAMUNO - PARQUE INDUSTRIAL / IDA', 'local', 0.860, 32, false),
      (4813, '325', '0325-D', '0325-D-2', 'PARQUE INDUSTRIAL - SAN RAFAEL DE OREAMUNO', 'CARTAGO', 'OREAMUNO', 'vuelta', 'PARQUE INDUSTRIAL - SAN RAFAEL DE OREAMUNO / VUELTA', 'local', 0.860, 32, false),
      (4814, '325', '0325-E', '0325-E-1', 'SAN RAFAEL DE OREAMUNO - EL COVAO', 'OREAMUNO', 'CARTAGO', 'ida', 'SAN RAFAEL DE OREAMUNO - EL COVAO / IDA', 'local', 0.850, 32, false),
      (4815, '325', '0325-E', '0325-E-2', 'EL COVAO - SAN RAFAEL DE OREAMUNO', 'CARTAGO', 'OREAMUNO', 'vuelta', 'EL COVAO - SAN RAFAEL DE OREAMUNO / VUELTA', 'local', 0.850, 32, false),
      (4816, '326', '0326-A', '0326-A-1', 'CARTAGO - TRES RIOS POR TARAS', 'CARTAGO', 'LA UNION', 'ida', 'CARTAGO - TRES RIOS POR TARAS / IDA', 'interurbana', 0.880, 30, true),
      (4817, '326', '0326-A', '0326-A-2', 'TRES RIOS - CARTAGO POR TARAS', 'LA UNION', 'CARTAGO', 'vuelta', 'TRES RIOS - CARTAGO POR TARAS / VUELTA', 'interurbana', 0.870, 30, false),
      (4818, '326', '0326-B', '0326-B-1', 'CARTAGO - TRES RIOS POR LA LIMA', 'CARTAGO', 'LA UNION', 'ida', 'CARTAGO - TRES RIOS POR LA LIMA / IDA', 'interurbana', 0.860, 32, true),
      (4819, '326', '0326-B', '0326-B-2', 'TRES RIOS - CARTAGO POR LA LIMA', 'LA UNION', 'CARTAGO', 'vuelta', 'TRES RIOS - CARTAGO POR LA LIMA / VUELTA', 'interurbana', 0.860, 32, false),
      (4820, '327', '0327-A', '0327-A-1', 'CARTAGO - MADRE SELVA', 'CARTAGO', 'EL GUARCO', 'ida', 'CARTAGO - MADRE SELVA / IDA', 'interurbana', 0.880, 42, false),
      (4821, '327', '0327-A', '0327-A-2', 'MADRE SELVA - CARTAGO', 'EL GUARCO', 'CARTAGO', 'vuelta', 'MADRE SELVA - CARTAGO / VUELTA', 'interurbana', 0.880, 42, false),
      (4822, '335', '0335-B', '0335-B-1', 'CARTAGO - AGUA CALIENTE - LOURDES - MATA DE GUINEO', 'CARTAGO', 'CARTAGO', 'loop', 'CARTAGO - LOURDES - MATA DE GUINEO / ANILLO', 'local', 0.840, 28, false),
      (4823, '335', '0335-C', '0335-C-1', 'CARTAGO - URBANIZACION COCORI', 'CARTAGO', 'CARTAGO', 'loop', 'CARTAGO - URBANIZACION COCORI / ANILLO', 'local', 0.840, 28, false),
      (4824, '335', '0335-D', '0335-D-1', 'CARTAGO - URBANIZACION MANUEL DE JESUS JIMENEZ', 'CARTAGO', 'CARTAGO', 'loop', 'CARTAGO - URBANIZACION MANUEL DE JESUS JIMENEZ / ANILLO', 'local', 0.840, 28, false),
      (4825, '335', '0335-E', '0335-E-1', 'LOURDES - EL COVAO', 'CARTAGO', 'CARTAGO', 'ida', 'LOURDES - EL COVAO / IDA', 'local', 0.840, 32, true),
      (4826, '335', '0335-E', '0335-E-2', 'EL COVAO - LOURDES', 'CARTAGO', 'CARTAGO', 'vuelta', 'EL COVAO - LOURDES / VUELTA', 'local', 0.840, 32, false),
      (4827, '336', '0336-C', '0336-C-1', 'PARAISO - PARQUE INDUSTRIAL DE CARTAGO', 'PARAISO', 'CARTAGO', 'ida', 'PARAISO - PARQUE INDUSTRIAL DE CARTAGO / IDA', 'interurbana', 0.850, 35, true),
      (4828, '336', '0336-C', '0336-C-2', 'PARQUE INDUSTRIAL DE CARTAGO - PARAISO', 'CARTAGO', 'PARAISO', 'vuelta', 'PARQUE INDUSTRIAL DE CARTAGO - PARAISO / VUELTA', 'interurbana', 0.850, 35, false),
      (4829, '336', '0336-D', '0336-D-1', 'CARTAGO - LLANOS DE SANTA LUCIA', 'CARTAGO', 'PARAISO', 'ida', 'CARTAGO - LLANOS DE SANTA LUCIA / IDA', 'local', 0.840, 28, true),
      (4830, '336', '0336-E', '0336-E-1', 'PARAISO PERIFERICA - CIUDADELA EL SALVADOR - LOS HELECHOS', 'PARAISO', 'PARAISO', 'ida', 'PARAISO PERIFERICA - LOS HELECHOS / IDA', 'local', 0.830, 30, false),
      (4831, '336', '0336-E', '0336-E-2', 'LOS HELECHOS - CIUDADELA EL SALVADOR - PARAISO', 'PARAISO', 'PARAISO', 'vuelta', 'LOS HELECHOS - PARAISO PERIFERICA / VUELTA', 'local', 0.830, 30, false),
      (4832, '336', '0336-G', '0336-G-1', 'CARTAGO - LA PUEBLA - SANTA RITA - CABALLO BLANCO', 'CARTAGO', 'CARTAGO', 'ida', 'CARTAGO - SANTA RITA - CABALLO BLANCO / IDA', 'local', 0.830, 30, false),
      (4833, '336', '0336-H', '0336-H-1', 'PARAISO - CARTAGO - EL COVAO', 'PARAISO', 'CARTAGO', 'ida', 'PARAISO - CARTAGO - EL COVAO / IDA', 'interurbana', 0.840, 34, false),
      (4834, '336', '0336-H', '0336-H-2', 'EL COVAO - CARTAGO - PARAISO', 'CARTAGO', 'PARAISO', 'vuelta', 'EL COVAO - CARTAGO - PARAISO / VUELTA', 'interurbana', 0.840, 34, true),
      (4835, '343', '0343-A', '0343-A-1', 'CARTAGO - SANTA ROSA DE OREAMUNO - SAN PABLO', 'CARTAGO', 'OREAMUNO', 'ida', 'CARTAGO - SANTA ROSA DE OREAMUNO - SAN PABLO / IDA', 'interurbana', 0.860, 38, false),
      (4836, '343', '0343-A', '0343-A-2', 'SAN PABLO - SANTA ROSA DE OREAMUNO - CARTAGO', 'OREAMUNO', 'CARTAGO', 'vuelta', 'SAN PABLO - SANTA ROSA DE OREAMUNO - CARTAGO / VUELTA', 'interurbana', 0.850, 38, true),
      (4837, '343', '0343-A', '0343-A-3', 'SANTA ROSA DE OREAMUNO - CARTAGO', 'OREAMUNO', 'CARTAGO', 'vuelta', 'SANTA ROSA DE OREAMUNO - CARTAGO / VUELTA CORTA', 'local', 0.830, 38, true),
      (4838, '366', '0366-C', '0366-C-1', 'CARTAGO - BARRIO SAGRADA FAMILIA', 'CARTAGO', 'CARTAGO', 'ida', 'CARTAGO - BARRIO SAGRADA FAMILIA / IDA', 'local', 0.840, 30, true),
      (4839, '366', '0366-C', '0366-C-2', 'BARRIO SAGRADA FAMILIA - CARTAGO', 'CARTAGO', 'CARTAGO', 'vuelta', 'BARRIO SAGRADA FAMILIA - CARTAGO / VUELTA', 'local', 0.840, 30, false),
      (4840, '370', '0370-A', '0370-A-1', 'CARTAGO - LLANO LOS ANGELES', 'CARTAGO', 'CARTAGO', 'ida', 'CARTAGO - LLANO LOS ANGELES / IDA', 'interurbana', 0.860, 38, false),
      (4841, '370', '0370-A', '0370-A-2', 'LLANO LOS ANGELES - CARTAGO', 'CARTAGO', 'CARTAGO', 'vuelta', 'LLANO LOS ANGELES - CARTAGO / VUELTA', 'interurbana', 0.860, 38, false),
      (4842, '371', '0371-A', '0371-A-1', 'CARTAGO - BIRRISITO - LA FLOR - EL YAS', 'CARTAGO', 'PARAISO', 'ida', 'CARTAGO - BIRRISITO - LA FLOR - EL YAS / IDA', 'interurbana', 0.850, 44, false),
      (4843, '371', '0371-A', '0371-A-2', 'EL YAS - LA FLOR - BIRRISITO - CARTAGO', 'PARAISO', 'CARTAGO', 'vuelta', 'EL YAS - LA FLOR - BIRRISITO - CARTAGO / VUELTA', 'interurbana', 0.850, 44, false),
      (4844, '371', '0371-B', '0371-B-1', 'LA FLOR - PARQUE INDUSTRIAL', 'PARAISO', 'CARTAGO', 'ida', 'LA FLOR - PARQUE INDUSTRIAL / IDA', 'interurbana', 0.820, 48, false)
  ) as seed(
    ruta_id,
    route_code,
    variant_family_code,
    variant_code,
    nombre_ruta,
    canton_inicio,
    canton_final,
    sentido,
    pattern_name,
    categoria_operativa,
    clasificacion_confianza,
    frecuencia_base_min,
    reverse_stop_order
  )
)
select public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id := ruta_id,
  p_route_code := route_code,
  p_variant_family_code := variant_family_code,
  p_variant_code := variant_code,
  p_nombre_ruta := nombre_ruta,
  p_canton_inicio := canton_inicio,
  p_canton_final := canton_final,
  p_sentido := sentido,
  p_pattern_name := pattern_name,
  p_categoria_operativa := categoria_operativa,
  p_clasificacion_confianza := clasificacion_confianza,
  p_frecuencia_base_min := frecuencia_base_min,
  p_reverse_stop_order := reverse_stop_order,
  p_seed_source := 'prueba_cartago_core_missing_runtime_seed_v1'
)
from seeds;
