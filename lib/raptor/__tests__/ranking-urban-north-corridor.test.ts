import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlannedJourney } from '@/lib/journey-planner';

import { rankRaptorJourneys } from '../journey-ranking';

const GUADALUPE_DESTINATION: [number, number] = [-83.9244086, 9.8660225];
const LOS_MOLINOS_DESTINATION: [number, number] = [-83.93022614, 9.85522867];
const QUIRCOT_FERRETERIA_DESTINATION: [number, number] = [-83.93372344970703, 9.882739067077637];

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
          boardStopName: overrides.boardStopName ?? 'Origen',
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

test('Guadalupe destination prefers the Guadalupe corridor over adjacent San Blas branches', () => {
  const sanBlasAdjacent = makeJourney({
    id: 'san-blas-adjacent',
    routeName: 'El Alto - San Blas - Cartago - Parque Industrial',
    score: 24,
    destinationWalkMeters: 900,
  });
  const guadalupe = makeJourney({
    id: 'guadalupe',
    routeName: 'Cartago - Guadalupe por La Lima',
    score: 44,
    destinationWalkMeters: 90,
  });

  const ranking = rankRaptorJourneys({
    journeys: [sanBlasAdjacent, guadalupe],
    origin: [-83.919373, 9.864429],
    destination: GUADALUPE_DESTINATION,
    destinationName: 'Guadalupe',
  });
  const sanBlasDebug = ranking.debugById.get('san-blas-adjacent');
  const guadalupeDebug = ranking.debugById.get('guadalupe');

  assert.equal(ranking.ranked[0]?.id, 'guadalupe');
  assert.ok(sanBlasDebug);
  assert.ok(guadalupeDebug);
  assert.equal(
    sanBlasDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-guadalupe-adjacent-overbranch-penalty',
    ),
    true,
  );
  assert.equal(
    guadalupeDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-guadalupe-local-corridor-bonus',
    ),
    true,
  );
});

test('Los Molinos destination does not treat San Isidro El Molino as the Los Molinos corridor', () => {
  const sanIsidroElMolino = makeJourney({
    id: 'san-isidro-el-molino',
    routeName: 'Cartago-San Isidro - El Molino',
    score: 28,
    destinationWalkMeters: 300,
  });
  const losMolinos = makeJourney({
    id: 'los-molinos',
    routeName: 'Cartago - Residencial Los Molinos',
    score: 44,
    destinationWalkMeters: 70,
  });

  const ranking = rankRaptorJourneys({
    journeys: [sanIsidroElMolino, losMolinos],
    origin: [-83.919373, 9.864429],
    destination: LOS_MOLINOS_DESTINATION,
    destinationName: 'Residencial Los Molinos',
  });
  const sanIsidroDebug = ranking.debugById.get('san-isidro-el-molino');
  const losMolinosDebug = ranking.debugById.get('los-molinos');

  assert.equal(ranking.ranked[0]?.id, 'los-molinos');
  assert.ok(sanIsidroDebug);
  assert.ok(losMolinosDebug);
  assert.equal(
    sanIsidroDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-los-molinos-adjacent-overbranch-penalty',
    ),
    true,
  );
  assert.equal(
    sanIsidroDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-los-molinos-local-corridor-bonus',
    ),
    false,
  );
  assert.equal(
    losMolinosDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-los-molinos-local-corridor-bonus',
    ),
    true,
  );
});

test('Quircot edge destination does not apply the overlapping Pali Taras nonmatching penalty', () => {
  const tarasThenQuircotTransfer = makeJourney({
    id: 'taras-then-quircot-transfer',
    kind: 'transfer',
    routeName: 'Cartago - Taras - San Nicolas luego Cartago - El Carmen - Quircot - Cooperrosales',
    score: 61,
    originWalkMeters: 406,
    transferWalkMeters: 557,
    destinationWalkMeters: 33,
    totalWalkMeters: 996,
  });
  const quircotDirect = makeJourney({
    id: 'quircot-direct',
    routeName: 'Cartago - El Carmen - Quircot - Cooperrosales por San Rafael',
    score: 41,
    originWalkMeters: 406,
    destinationWalkMeters: 260,
    totalWalkMeters: 666,
  });

  const ranking = rankRaptorJourneys({
    journeys: [tarasThenQuircotTransfer, quircotDirect],
    origin: [-83.919373, 9.864429],
    destination: QUIRCOT_FERRETERIA_DESTINATION,
    destinationName: 'Quircot Ferreteria',
  });
  const quircotDebug = ranking.debugById.get('quircot-direct');

  assert.equal(ranking.preferredJourneyId, 'quircot-direct');
  assert.ok(quircotDebug);
  assert.equal(
    quircotDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-pali-taras-non-taras-route-penalty',
    ),
    false,
  );
});
