import assert from 'node:assert/strict';
import test from 'node:test';

import { StopsIndex } from 'minotor';

import { findNearestStops } from '../nearest-stops';
import type { RouteNamesByStopId } from '../types';

const basePoint = { lat: 9.864, lng: -83.919 };

type StopEntry = ReturnType<typeof stopAtDistance>;

function stopAtDistance(id: number, distanceMeters: number, routeNames: string | string[] = []) {
  const metersPerLngDegree = 111_320 * Math.cos((basePoint.lat * Math.PI) / 180);
  return {
    stop: {
      id,
      sourceStopId: String(id),
      name: `Stop ${id}`,
      lat: basePoint.lat,
      lon: basePoint.lng + distanceMeters / metersPerLngDegree,
      children: [],
      locationType: 'SIMPLE_STOP_OR_PLATFORM' as const,
    },
    routeNames: Array.isArray(routeNames) ? routeNames : [routeNames].filter(Boolean),
  };
}

function makeStopsIndex(entries: StopEntry[]) {
  return new StopsIndex(entries.map((entry) => entry.stop));
}

function makeRouteNamesByStopId(entries: StopEntry[]): RouteNamesByStopId {
  return new Map(
    entries
      .filter((entry) => entry.routeNames.length > 0)
      .map((entry) => [entry.stop.id, new Set(entry.routeNames)] as const),
  );
}

function sourceIds(candidates: ReturnType<typeof findNearestStops>) {
  return candidates.map((candidate) => candidate.paradaId);
}

const stopsIndex = new StopsIndex([
  {
    id: 1,
    sourceStopId: '1001',
    name: 'Cartago Centro',
    lat: 9.864,
    lon: -83.919,
    children: [],
    locationType: 'SIMPLE_STOP_OR_PLATFORM',
  },
  {
    id: 2,
    sourceStopId: '1002',
    name: 'Muy Lejos',
    lat: 9.99,
    lon: -83.8,
    children: [],
    locationType: 'SIMPLE_STOP_OR_PLATFORM',
  },
]);

test('findNearestStops filters by radius and preserves source parada id', () => {
  const candidates = findNearestStops({
    stopsIndex,
    point: { lat: 9.8642, lng: -83.9188 },
    radiusMeters: 200,
    limit: 5,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].stopId, 1);
  assert.equal(candidates[0].paradaId, 1001);
  assert.ok(candidates[0].distanceMeters < 50);
});

