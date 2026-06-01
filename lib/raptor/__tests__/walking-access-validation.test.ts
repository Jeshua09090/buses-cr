import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlannedJourney } from '@/lib/journey-planner';
import type { WalkingCoordinate, WalkingRouteResult } from '@/lib/walking-network';

import { applyEndpointWalkingNetworkValidationToJourneys } from '../walking-access-validation';

function stop(id: number, coordinate: WalkingCoordinate) {
  return {
    parada_id: id,
    nombre: `Stop ${id}`,
    lng: coordinate[0],
    lat: coordinate[1],
    tiene_techo: null,
    accesible: null,
  };
}

function makeJourney(overrides: Partial<PlannedJourney> & {
  boardCoordinate: WalkingCoordinate;
  alightCoordinate: WalkingCoordinate;
}): PlannedJourney {
  const boardStop = stop(overrides.routeId ?? 1, overrides.boardCoordinate);
  const alightStop = stop((overrides.routeId ?? 1) + 100, overrides.alightCoordinate);

  return {
    id: overrides.id ?? 'journey',
    kind: overrides.kind ?? 'direct',
    routeId: overrides.routeId ?? 1,
    routeName: overrides.routeName ?? 'Cartago Test',
    routeCode: overrides.routeCode ?? null,
    operatorLabel: overrides.operatorLabel ?? 'RAPTOR local',
    routeIds: overrides.routeIds ?? [overrides.routeId ?? 1],
    routeCodes: overrides.routeCodes ?? [],
    legs:
      overrides.legs ??
      [
        {
          routeId: overrides.routeId ?? 1,
          routeName: overrides.routeName ?? 'Cartago Test',
          routeCode: null,
          operator: 'RAPTOR local',
          boardStopId: boardStop.parada_id,
          boardStopName: boardStop.nombre,
          boardStop,
          alightStopId: alightStop.parada_id,
          alightStopName: alightStop.nombre,
          alightStop,
        },
      ],
    originWalkMeters: overrides.originWalkMeters ?? 0,
    destinationWalkMeters: overrides.destinationWalkMeters ?? 0,
    transferWalkMeters: overrides.transferWalkMeters ?? 0,
    totalWalkMeters: overrides.totalWalkMeters ?? 0,
    totalFare: overrides.totalFare ?? null,
    score: overrides.score ?? 10,
    boardStopName: overrides.boardStopName ?? boardStop.nombre ?? 'Subida',
    dropStopName: overrides.dropStopName ?? alightStop.nombre ?? 'Bajada',
    transferLabel: overrides.transferLabel ?? null,
    geoMetrics: overrides.geoMetrics ?? null,
  };
}

function walkingResult(params: {
  from: WalkingCoordinate;
  to: WalkingCoordinate;
  networkDistanceMeters: number;
  straightLineMeters: number;
}): WalkingRouteResult {
  return {
    provider: 'mapbox',
    status: 'ok',
    routeAvailable: true,
    straightLineMeters: params.straightLineMeters,
    networkDistanceMeters: params.networkDistanceMeters,
    networkDurationMinutes: Math.round(params.networkDistanceMeters / 83),
    detourRatio:
      params.straightLineMeters > 0
        ? params.networkDistanceMeters / params.straightLineMeters
        : 1,
    coordinates: [params.from, params.to],
    failureReason: null,
  };
}

