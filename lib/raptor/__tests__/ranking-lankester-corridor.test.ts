import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlannedJourney } from '@/lib/journey-planner';

import { rankRaptorJourneys } from '../journey-ranking';

function makeGeoMetrics(
  overrides: Partial<NonNullable<PlannedJourney['geoMetrics']>> = {},
): NonNullable<PlannedJourney['geoMetrics']> {
  return {
    baseScore: null,
    scoreAdjustment: null,
    confidenceScore: null,
    qualityFlags: [],
    straightLineMeters: null,
    originWalkMeters: null,
    transferWalkMeters: null,
    finalWalkMeters: null,
    totalWalkMeters: null,
    firstLegDestinationDistanceMeters: null,
    finalStopDestinationDistanceMeters: null,
    firstLegProgressMeters: null,
    firstLegProgressRatio: null,
    finalStopProgressMeters: null,
    finalStopProgressRatio: null,
    firstLegBacktrackMeters: null,
    finalStopBacktrackMeters: null,
    transferGainMeters: null,
    transferGainRatio: null,
    totalWalkRatio: null,
    transferWalkRatio: null,
    boardShapeDistanceMeters: null,
    firstAlightShapeDistanceMeters: null,
    secondBoardShapeDistanceMeters: null,
    finalAlightShapeDistanceMeters: null,
    maxShapeStopDistanceMeters: null,
    routeDestinationAlignment: null,
    transferQualityLabel: null,
    transferQualityScore: null,
    finalWalkStraightMeters: null,
    finalWalkNetworkMeters: null,
    finalWalkNetworkMinutes: null,
    walkDetourRatio: null,
    walkRouteAvailable: null,
    walkNetworkPenalty: null,
    walkNetworkStatus: null,
    finalWalkBacktrackDot: null,
    finalWalkBacktrackPenalty: null,
    finalWalkStartsAgainstBus: null,
    finalWalkRouteCoordinates: null,
    ...overrides,
  };
}

function makeJourney(overrides: Partial<PlannedJourney> = {}): PlannedJourney {
  const routeName = overrides.routeName ?? 'Cartago Test';
  const alightStopName = overrides.dropStopName ?? 'Destino';

  return {
    id: overrides.id ?? 'journey-a',
    kind: overrides.kind ?? 'direct',
    routeId: overrides.routeId ?? 1,
    routeName,
    routeCode: overrides.routeCode ?? null,
    operatorLabel: overrides.operatorLabel ?? 'RAPTOR local',
    routeIds: overrides.routeIds ?? [overrides.routeId ?? 1],
    routeCodes: overrides.routeCodes ?? [],
    legs:
      overrides.legs ??
      [
        {
          routeId: overrides.routeId ?? 1,
          routeName,
          routeCode: null,
          operator: 'RAPTOR local',
          boardStopName: 'Origen',
          alightStopName,
        },
      ],
    originWalkMeters: overrides.originWalkMeters ?? 0,
    destinationWalkMeters: overrides.destinationWalkMeters ?? 0,
    transferWalkMeters: overrides.transferWalkMeters ?? 0,
    totalWalkMeters: overrides.totalWalkMeters ?? 0,
    totalFare: overrides.totalFare ?? null,
    score: overrides.score ?? 10,
    boardStopName: overrides.boardStopName ?? 'Origen',
    dropStopName: overrides.dropStopName ?? alightStopName,
    transferLabel: overrides.transferLabel ?? null,
    geoMetrics: overrides.geoMetrics ?? null,
  };
}

test('Lankester keeps the Los Helechos near-stop corridor above Paraíso despite entrance detour', () => {
  const paraisoFallback = makeJourney({
    id: 'paraiso',
    routeName: 'Cartago-Ice luego Parque Industrial De Cartago - Paraiso',
    dropStopName: 'CONTIGUO PLYCEM',
    score: 400.7,
    destinationWalkMeters: 1200,
    totalWalkMeters: 1900,
    geoMetrics: makeGeoMetrics({
      scoreAdjustment: 370.7,
      confidenceScore: 0.9,
      qualityFlags: [],
      finalWalkMeters: 1200,
      totalWalkMeters: 1900,
      finalWalkStraightMeters: 641,
      finalWalkNetworkMeters: 1200,
      finalWalkNetworkMinutes: 14,
      walkDetourRatio: 1.87,
      walkRouteAvailable: true,
      walkNetworkPenalty: 370.7,
      walkNetworkStatus: 'ok',
      finalWalkBacktrackDot: null,
      finalWalkBacktrackPenalty: 0,
      finalWalkStartsAgainstBus: false,
      finalWalkRouteCoordinates: null,
    }),
  });
  const losHelechosNearStop = makeJourney({
    id: 'los-helechos',
    routeName: 'Cartago - Laguna De Dona Ana - Obreros Y Campesinos - Los Helechos',
    dropStopName: 'MOTEL ORQUÍDEAS',
    score: 1326.6,
    destinationWalkMeters: 931,
    totalWalkMeters: 1700,
    geoMetrics: makeGeoMetrics({
      scoreAdjustment: 1296.6,
      confidenceScore: 0.9,
      qualityFlags: ['walk_network_detour_high'],
      finalWalkMeters: 931,
      totalWalkMeters: 1700,
      finalWalkStraightMeters: 208,
      finalWalkNetworkMeters: 931,
      finalWalkNetworkMinutes: 11,
      walkDetourRatio: 4.48,
      walkRouteAvailable: true,
      walkNetworkPenalty: 1296.6,
      walkNetworkStatus: 'ok',
      finalWalkBacktrackDot: null,
      finalWalkBacktrackPenalty: 0,
      finalWalkStartsAgainstBus: false,
      finalWalkRouteCoordinates: null,
    }),
  });

  const ranking = rankRaptorJourneys({
    journeys: [paraisoFallback, losHelechosNearStop],
    origin: [-83.923164, 9.862138],
    destination: [-83.8902015, 9.8394544],
    destinationName: 'Jardin Botanico Lankester',
  });
  const losHelechosDebug = ranking.debugById.get('los-helechos');

  assert.equal(ranking.ranked[0]?.id, 'los-helechos');
  assert.ok(losHelechosDebug);
  assert.equal(
    losHelechosDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-lankester-near-stop-detour-normalization',
    ),
    true,
  );
});
