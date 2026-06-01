import assert from 'node:assert/strict';
import test from 'node:test';

import { Route as PublicRoute, type Stop, type Timetable, type VehicleLeg } from 'minotor';

import { haversineMeters } from '../geo';
import { mapRaptorRouteToJourney } from '../result-mapper';
import type { NearbyStopCandidate, RaptorJourneyContext, SnapshotMetadata } from '../types';

const stopA: Stop = {
  id: 1,
  sourceStopId: '101',
  name: 'Parada A',
  lat: 9.864,
  lon: -83.919,
  children: [],
  locationType: 'SIMPLE_STOP_OR_PLATFORM',
};

const stopB: Stop = {
  id: 2,
  sourceStopId: '202',
  name: 'Parada B',
  lat: 9.865,
  lon: -83.918,
  children: [],
  locationType: 'SIMPLE_STOP_OR_PLATFORM',
};

const stopC: Stop = {
  id: 3,
  sourceStopId: '303',
  name: 'Parada C',
  lat: 9.866,
  lon: -83.917,
  children: [],
  locationType: 'SIMPLE_STOP_OR_PLATFORM',
};

const baseMetadata: SnapshotMetadata = {
  version: 'test-snapshot',
  generated_at: '2026-05-06T00:00:00.000Z',
  minotor_version: '11.2.2',
  generator_version: '0.1.0',
  schema_version: 1,
  scope: 'cartago',
  dia_tipos: ['habil', 'sabado', 'domingo', 'feriado'],
  byte_size: { raw: 1, gzipped: 1 },
  service_route_directory: {
    '7': {
      service_route_key: 'pattern-803',
      pattern_id: 803,
      ruta_id: 5332,
      route_name: 'Cartago - Guadalupe',
      pattern_name: 'Cartago - Guadalupe / LOOP',
      pattern_code: 'preview-loop-5332',
      categoria_operativa: 'local',
      sub_arcs: [{ sub_arc_index: 0, reason: 'linear', stop_count: 2, parada_ids: [101, 202] }],
    },
  },
};

function makeContext(): RaptorJourneyContext {
  const fromCandidate: NearbyStopCandidate = {
    stopId: stopA.id,
    sourceStopId: stopA.sourceStopId ?? null,
    paradaId: 101,
    name: stopA.name,
    lat: stopA.lat ?? 0,
    lng: stopA.lon ?? 0,
    distanceMeters: 60,
  };
  const toCandidate: NearbyStopCandidate = {
    stopId: stopB.id,
    sourceStopId: stopB.sourceStopId ?? null,
    paradaId: 202,
    name: stopB.name,
    lat: stopB.lat ?? 0,
    lng: stopB.lon ?? 0,
    distanceMeters: 120,
  };

  return {
    origin: { lat: 9.8635, lng: -83.9195 },
    destination: { lat: 9.8655, lng: -83.9175 },
    diaTipo: 'habil',
    departureMinutes: 470,
    fromCandidate,
    toCandidate,
    maxTransfers: 1,
  };
}

function makeVehicleLeg(from = stopA, to = stopB): VehicleLeg {
  return {
    from,
    to,
    route: { type: 'BUS', name: 'Cartago - Guadalupe' },
    departureTime: 480,
    arrivalTime: 500,
    pickUpType: 'REGULAR',
    dropOffType: 'REGULAR',
  };
}

function makeTimetable(serviceRouteId = 7): Timetable {
  const timetableRoute = {
    stopRouteIndices(stopId: number) {
      if (stopId === stopA.id) return [0];
      if (stopId === stopB.id) return [1];
      return [];
    },
    getNbTrips() {
      return 1;
    },
    departureFrom(stopIndex: number) {
      return stopIndex === 0 ? 480 : 500;
    },
    arrivalAt(stopIndex: number) {
      return stopIndex === 1 ? 500 : 480;
    },
    serviceRoute() {
      return serviceRouteId;
    },
  };

  return {
    routesPassingThrough() {
      return [timetableRoute];
    },
  } as unknown as Timetable;
}