test('applyEndpointWalkingNetworkValidationToJourneys lets real origin access walking affect ranking', async () => {
  const origin: WalkingCoordinate = [-83.9389, 9.8782];
  const destination: WalkingCoordinate = [-83.92, 9.86];
  const badAccess = makeJourney({
    id: 'bad-access',
    routeId: 1,
    boardCoordinate: [-83.939, 9.879],
    alightCoordinate: [-83.92, 9.86],
    originWalkMeters: 100,
    destinationWalkMeters: 100,
    totalWalkMeters: 200,
    score: 20,
  });
  const saneAccess = makeJourney({
    id: 'sane-access',
    routeId: 2,
    boardCoordinate: [-83.937, 9.877],
    alightCoordinate: [-83.9202, 9.8601],
    originWalkMeters: 430,
    destinationWalkMeters: 100,
    totalWalkMeters: 530,
    score: 28,
  });

  const validated = await applyEndpointWalkingNetworkValidationToJourneys({
    journeys: [badAccess, saneAccess],
    origin,
    destination,
    getWalkingRoute: async ({ from, to }) => {
      if (to[0] === badAccess.legs[0]?.boardStop?.lng) {
        return walkingResult({ from, to, straightLineMeters: 360, networkDistanceMeters: 1_200 });
      }
      if (from[0] === badAccess.legs.at(-1)?.alightStop?.lng) {
        return walkingResult({ from, to, straightLineMeters: 100, networkDistanceMeters: 100 });
      }

      return walkingResult({ from, to, straightLineMeters: 430, networkDistanceMeters: 430 });
    },
  });

  assert.equal(validated[0]?.id, 'sane-access');
  const adjustedBadAccess = validated.find((journey) => journey.id === 'bad-access');
  assert.equal(adjustedBadAccess?.originWalkMeters, 1_200);
  assert.equal(adjustedBadAccess?.totalWalkMeters, 1_300);
  assert.ok(adjustedBadAccess?.score && adjustedBadAccess.score > saneAccess.score);
  assert.ok(adjustedBadAccess?.geoMetrics?.qualityFlags.includes('origin_walk_detour_high'));
});

test('applyEndpointWalkingNetworkValidationToJourneys does not inflate very close board stops from bad pedestrian routing', async () => {
  const origin: WalkingCoordinate = [-83.9389, 9.8782];
  const destination: WalkingCoordinate = [-83.92, 9.86];
  const casaPatos = makeJourney({
    id: 'casa-patos',
    boardCoordinate: [-83.939, 9.879],
    alightCoordinate: [-83.92, 9.86],
    originWalkMeters: 108,
    destinationWalkMeters: 0,
    totalWalkMeters: 108,
    score: 20,
  });

  const [validated] = await applyEndpointWalkingNetworkValidationToJourneys({
    journeys: [casaPatos],
    origin,
    destination,
    getWalkingRoute: async ({ from, to }) => {
      if (to[0] === casaPatos.legs[0]?.boardStop?.lng) {
        return walkingResult({ from, to, straightLineMeters: 108, networkDistanceMeters: 1_600 });
      }

      return walkingResult({ from, to, straightLineMeters: 0, networkDistanceMeters: 0 });
    },
  });

  assert.equal(validated?.originWalkMeters, 108);
  assert.equal(validated?.totalWalkMeters, 108);
  assert.equal(validated?.score, 20);
  assert.equal(validated?.geoMetrics?.qualityFlags.includes('origin_walk_detour_high'), false);
});

test('applyEndpointWalkingNetworkValidationToJourneys keeps final network walk evidence', async () => {
  const origin: WalkingCoordinate = [-83.9389, 9.8782];
  const destination: WalkingCoordinate = [-83.92, 9.86];
  const journey = makeJourney({
    id: 'final-detour',
    boardCoordinate: [-83.9388, 9.8783],
    alightCoordinate: [-83.921, 9.861],
    originWalkMeters: 100,
    destinationWalkMeters: 180,
    totalWalkMeters: 280,
    score: 20,
  });

  const [validated] = await applyEndpointWalkingNetworkValidationToJourneys({
    journeys: [journey],
    origin,
    destination,
    getWalkingRoute: async ({ from, to }) => {
      if (from[0] === journey.legs.at(-1)?.alightStop?.lng) {
        return walkingResult({ from, to, straightLineMeters: 180, networkDistanceMeters: 720 });
      }

      return walkingResult({ from, to, straightLineMeters: 100, networkDistanceMeters: 100 });
    },
  });

  assert.equal(validated?.destinationWalkMeters, 720);
  assert.equal(validated?.totalWalkMeters, 820);
  assert.equal(validated?.geoMetrics?.finalWalkNetworkMeters, 720);
  assert.equal(validated?.geoMetrics?.walkRouteAvailable, true);
});
