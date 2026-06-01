set search_path = public, extensions;

-- Runtime seed for the San Jose/Turrialba trunk through east Cartago.
-- Moovit uses this corridor after the Taras local feeder for destinations like
-- Basilica de Los Angeles and TEC, so the planner needs the runtime pattern.

select public.planner_promote_ctp_variant_to_runtime(
  4302,
  '302',
  '0302-A',
  '0302-A-1',
  'SAN JOSE - TURRIALBA COLECTIVO',
  'SAN JOSE',
  'TURRIALBA',
  'ida',
  'San Jose - Turrialba Colectivo',
  'interurbana',
  0.880,
  30,
  false,
  'preview_cartago_turrialba_trunk_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4303,
  '302',
  '0302-A',
  '0302-A-2',
  'TURRIALBA - SAN JOSE COLECTIVO',
  'TURRIALBA',
  'SAN JOSE',
  'vuelta',
  'Turrialba - San Jose Colectivo',
  'interurbana',
  0.880,
  30,
  false,
  'preview_turrialba_cartago_trunk_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4304,
  '302',
  '0302-A',
  '0302-A-3',
  'SAN JOSE - TURRIALBA EXPRESO',
  'SAN JOSE',
  'TURRIALBA',
  'ida',
  'San Jose - Turrialba Expreso',
  'interurbana',
  0.860,
  25,
  false,
  'preview_cartago_turrialba_expreso_v1'
);

select public.planner_promote_ctp_variant_to_runtime(
  4305,
  '302',
  '0302-A',
  '0302-A-4',
  'TURRIALBA - SAN JOSE EXPRESO',
  'TURRIALBA',
  'SAN JOSE',
  'vuelta',
  'Turrialba - San Jose Expreso',
  'interurbana',
  0.860,
  25,
  false,
  'preview_turrialba_cartago_expreso_v1'
);
