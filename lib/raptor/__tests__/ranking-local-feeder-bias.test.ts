import assert from 'node:assert/strict';
import test from 'node:test';

import type { JourneyLeg, PlannedJourney } from '@/lib/journey-planner';

import { rankRaptorJourneys } from '../journey-ranking';

function makeLeg(routeName: string): JourneyLeg {
  return {
    routeId: Math.abs(routeName.length),
    routeName,
    routeCode: null,
    operator: 'RAPTOR local',
    boardStopName: 'Origen',
    alightStopName: 'Destino',
  };
}

function makeJourney(overrides: Partial<PlannedJourney> = {}): PlannedJourney {
  const routeName = overrides.routeName ?? 'Cartago Test';

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
          alightStopName: 'Destino',
        },
      ],
    originWalkMeters: overrides.originWalkMeters ?? 0,
    destinationWalkMeters: overrides.destinationWalkMeters ?? 0,
    transferWalkMeters: overrides.transferWalkMeters ?? 0,
    totalWalkMeters: overrides.totalWalkMeters ?? 0,
    totalFare: overrides.totalFare ?? null,
    score: overrides.score ?? 10,
    boardStopName: overrides.boardStopName ?? 'Origen',
    dropStopName: overrides.dropStopName ?? 'Destino',
    transferLabel: overrides.transferLabel ?? null,
    geoMetrics: overrides.geoMetrics ?? null,
  };
}

test('local Cartago feeder outranks national feeder when serving the same east corridor', () => {
  const nationalFeeder = makeJourney({
    id: 'national-feeder',
    kind: 'transfer',
    routeName: 'San Jose - San Pedro - Tres Rios - La Lima - Cartago luego Cartago - Cachi',
    legs: [
      makeLeg('San Jose - San Pedro - Tres Rios - La Lima - Cartago'),
      makeLeg('Cartago - Cachi'),
    ],
    score: 70,
  });
  const localFeeder = makeJourney({
    id: 'local-feeder',
    kind: 'transfer',
    routeName: 'Cartago - Taras - San Nicolas luego Cartago - Cachi',
    legs: [makeLeg('Cartago - Taras - San Nicolas'), makeLeg('Cartago - Cachi')],
    score: 95,
  });

  const ranking = rankRaptorJourneys({
    journeys: [nationalFeeder, localFeeder],
    origin: [-83.9389683, 9.87829],
    destination: [-83.80707509, 9.82731855],
    destinationName: 'Entrada Cachi',
  });
  const nationalDebug = ranking.debugById.get('national-feeder');

  assert.equal(ranking.ranked[0]?.id, 'local-feeder');
  assert.ok(nationalDebug);
  assert.equal(
    nationalDebug.raptorPolishReasons.some(
      (reason) =>
        reason.id === 'raptor-national-feeder-when-local-available' && reason.penalty === 60,
    ),
    true,
  );
});

test('local feeder bias does not fire when no local feeder alternative is present', () => {
  const nationalFeeder = makeJourney({
    id: 'national-feeder',
    kind: 'transfer',
    routeName: 'San Jose - San Pedro - Tres Rios - La Lima - Cartago luego Cartago - Cachi',
    legs: [
      makeLeg('San Jose - San Pedro - Tres Rios - La Lima - Cartago'),
      makeLeg('Cartago - Cachi'),
    ],
    score: 70,
  });

  const ranking = rankRaptorJourneys({
    journeys: [nationalFeeder],
    origin: [-83.9389683, 9.87829],
    destination: [-83.80707509, 9.82731855],
    destinationName: 'Entrada Cachi',
  });
  const nationalDebug = ranking.debugById.get('national-feeder');

  assert.ok(nationalDebug);
  assert.equal(
    nationalDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-national-feeder-when-local-available',
    ),
    false,
  );
});