test('mapRaptorRouteToJourney maps an exact timetable route to directory metadata', () => {
  const journey = mapRaptorRouteToJourney({
    route: new PublicRoute([makeVehicleLeg()]),
    timetable: makeTimetable(),
    metadata: baseMetadata,
    context: makeContext(),
  });

  assert.ok(journey);
  assert.equal(journey.routeId, 5332);
  assert.equal(journey.routeName, 'Cartago - Guadalupe');
  assert.equal(journey.routeCode, 'preview-loop-5332');
  assert.equal(journey.boardStopName, 'Parada A');
  assert.equal(journey.dropStopName, 'Parada B');
  assert.equal(journey.totalWalkMeters, 180);
  assert.equal(journey.kind, 'direct');
});

test('mapRaptorRouteToJourney weights access walking strongly enough for local ranking', () => {
  const journey = mapRaptorRouteToJourney({
    route: new PublicRoute([makeVehicleLeg()]),
    timetable: makeTimetable(),
    metadata: baseMetadata,
    context: makeContext(),
  });

  assert.ok(journey);
  assert.equal(journey.score, 20 + 10 * 0.25 + 180 / 70);
});

test('mapRaptorRouteToJourney falls back by route name when exact route lookup misses', () => {
  const timetable = {
    routesPassingThrough() {
      return [];
    },
  } as unknown as Timetable;
  const journey = mapRaptorRouteToJourney({
    route: new PublicRoute([makeVehicleLeg()]),
    timetable,
    metadata: baseMetadata,
    context: makeContext(),
  });

  assert.ok(journey);
  assert.equal(journey.routeId, 5332);
  assert.equal(journey.routeName, 'Cartago - Guadalupe');
});

test('mapRaptorRouteToJourney includes transfer walking distance and label', () => {
  const firstLeg = makeVehicleLeg(stopA, stopB);
  const secondLeg = makeVehicleLeg(stopB, stopC);
  const journey = mapRaptorRouteToJourney({
    route: new PublicRoute([
      firstLeg,
      { from: stopB, to: stopB, type: 'REQUIRES_MINIMAL_TIME', minTransferTime: 3 },
      secondLeg,
    ]),
    timetable: makeTimetable(),
    metadata: baseMetadata,
    context: makeContext(),
  });

  assert.ok(journey);
  assert.equal(journey.kind, 'transfer');
  assert.equal(journey.transferLabel, 'Transbordo en Parada B');
});

test('mapRaptorRouteToJourney counts post-bus walking as final walk, not transfer walk', () => {
  const context = makeContext();
  const finalWalkMeters = haversineMeters(
    { lat: stopB.lat ?? 0, lng: stopB.lon ?? 0 },
    { lat: stopC.lat ?? 0, lng: stopC.lon ?? 0 },
  );
  context.toCandidate = {
    stopId: stopC.id,
    sourceStopId: stopC.sourceStopId ?? null,
    paradaId: 303,
    name: stopC.name,
    lat: stopC.lat ?? 0,
    lng: stopC.lon ?? 0,
    distanceMeters: 40,
  };

  const journey = mapRaptorRouteToJourney({
    route: new PublicRoute([
      makeVehicleLeg(stopA, stopB),
      { from: stopB, to: stopC, type: 'REQUIRES_MINIMAL_TIME', minTransferTime: 0 },
    ]),
    timetable: makeTimetable(),
    metadata: baseMetadata,
    context,
  });

  assert.ok(journey);
  assert.equal(journey.kind, 'direct');
  assert.equal(journey.transferWalkMeters, 0);
  assert.equal(journey.transferLabel, null);
  assert.equal(journey.destinationWalkMeters, finalWalkMeters + 40);
  assert.equal(journey.geoMetrics?.finalWalkMeters, finalWalkMeters + 40);
  assert.equal(journey.geoMetrics?.finalStopDestinationDistanceMeters, finalWalkMeters + 40);
  assert.equal(journey.totalWalkMeters, context.fromCandidate.distanceMeters + finalWalkMeters + 40);
  assert.equal(journey.dropStopName, 'Parada B');
});

test('mapRaptorRouteToJourney returns null when route has no vehicle legs', () => {
  const journey = mapRaptorRouteToJourney({
    route: new PublicRoute([{ from: stopA, to: stopB, type: 'REQUIRES_MINIMAL_TIME', minTransferTime: 3 }]),
    timetable: makeTimetable(),
    metadata: baseMetadata,
    context: makeContext(),
  });

  assert.equal(journey, null);
});
