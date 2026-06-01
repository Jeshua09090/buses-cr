import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlannedJourney } from '@/lib/journey-planner';

import { rankRaptorJourneys } from '../journey-ranking';

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

test('Rio Loro demotes Turrialba express when the Moovit corridor alternative is present', () => {
  const turrialbaExpress = makeJourney({
    id: 'turrialba-express',
    routeName: 'Turrialba - San Jose Expreso',
    score: 454.7,
    destinationWalkMeters: 1800,
    totalWalkMeters: 2600,
    dropStopName: 'PARADA FRENTE A RECOPE',
  });
  const moovitCorridor = makeJourney({
    id: 'moovit-corridor',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    score: 455.7,
    destinationWalkMeters: 1800,
    totalWalkMeters: 2600,
    dropStopName: 'PARADA FRENTE A RECOPE',
  });

  const ranking = rankRaptorJourneys({
    journeys: [turrialbaExpress, moovitCorridor],
    origin: [-83.9389683, 9.87829],
    destination: [-83.9425011, 9.9075246],
    destinationName: 'Parque Ambiental Rio Loro',
  });
  const turrialbaDebug = ranking.debugById.get('turrialba-express');

  assert.equal(ranking.ranked[0]?.id, 'moovit-corridor');
  assert.ok(turrialbaDebug);
  assert.equal(
    turrialbaDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-rio-loro-turrialba-express-local-hop',
    ),
    true,
  );
});
