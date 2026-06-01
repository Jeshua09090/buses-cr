-- Round 9 data-quality patch: name high-confidence runtime paradas that
-- currently surface as "Parada sin nombre" in planner-lab/RAPTOR output.
--
-- Evidence:
-- .planning/phases/01-raptor-runtime/WAVE-2-CARTAGO-LOGIC-ROUND-9.md
--
-- This patch intentionally leaves parada 3455 untouched because the closest
-- official CTP stop is ~151m away, so it needs manual review before naming.
--
-- Remote apply:
-- - Applied through Supabase MCP on 2026-05-20 06:34 Costa Rica time.
-- - Updated ids: 1077, 2514, 2764, 3456, 3457.
-- - Verification after apply: only parada 3455 remains blank/problematic.
-- - The script still ends in ROLLBACK to stay safe if re-run manually.

begin;

select
  id,
  nombre as before_nombre,
  lat,
  lng
from public.paradas
where id in (1077, 2514, 2764, 3456, 3457)
order by id;

with proposed(id, nombre, ctp_source_id, ctp_distance_m, note) as (
  values
    (1077, 'EN LA ENTRADA DE UN VIVERO, DIAGONAL A ELECTRONICA EA', 18357, 12.0, 'Nearest official CTP stop within 12m'),
    (2514, 'TERMINAL DE CARTAGO BUSES LOYOLA', 15295, 3.8, 'Nearest official CTP stop within 4m'),
    (2764, 'MASXMENOS SABANA. FRENTE A HOTEL COROBICI', 162, 2.2, 'Nearest official CTP stop within 3m'),
    (3456, 'FRENTE A CASA FELLO MEZA', 13125, 15.9, 'Nearest official CTP stop within 16m'),
    (3457, 'DIAGONAL A LA CASA DE LOS PATOS', 13136, 9.7, 'Nearest official CTP stop within 10m')
)
update public.paradas p
set
  nombre = proposed.nombre,
  metadata = jsonb_set(
    coalesce(p.metadata, '{}'::jsonb),
    '{round9_name_source}',
    jsonb_build_object(
      'ctp_source_id', proposed.ctp_source_id,
      'distance_m', proposed.ctp_distance_m,
      'note', proposed.note,
      'applied_from', 'prueba_round9_named_runtime_paradas_v1'
    ),
    true
  ),
  updated_at = timezone('utc', now())
from proposed
where p.id = proposed.id
  and (p.nombre is null or btrim(p.nombre) = '');

select
  id,
  nombre as after_nombre,
  metadata -> 'round9_name_source' as round9_name_source
from public.paradas
where id in (1077, 2514, 2764, 3456, 3457)
order by id;

rollback;

-- Replace ROLLBACK with COMMIT only after manual review.
