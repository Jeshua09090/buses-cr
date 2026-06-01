import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  getRouter,
  getRouteNamesByStopId,
  getSnapshot,
  getTimetable,
  prefetchSnapshot,
  setSnapshotForTesting,
  setSnapshotLoadersForTesting,
} from '../snapshot-cache';
import type { CachedSnapshot, SnapshotMetadata } from '../types';

const metadata: SnapshotMetadata = {
  version: 'test',
  generated_at: '2026-05-06T00:00:00.000Z',
  minotor_version: '11.2.2',
  generator_version: '0.1.0',
  schema_version: 1,
  scope: 'cartago',
  dia_tipos: ['habil', 'sabado', 'domingo', 'feriado'],
  byte_size: { raw: 1, gzipped: 1 },
  service_route_directory: {},
};

function makeSnapshot(): CachedSnapshot {
  return {
    metadata,
    stopsIndex: {} as CachedSnapshot['stopsIndex'],
    timetables: new Map([['habil', { name: 'habil timetable' } as unknown as CachedSnapshot['timetables'] extends Map<unknown, infer T> ? T : never]]),
    routers: new Map([['habil', { name: 'habil router' } as unknown as CachedSnapshot['routers'] extends Map<unknown, infer T> ? T : never]]),
  };
}

afterEach(() => {
  setSnapshotForTesting(null);
  setSnapshotLoadersForTesting(null);
});

test('getSnapshot and prefetchSnapshot return the testing override', async () => {
  const snapshot = makeSnapshot();
  setSnapshotForTesting(snapshot);

  assert.equal(await getSnapshot(), snapshot);
  assert.equal(await prefetchSnapshot(), snapshot);
});

test('getTimetable and getRouter return day-specific runtime objects', () => {
  const snapshot = makeSnapshot();

  assert.equal(getTimetable(snapshot, 'habil'), snapshot.timetables.get('habil'));
  assert.equal(getRouter(snapshot, 'habil'), snapshot.routers.get('habil'));
});

test('getTimetable and getRouter throw when dia_tipo is missing', () => {
  const snapshot = makeSnapshot();

  assert.throws(() => getTimetable(snapshot, 'feriado'), /no timetable/);
  assert.throws(() => getRouter(snapshot, 'feriado'), /no router/);
});

test('getSnapshot validates metadata before loading bundle bytes', async () => {
  let bytesLoaded = 0;
  setSnapshotLoadersForTesting({
    loadMetadata: () => ({ ...metadata, minotor_version: '0.0.0' }),
    loadBytes: async () => {
      bytesLoaded += 1;
      return new Uint8Array();
    },
  });

  await assert.rejects(getSnapshot(), /minotor version mismatch/);
  assert.equal(bytesLoaded, 0);
});

test('getRouteNamesByStopId maps service route directory parada ids to minotor stop ids', () => {
  const snapshot = makeSnapshot();
  snapshot.stopsIndex = {
    *[Symbol.iterator]() {
      yield {
        id: 10,
        sourceStopId: '101',
        name: 'Stop A',
        children: [],
        locationType: 'SIMPLE_STOP_OR_PLATFORM',
      };
      yield {
        id: 11,
        sourceStopId: '101',
        name: 'Stop A duplicate',
        children: [],
        locationType: 'SIMPLE_STOP_OR_PLATFORM',
      };
      yield {
        id: 12,
        sourceStopId: '202',
        name: 'Stop B',
        children: [],
        locationType: 'SIMPLE_STOP_OR_PLATFORM',
      };
    },
  } as unknown as CachedSnapshot['stopsIndex'];
  snapshot.metadata.service_route_directory = {
    '0': {
      service_route_key: 'pattern-1',
      pattern_id: 1,
      ruta_id: 500,
      route_name: 'Cartago Test',
      pattern_name: 'Cartago Test / IDA',
      pattern_code: 'test-ida',
      categoria_operativa: 'local',
      sub_arcs: [{ sub_arc_index: 0, reason: 'linear', stop_count: 2, parada_ids: [101, 202] }],
    },
  };

  const routeNamesByStopId = getRouteNamesByStopId(snapshot);

  assert.deepEqual(Array.from(routeNamesByStopId.get(10) ?? []), ['Cartago Test']);
  assert.deepEqual(Array.from(routeNamesByStopId.get(11) ?? []), ['Cartago Test']);
  assert.deepEqual(Array.from(routeNamesByStopId.get(12) ?? []), ['Cartago Test']);
  assert.equal(getRouteNamesByStopId(snapshot), routeNamesByStopId);
});
