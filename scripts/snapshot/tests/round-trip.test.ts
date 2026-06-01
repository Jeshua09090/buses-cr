import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Query, Router, StopsIndex, Timetable } from 'minotor';

import { buildMinotorSnapshot } from '../src/build-minotor.ts';
import { expandFrequencies } from '../src/expand-frequencies.ts';
import { linearizePattern } from '../src/linearize-patterns.ts';
import { buildServiceRouteDirectory } from '../src/service-route-directory.ts';
import type { RawPatternRow, RawServiceWindowRow } from '../src/types.ts';

function stop(paradaId: number, stopSequence: number, minutes: number): RawPatternRow {
  return {
    pattern_id: 300,
    ruta_id: 800,
    parada_id: paradaId,
    stop_sequence: stopSequence,
    es_subida: true,
    es_bajada: true,
    pickup_type: 0,
    drop_off_type: 0,
    distancia_acumulada_m: minutes * 400,
    tiempo_estimado_desde_inicio_min: minutes,
  };
}

const serviceWindow: RawServiceWindowRow = {
  pattern_id: 300,
  dia_tipo: 'habil',
  hora_inicio: '06:00:00',
  hora_fin: '06:20:00',
  frecuencia_promedio_min: 20,
  espera_promedio_min: 10,
  activo: true,
};

describe('minotor snapshot round trip', () => {
  it('serializes, deserializes, and answers a direct route query', () => {
    const linearized = linearizePattern({
      pattern_id: 300,
      ruta_id: 800,
      stops: [stop(10, 1, 0), stop(20, 2, 8)],
    });
    const expanded = expandFrequencies(linearized, [serviceWindow]);
    const built = buildMinotorSnapshot({
      paradas: [
        { id: 10, nombre: 'Origen', lat: 9.9, lng: -83.9 },
        { id: 20, nombre: 'Destino', lat: 9.91, lng: -83.91 },
      ],
      routePatterns: [
        {
          pattern_id: 300,
          ruta_id: 800,
          route_name: 'Ruta de prueba',
          pattern_name: 'Ruta de prueba / IDA',
          pattern_code: 'test-300',
          categoria_operativa: 'local',
        },
      ],
      linearized,
      tripsByDiaTipo: expanded.tripsByDiaTipo,
      transferEdges: [],
    });
    const directory = buildServiceRouteDirectory({
      linearized,
      routePatterns: [
        {
          pattern_id: 300,
          ruta_id: 800,
          route_name: 'Ruta de prueba',
          pattern_name: 'Ruta de prueba / IDA',
          pattern_code: 'test-300',
          categoria_operativa: 'local',
        },
      ],
      serviceRouteIdByKey: expanded.serviceRouteIdByKey,
    });

    const stops = StopsIndex.fromData(built.blobs.get('stops') ?? new Uint8Array());
    const timetable = Timetable.fromData(built.blobs.get('tt-habil') ?? new Uint8Array());
    const route = timetable.getRoute(0);
    assert.ok(route);
    assert.ok(directory[String(route.serviceRoute())]);

    const router = new Router(timetable, stops);
    const query = new Query.Builder()
      .from(0)
      .to(1)
      .departureTime(350)
      .maxTransfers(0)
      .minTransferTime(0)
      .transportModes(new Set(['BUS']))
      .build();
    const result = router.route(query);

    assert.ok(result.arrivalAt(1));
    assert.equal(stops.findStopBySourceStopId('10')?.name, 'Origen');
  });

  it('lets real transfer edges win over synthetic conflicts', () => {
    const linearized = linearizePattern({
      pattern_id: 300,
      ruta_id: 800,
      stops: [stop(10, 1, 0), stop(20, 2, 8)],
    });
    const expanded = expandFrequencies(linearized, [serviceWindow]);
    const built = buildMinotorSnapshot({
      paradas: [
        { id: 10, nombre: 'Origen', lat: 9.9, lng: -83.9 },
        { id: 20, nombre: 'Destino', lat: 9.9001, lng: -83.9001 },
      ],
      routePatterns: [
        {
          pattern_id: 300,
          ruta_id: 800,
          route_name: 'Ruta de prueba',
          pattern_name: 'Ruta de prueba / IDA',
          pattern_code: 'test-300',
          categoria_operativa: 'local',
        },
      ],
      linearized,
      tripsByDiaTipo: expanded.tripsByDiaTipo,
      transferEdges: [
        {
          from_boarding_point_id: 1,
          to_boarding_point_id: 2,
          from_area_id: null,
          to_area_id: null,
          from_parada_id: 10,
          to_parada_id: 20,
          distance_m: 150,
          walk_time_min: 3,
          transfer_type: 'same_macro',
          confidence: 1,
          activo: true,
          source: 'planner_transfer_edges',
        },
        {
          from_boarding_point_id: null,
          to_boarding_point_id: null,
          from_area_id: null,
          to_area_id: null,
          from_parada_id: 10,
          to_parada_id: 20,
          distance_m: 40,
          walk_time_min: 1,
          transfer_type: 'nearby_walk',
          confidence: 0.75,
          activo: true,
          source: 'auto_synthesized',
        },
      ],
    });

    const timetable = Timetable.fromData(built.blobs.get('tt-habil') ?? new Uint8Array());
    assert.equal(timetable.getTransfers(0)[0]?.minTransferTime, 3);
    assert.equal(built.diagnostics.realWinningOnConflict, 1);
  });
});