test('findNearestStops keeps pure proximity behavior without route names', () => {
  const entries = Array.from({ length: 12 }, (_, index) => stopAtDistance(index + 1, (index + 1) * 10));
  const candidates = findNearestStops({
    stopsIndex: makeStopsIndex(entries),
    point: basePoint,
    radiusMeters: 500,
    limit: 8,
  });

  assert.deepEqual(sourceIds(candidates), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('findNearestStops uses generic diversity when route names exist without destination context', () => {
  const clustered = Array.from({ length: 10 }, (_, index) =>
    stopAtDistance(index + 1, (index + 1) * 5, 'Cluster-A-Route'),
  );
  const diverse = Array.from({ length: 20 }, (_, index) =>
    stopAtDistance(index + 11, 100 + index * 25, `Outer-Route-${index + 11}`),
  );
  const entries = [...clustered, ...diverse];

  const candidates = findNearestStops({
    stopsIndex: makeStopsIndex(entries),
    point: basePoint,
    radiusMeters: 800,
    limit: 24,
    routeNamesByStopId: makeRouteNamesByStopId(entries),
  });

  assert.equal(candidates.length, 24);
  assert.deepEqual(sourceIds(candidates).slice(0, 6), [1, 2, 3, 4, 5, 6]);
  assert.equal(candidates.some((candidate) => candidate.paradaId === 7), false);
  assert.equal(candidates.some((candidate) => candidate.paradaId === 10), false);
  assert.deepEqual(sourceIds(candidates).slice(6), Array.from({ length: 18 }, (_, index) => index + 11));
});

test('findNearestStops preserves the proximity floor before adding diversity', () => {
  const entries = Array.from({ length: 12 }, (_, index) =>
    stopAtDistance(index + 1, index + 1, 'Single-Route'),
  );
  const candidates = findNearestStops({
    stopsIndex: makeStopsIndex(entries),
    point: basePoint,
    radiusMeters: 500,
    limit: 6,
    routeNamesByStopId: makeRouteNamesByStopId(entries),
  });

  assert.deepEqual(sourceIds(candidates), [1, 2, 3, 4, 5, 6]);
});

test('findNearestStops reserves slots for destination-compatible route corridors', () => {
  const clustered = Array.from({ length: 6 }, (_, index) =>
    stopAtDistance(index + 1, (index + 1) * 5, ['Cluster-A-Route-1', 'Cluster-A-Route-2']),
  );
  const generic = Array.from({ length: 14 }, (_, index) =>
    stopAtDistance(index + 7, 100 + index * 20, `Outer-Generic-Route-${index + 7}`),
  );
  const corridorOne = Array.from({ length: 5 }, (_, index) =>
    stopAtDistance(index + 21, 500 + index * 100, 'Dest-Corridor-1'),
  );
  const corridorTwo = Array.from({ length: 5 }, (_, index) =>
    stopAtDistance(index + 26, 1000 + index * 100, 'Dest-Corridor-2'),
  );
  const entries = [...clustered, ...generic, ...corridorOne, ...corridorTwo];

  const candidates = findNearestStops({
    stopsIndex: makeStopsIndex(entries),
    point: basePoint,
    radiusMeters: 1600,
    limit: 24,
    routeNamesByStopId: makeRouteNamesByStopId(entries),
    destinationRouteNames: new Set(['Dest-Corridor-1', 'Dest-Corridor-2']),
  });

  assert.equal(candidates.some((candidate) => candidate.paradaId === 21), true);
  assert.equal(candidates.some((candidate) => candidate.paradaId === 26), true);
});

test('findNearestStops deduplicates destination-compatible route corridors', () => {
  const clustered = Array.from({ length: 6 }, (_, index) =>
    stopAtDistance(index + 1, (index + 1) * 5, 'Cluster'),
  );
  const corridorOne = Array.from({ length: 4 }, (_, index) =>
    stopAtDistance(index + 21, 500 + index * 50, 'Dest-Corridor-1'),
  );
  const corridorTwo = [stopAtDistance(26, 1000, 'Dest-Corridor-2')];
  const entries = [...clustered, ...corridorOne, ...corridorTwo];

  const candidates = findNearestStops({
    stopsIndex: makeStopsIndex(entries),
    point: basePoint,
    radiusMeters: 1400,
    limit: 8,
    routeNamesByStopId: makeRouteNamesByStopId(entries),
    destinationRouteNames: new Set(['Dest-Corridor-1', 'Dest-Corridor-2']),
  });

  assert.equal(candidates.some((candidate) => candidate.paradaId === 21), true);
  assert.equal(candidates.some((candidate) => candidate.paradaId === 26), true);
  assert.equal(candidates.some((candidate) => [22, 23, 24].includes(candidate.paradaId ?? -1)), false);
});

test('findNearestStops skips destination-compatible phase for an empty destination set', () => {
  const entries = [
    ...Array.from({ length: 6 }, (_, index) => stopAtDistance(index + 1, (index + 1) * 5, 'Cluster')),
    stopAtDistance(7, 100, 'Generic-Route'),
    stopAtDistance(8, 800, 'Dest-Corridor'),
  ];
  const params = {
    stopsIndex: makeStopsIndex(entries),
    point: basePoint,
    radiusMeters: 1000,
    limit: 7,
    routeNamesByStopId: makeRouteNamesByStopId(entries),
  };

  assert.deepEqual(
    findNearestStops({ ...params, destinationRouteNames: new Set() }),
    findNearestStops(params),
  );
});

test('findNearestStops respects radius cap for destination-compatible stops', () => {
  const entries = [
    ...Array.from({ length: 6 }, (_, index) => stopAtDistance(index + 1, (index + 1) * 10, 'Cluster')),
    stopAtDistance(7, 900, 'Dest-Corridor'),
  ];
  const candidates = findNearestStops({
    stopsIndex: makeStopsIndex(entries),
    point: basePoint,
    radiusMeters: 200,
    limit: 7,
    routeNamesByStopId: makeRouteNamesByStopId(entries),
    destinationRouteNames: new Set(['Dest-Corridor']),
  });

  assert.equal(candidates.some((candidate) => candidate.paradaId === 7), false);
});

test('findNearestStops returns sorted deterministic candidates', () => {
  const entries = Array.from({ length: 30 }, (_, index) =>
    stopAtDistance(index + 1, (index + 1) * 15, index < 10 ? 'Cluster' : `Route-${index}`),
  );
  const params = {
    stopsIndex: makeStopsIndex(entries),
    point: basePoint,
    radiusMeters: 800,
    limit: 24,
    routeNamesByStopId: makeRouteNamesByStopId(entries),
    destinationRouteNames: new Set(['Route-25']),
  };

  const first = findNearestStops(params);
  const second = findNearestStops(params);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((candidate) => candidate.distanceMeters),
    first.map((candidate) => candidate.distanceMeters).sort((a, b) => a - b),
  );
});

test('findNearestStops fills by proximity when no diversity is available', () => {
  const entries = Array.from({ length: 30 }, (_, index) =>
    stopAtDistance(index + 1, (index + 1) * 10, 'Single-Route'),
  );
  const candidates = findNearestStops({
    stopsIndex: makeStopsIndex(entries),
    point: basePoint,
    radiusMeters: 500,
    limit: 24,
    routeNamesByStopId: makeRouteNamesByStopId(entries),
  });

  assert.deepEqual(sourceIds(candidates), Array.from({ length: 24 }, (_, index) => index + 1));
});

test('findNearestStops treats stops missing route-name entries as fill-only candidates', () => {
  const entries = [
    ...Array.from({ length: 6 }, (_, index) => stopAtDistance(index + 1, (index + 1) * 5, 'Cluster')),
    stopAtDistance(7, 100),
    stopAtDistance(8, 200, 'Dest-Corridor'),
  ];
  const candidates = findNearestStops({
    stopsIndex: makeStopsIndex(entries),
    point: basePoint,
    radiusMeters: 500,
    limit: 7,
    routeNamesByStopId: makeRouteNamesByStopId(entries),
    destinationRouteNames: new Set(['Dest-Corridor']),
  });

  assert.deepEqual(sourceIds(candidates), [1, 2, 3, 4, 5, 6, 8]);
});
