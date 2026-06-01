import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { linearizePattern } from '../src/linearize-patterns.ts';
import { buildServiceRouteDirectory } from '../src/service-route-directory.ts';
import type { RawPatternRow, RawRoutePatternRow } from '../src/types.ts';

function stop(patternId: number, rutaId: number, paradaId: number, stopSequence: number): RawPatternRow {
  return {
    pattern_id: patternId,
    ruta_id: rutaId,
    parada_id: paradaId,
    stop_sequence: stopSequence,
    es_subida: true,
    es_bajada: true,
    pickup_type: 0,
    drop_off_type: 0,
    distancia_acumulada_m: stopSequence * 100,
    tiempo_estimado_desde_inicio_min: stopSequence,
  };
}

function pattern(patternId: number, rutaId: number, routeName: string): RawRoutePatternRow {
  return {
    pattern_id: patternId,
    ruta_id: rutaId,
    route_name: routeName,
    pattern_name: `${routeName} / IDA`,
    pattern_code: `pattern-${patternId}`,
    categoria_operativa: 'local',
  };
}

describe('service-route directory', () => {
  const linear = linearizePattern({
    pattern_id: 100,
    ruta_id: 900,
    stops: [stop(100, 900, 10, 1), stop(100, 900, 20, 2)],
  });
  const revisit = linearizePattern({
    pattern_id: 200,
    ruta_id: 901,
    stops: [
      stop(200, 901, 30, 1),
      stop(200, 901, 40, 2),
      stop(200, 901, 50, 3),
      stop(200, 901, 40, 4),
      stop(200, 901, 60, 5),
    ],
  });
  const loop = linearizePattern({
    pattern_id: 300,
    ruta_id: 902,
    stops: [stop(300, 902, 70, 1), stop(300, 902, 80, 2), stop(300, 902, 70, 3)],
  });
  const linearized = [...linear, ...revisit, ...loop];
  const routePatterns = [
    pattern(100, 900, 'Ruta lineal'),
    pattern(200, 901, 'Ruta con revisit'),
    pattern(300, 902, 'Ruta loop'),
  ];
  const serviceRouteIdByKey = new Map([
    ['pattern-100', 0],
    ['pattern-200', 1],
    ['pattern-300', 2],
  ]);

  it('emits one entry per unique service_route_key', () => {
    const directory = buildServiceRouteDirectory({ linearized, routePatterns, serviceRouteIdByKey });

    assert.equal(Object.keys(directory).length, 3);
    assert.equal(directory['0']?.pattern_id, 100);
    assert.equal(directory['1']?.pattern_id, 200);
    assert.equal(directory['2']?.pattern_id, 300);
  });

  it('siblings sub-arcs share same directory entry but appear in sub_arcs', () => {
    const directory = buildServiceRouteDirectory({ linearized, routePatterns, serviceRouteIdByKey });

    assert.equal(directory['1']?.service_route_key, 'pattern-200');
    assert.equal(directory['1']?.sub_arcs.length, 2);
    assert.deepEqual(
      directory['1']?.sub_arcs.map((arc) => arc.sub_arc_index),
      [0, 1],
    );
    assert.ok(directory['1']?.sub_arcs.every((arc) => arc.reason === 'revisit'));
  });

  it('preserves parada_ids order from linearization', () => {
    const directory = buildServiceRouteDirectory({ linearized, routePatterns, serviceRouteIdByKey });

    assert.deepEqual(directory['1']?.sub_arcs[0]?.parada_ids, revisit[0]?.stops);
    assert.deepEqual(directory['1']?.sub_arcs[1]?.parada_ids, revisit[1]?.stops);
  });

  it('keys are stringified Minotor serviceRouteId', () => {
    const directory = buildServiceRouteDirectory({
      linearized,
      routePatterns,
      serviceRouteIdByKey: new Map([
        ['pattern-100', 7],
        ['pattern-200', 42],
      ]),
    });

    assert.ok(directory['7']);
    assert.ok(directory['42']);
    assert.equal(directory['0'], undefined);
  });
});
