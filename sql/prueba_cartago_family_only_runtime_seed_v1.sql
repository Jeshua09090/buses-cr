set search_path = public, extensions;

-- First controlled "seed more Cartago" batch:
-- promote variants that the runtime scanner classified as family_only.
-- These are lower-risk than the broad missing_seed bucket because a sibling
-- variant in the same official CTP family is already seeded.

select public.planner_promote_ctp_variant_to_runtime(
  4700,
  '300',
  '0300-J',
  '0300-J-2',
  'SAN JOSE - SAN PEDRO - TRES RIOS - TARAS - CARTAGO',
  'CARTAGO',
  'SAN JOSE',
  'vuelta',
  'SAN JOSE - SAN PEDRO - TRES RIOS - TARAS - CARTAGO / VUELTA',
  'interurbana',
  0.920,
  18,
  false,
  'prueba_cartago_family_only_runtime_seed_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4701,
  '300',
  '0300-K',
  '0300-K-1',
  'SAN JOSE - SAN PEDRO - PISTA - LA LIMA - CARTAGO',
  'SAN JOSE',
  'CARTAGO',
  'ida',
  'SAN JOSE - SAN PEDRO - PISTA - LA LIMA - CARTAGO / IDA',
  'interurbana',
  0.900,
  20,
  false,
  'prueba_cartago_family_only_runtime_seed_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4702,
  '300',
  '0300-L',
  '0300-L-1',
  'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
  'SAN JOSE',
  'CARTAGO',
  'ida',
  'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO / IDA',
  'interurbana',
  0.925,
  18,
  false,
  'prueba_cartago_family_only_runtime_seed_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4703,
  '300',
  '0300-M',
  '0300-M-1',
  'SAN JOSE - SAN PEDRO - TRES RIOS - LA LIMA - CARTAGO',
  'SAN JOSE',
  'CARTAGO',
  'ida',
  'SAN JOSE - SAN PEDRO - TRES RIOS - LA LIMA - CARTAGO / IDA',
  'interurbana',
  0.900,
  20,
  false,
  'prueba_cartago_family_only_runtime_seed_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4704,
  '300',
  '0300-R',
  '0300-R-1',
  'SAN JOSE - ZAPOTE - TRES RIOS - TARAS - CARTAGO',
  'SAN JOSE',
  'CARTAGO',
  'ida',
  'SAN JOSE - ZAPOTE - TRES RIOS - TARAS - CARTAGO / IDA',
  'interurbana',
  0.895,
  20,
  false,
  'prueba_cartago_family_only_runtime_seed_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4705,
  '300',
  '0300-U',
  '0300-U-1',
  'SAN JOSE - ZAPOTE - TRES RIOS - LA LIMA - CARTAGO',
  'SAN JOSE',
  'CARTAGO',
  'ida',
  'SAN JOSE - ZAPOTE - TRES RIOS - LA LIMA - CARTAGO / IDA',
  'interurbana',
  0.885,
  22,
  false,
  'prueba_cartago_family_only_runtime_seed_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4382,
  '338',
  '0338-A',
  '0338-A-3',
  'CARTAGO - PARAISO - BIRRISITO - SAN FRANCISCO',
  'CARTAGO',
  'PARAISO',
  'ida',
  'CARTAGO - PARAISO - BIRRISITO - SAN FRANCISCO / IDA',
  'interurbana',
  0.860,
  35,
  true,
  'prueba_cartago_family_only_runtime_seed_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4383,
  '338',
  '0338-A',
  '0338-A-4',
  'SAN FRANCISCO - BIRRISITO - PARAISO - CARTAGO',
  'PARAISO',
  'CARTAGO',
  'vuelta',
  'SAN FRANCISCO - BIRRISITO - PARAISO - CARTAGO / VUELTA',
  'interurbana',
  0.860,
  35,
  false,
  'prueba_cartago_family_only_runtime_seed_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4384,
  '338',
  '0338-A',
  '0338-A-5',
  'CARTAGO - PARAISO - BIRRISITO - CERVANTES - BAJO CERVANTES',
  'CARTAGO',
  'ALVARADO',
  'ida',
  'CARTAGO - PARAISO - BIRRISITO - CERVANTES - BAJO CERVANTES / IDA',
  'interurbana',
  0.860,
  35,
  true,
  'prueba_cartago_family_only_runtime_seed_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4385,
  '338',
  '0338-A',
  '0338-A-6',
  'BAJO CERVANTES - CERVANTES - BIRRISITO - PARAISO - CARTAGO',
  'ALVARADO',
  'CARTAGO',
  'vuelta',
  'BAJO CERVANTES - CERVANTES - BIRRISITO - PARAISO - CARTAGO / VUELTA',
  'interurbana',
  0.860,
  35,
  false,
  'prueba_cartago_family_only_runtime_seed_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4386,
  '338',
  '0338-A',
  '0338-A-7',
  'PARQUE INDUSTRIAL - CARTAGO - PARAISO - BIRRISITO - CERVANTES - SANTIAGO',
  'CARTAGO',
  'ALVARADO',
  'ida',
  'PARQUE INDUSTRIAL - CARTAGO - PARAISO - BIRRISITO - CERVANTES - SANTIAGO / IDA',
  'interurbana',
  0.860,
  35,
  true,
  'prueba_cartago_family_only_runtime_seed_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4387,
  '338',
  '0338-A',
  '0338-A-8',
  'SANTIAGO - CERVANTES - BIRRISITO - PARAISO - CARTAGO - PARQUE INDUSTRIAL',
  'ALVARADO',
  'CARTAGO',
  'vuelta',
  'SANTIAGO - CERVANTES - BIRRISITO - PARAISO - CARTAGO - PARQUE INDUSTRIAL / VUELTA',
  'interurbana',
  0.860,
  35,
  false,
  'prueba_cartago_family_only_runtime_seed_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4388,
  '338',
  '0338-A',
  '0338-A-9',
  'SANTIAGO - CERVANTES ESTUDIANTES',
  'ALVARADO',
  'ALVARADO',
  'vuelta',
  'SANTIAGO - CERVANTES ESTUDIANTES / VUELTA',
  'interurbana',
  0.760,
  60,
  false,
  'prueba_cartago_family_only_runtime_seed_v1'
);
