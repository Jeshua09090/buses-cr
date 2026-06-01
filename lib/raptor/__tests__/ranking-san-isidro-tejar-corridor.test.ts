import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlannedJourney } from '@/lib/journey-planner';

import { rankRaptorJourneys } from '../journey-ranking';

const PLAZA_SAN_ISIDRO_DESTINATION: [number, number] = [-83.9525036531641, 9.82938521411127];

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

test('San Isidro destination prefers the San Isidro corridor over adjacent overbranches', () => {
  const adjacentOverbranch = makeJourney({
    id: 'san-rafael-parque-industrial',
    routeName: 'San Rafael De Oreamuno - Parque Industrial luego El Alto - San Blas - Cartago - Parque Industrial',
    score: 40,
    destinationWalkMeters: 180,
    dropStopName: 'PARADA ENTRADA RESIDENCIAL LAS CATALINAS 1-2',
  });
  const sanIsidro = makeJourney({
    id: 'san-isidro',
    routeName: 'Cartago - Taras - San Nicolas luego Cartago-Asuncion-Pitahaya-San Isidro',
    score: 68,
    destinationWalkMeters: 10,
    dropStopName: 'PARADA DE LA PLAZA DE SAN ISIDRO 1-2',
  });

  const ranking = rankRaptorJourneys({
    journeys: [adjacentOverbranch, sanIsidro],
    origin: [-83.9389683, 9.87829],
    destination: PLAZA_SAN_ISIDRO_DESTINATION,
    destinationName: 'Plaza San Isidro',
  });
  const adjacentDebug = ranking.debugById.get('san-rafael-parque-industrial');
  const sanIsidroDebug = ranking.debugById.get('san-isidro');

  assert.equal(ranking.ranked[0]?.id, 'san-isidro');
  assert.ok(adjacentDebug);
  assert.ok(sanIsidroDebug);
  assert.equal(
    adjacentDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-san-isidro-tejar-adjacent-overbranch-penalty',
    ),
    true,
  );
  assert.equal(
    sanIsidroDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-san-isidro-tejar-corridor-bonus',
    ),
    true,
  );
});

test('San Isidro core preference does not apply to the Tejar east destination box', () => {
  const adjacentOverbranch = makeJourney({
    id: 'san-rafael-parque-industrial',
    routeName: 'San Rafael De Oreamuno - Parque Industrial',
    score: 40,
    destinationWalkMeters: 180,
  });
  const sanIsidro = makeJourney({
    id: 'san-isidro',
    routeName: 'Cartago-Asuncion-Pitahaya-San Isidro',
    score: 68,
    destinationWalkMeters: 10,
  });

  const ranking = rankRaptorJourneys({
    journeys: [adjacentOverbranch, sanIsidro],
    origin: [-83.9389683, 9.87829],
    destination: [-83.9385643, 9.8439289],
    destinationName: 'Restaurante Las Vegas',
  });

  assert.equal(
    ranking.debugById
      .get('san-rafael-parque-industrial')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-san-isidro-tejar-adjacent-overbranch-penalty',
      ),
    false,
  );
  assert.equal(
    ranking.debugById
      .get('san-rafael-parque-industrial')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-tejar-east-overbranch-penalty',
      ),
    true,
  );
});

test('San Isidro destination treats San Blas as an adjacent branch without San Blas bonus', () => {
  const sanBlasAdjacent = makeJourney({
    id: 'san-blas-adjacent',
    routeName: 'El Alto - San Blas - Cartago - Parque Industrial',
    score: 30,
    destinationWalkMeters: 900,
  });
  const sanIsidro = makeJourney({
    id: 'san-isidro',
    routeName: 'Cartago-Asuncion-Pitahaya-San Isidro',
    score: 50,
    destinationWalkMeters: 10,
  });

  const ranking = rankRaptorJourneys({
    journeys: [sanBlasAdjacent, sanIsidro],
    origin: [-83.9389683, 9.87829],
    destination: PLAZA_SAN_ISIDRO_DESTINATION,
    destinationName: 'Plaza San Isidro',
  });
  const sanBlasDebug = ranking.debugById.get('san-blas-adjacent');

  assert.equal(ranking.ranked[0]?.id, 'san-isidro');
  assert.ok(sanBlasDebug);
  assert.equal(
    sanBlasDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-san-isidro-tejar-adjacent-overbranch-penalty',
    ),
    true,
  );
  assert.equal(
    sanBlasDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-san-blas-local-corridor-bonus',
    ),
    false,
  );
});
