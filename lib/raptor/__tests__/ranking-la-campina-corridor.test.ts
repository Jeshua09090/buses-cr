import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlannedJourney } from '@/lib/journey-planner';

import { rankRaptorJourneys } from '../journey-ranking';

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

test('La Campina corridor bonus surfaces the seeded Guayabal corridor', () => {
  const sanIsidroFallback = makeJourney({
    id: 'san-isidro',
    routeName: 'Paraiso - Parque Industrial De Cartago luego Cartago-San Isidro - El Molino',
    totalWalkMeters: 1200,
    score: 60,
  });
  const laCampinaCorridor = makeJourney({
    id: 'la-campina',
    routeName: 'Cartago-Guayabal-La Campina Por Asuncion',
    totalWalkMeters: 700,
    score: 75,
  });

  const ranking = rankRaptorJourneys({
    journeys: [sanIsidroFallback, laCampinaCorridor],
    origin: [-83.919373, 9.864429],
    destination: [-83.9364834537593, 9.83770228559147],
    destinationName: 'Parquecito La Campina',
  });
  const laCampinaDebug = ranking.debugById.get('la-campina');
  const sanIsidroDebug = ranking.debugById.get('san-isidro');

  assert.equal(ranking.ranked[0]?.id, 'la-campina');
  assert.ok(laCampinaDebug);
  assert.ok(sanIsidroDebug);
  assert.equal(
    laCampinaDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-la-campina-corridor-bonus',
    ),
    true,
  );
  assert.equal(
    sanIsidroDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-la-campina-fallback-long-walk',
    ),
    true,
  );
});

test('La Campina corridor reasons do not fire outside the destination box', () => {
  const sanIsidroFallback = makeJourney({
    id: 'san-isidro',
    routeName: 'Paraiso - Parque Industrial De Cartago luego Cartago-San Isidro - El Molino',
    totalWalkMeters: 1200,
    score: 60,
  });
  const laCampinaCorridor = makeJourney({
    id: 'la-campina',
    routeName: 'Cartago-Guayabal-La Campina Por Asuncion',
    totalWalkMeters: 700,
    score: 75,
  });

  const ranking = rankRaptorJourneys({
    journeys: [sanIsidroFallback, laCampinaCorridor],
    origin: [-83.919373, 9.864429],
    destination: [-83.919373, 9.864429],
    destinationName: 'Cartago centro',
  });
  const allRaptorReasons = [...ranking.debugById.values()].flatMap(
    (debug) => debug.raptorPolishReasons,
  );

  assert.equal(
    allRaptorReasons.some((reason) =>
      [
        'raptor-la-campina-corridor-bonus',
        'raptor-la-campina-fallback-long-walk',
      ].includes(reason.id),
    ),
    false,
  );
});
