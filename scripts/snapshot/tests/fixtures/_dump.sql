-- Regenerate one real Cartago pattern fixture for snapshot linearization tests.
-- Replace 803 with the desired pattern_id and save the JSON output to
-- scripts/snapshot/tests/fixtures/pattern-<id>.json.
select jsonb_pretty(jsonb_agg(to_jsonb(t) order by t.stop_sequence))
from (
  select
    rps.pattern_id,
    rp.ruta_id,
    rps.parada_id,
    rps.stop_sequence,
    rps.es_subida,
    rps.es_bajada,
    rps.pickup_type,
    rps.drop_off_type,
    rps.distancia_acumulada_m,
    rps.tiempo_estimado_desde_inicio_min
  from route_pattern_stops rps
  join route_patterns rp on rp.id = rps.pattern_id
  where rps.pattern_id = 803
  order by rps.stop_sequence
) t;
