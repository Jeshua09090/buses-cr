import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expandFrequencies } from '../src/expand-frequencies.ts';
import { linearizePattern } from '../src/linearize-patterns.ts';
import type { RawPatternRow, RawServiceWindowRow } from '../src/types.ts';

function stop(paradaId: number, stopSequence: number, minutes: number | null, distance = stopSequence * 100): RawPatternRow {
  return {
    pattern_id: 200,
    ruta_id: 700,
    parada_id: paradaId,
    stop_sequence: stopSequence,
    es_subida: true,
    es_bajada: true,
    pickup_type: 0,
    drop_off_type: 0,
    distancia_acumulada_m: distance,
    tiempo_estimado_desde_inicio_min: minutes,
  };
}

function windowFor(patternId = 200): RawServiceWindowRow {
  return {
    pattern_id: patternId,
    dia_tipo: 'habil',
    hora_inicio: '06:00:00',
    hora_fin: '07:00:00',
    frecuencia_promedio_min: 20,
    espera_promedio_min: 10,
    activo: true,
  };
}

describe('expandFrequencies', () => {
  it('generates discrete trips for each active service window', () => {
    const subPatterns = linearizePattern({
      pattern_id: 200,
      ruta_id: 700,
      stops: [stop(10, 1, 0), stop(20, 2, 5), stop(30, 3, 9)],
    });
    const result = expandFrequencies(subPatterns, [windowFor()]);
    const trips = result.tripsByDiaTipo.get('habil') ?? [];

    assert.equal(trips.length, 4);
    assert.deepEqual(
      trips[0].stops.map((entry) => entry.arrivalMin),
      [360, 365, 369],
    );
    assert.equal(result.diagnostics.tripsPerDiaTipo.habil, 4);
  });

  it('uses distance fallback when cumulative time is missing', () => {
    const subPatterns = linearizePattern({
      pattern_id: 200,
      ruta_id: 700,
      stops: [stop(10, 1, null, 0), stop(20, 2, null, 500), stop(30, 3, null, 1_000)],
    });
    const result = expandFrequencies(subPatterns, [windowFor()]);
    const trip = result.tripsByDiaTipo.get('habil')?.[0];

    assert.ok(trip);
    assert.deepEqual(
      trip.stops.map((entry) => entry.arrivalMin),
      [360, 361, 362],
    );
  });

  it('skips inactive windows', () => {
    const subPatterns = linearizePattern({
      pattern_id: 200,
      ruta_id: 700,
      stops: [stop(10, 1, 0), stop(20, 2, 5)],
    });
    const result = expandFrequencies(subPatterns, [{ ...windowFor(), activo: false }]);

    assert.equal(result.tripsByDiaTipo.get('habil')?.length, 0);
  });
});

describe('expandFrequencies - sub-arc continuity', () => {
  it('linearized siblings share trip times across the connector', () => {
    const subPatterns = linearizePattern({
      pattern_id: 200,
      ruta_id: 700,
      stops: [
        stop(10, 1, 0),
        stop(20, 2, 5),
        stop(30, 3, 10),
        stop(40, 4, 15),
        stop(20, 5, 23),
        stop(50, 6, 27),
        stop(60, 7, 33),
      ],
    });
    const result = expandFrequencies(subPatterns, [
      {
        ...windowFor(),
        hora_inicio: '06:00:00',
        hora_fin: '06:30:00',
        frecuencia_promedio_min: 30,
      },
    ]);
    const trips = result.tripsByDiaTipo.get('habil') ?? [];
    const arc0 = trips.find((trip) => trip.subPattern.sub_arc_index === 0);
    const arc1 = trips.find((trip) => trip.subPattern.sub_arc_index === 1);

    assert.deepEqual(
      arc0?.stops.map((entry) => entry.arrivalMin),
      [360, 365, 370, 375],
    );
    assert.deepEqual(
      arc1?.stops.map((entry) => entry.arrivalMin),
      [375, 383, 387, 393],
    );
  });

  it('does not produce ghost trips at hora_inicio for non-zero sub-arc index', () => {
    const subPatterns = linearizePattern({
      pattern_id: 200,
      ruta_id: 700,
      stops: [
        stop(10, 1, 0),
        stop(20, 2, 5),
        stop(30, 3, 10),
        stop(40, 4, 15),
        stop(20, 5, 23),
      ],
    });
    const result = expandFrequencies(subPatterns, [windowFor()]);
    const arc1FirstTrip = result.tripsByDiaTipo.get('habil')?.find((trip) => trip.subPattern.sub_arc_index === 1);

    assert.notEqual(arc1FirstTrip?.stops[0]?.arrivalMin, 360);
  });

  it('strictly linear pattern emits one trip per departure', () => {
    const subPatterns = linearizePattern({
      pattern_id: 200,
      ruta_id: 700,
      stops: [stop(10, 1, 0), stop(20, 2, 5)],
    });
    const result = expandFrequencies(subPatterns, [windowFor()]);

    assert.equal(result.tripsByDiaTipo.get('habil')?.length, 4);
  });
});
