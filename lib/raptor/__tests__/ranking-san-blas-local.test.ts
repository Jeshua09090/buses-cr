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

test('San Blas destination prefers the local San Blas corridor over far-drop urban hops', () => {
  const sanJoseFarDrop = makeJourney({
    id: 'san-jose-hop',
    routeName: 'SAN JOSE - SAN PEDRO - PISTA - LA LIMA - CARTAGO',
    boardStopName: 'ANTES DE UNA MUEBLERIA',
    dropStopName: 'AL COSTADO DE ESCUELA DE SORDOS',
    score: 23.2,
    destinationWalkMeters: 1414,
    totalWalkMeters: 1616,
  });
  const sanRafaelFarDrop = makeJourney({
    id: 'san-rafael-hop',
    routeName: 'CARTAGO - SAN RAFAEL DE OREAMUNO',
    boardStopName: 'FRENTE JERUSALEN',
    dropStopName: 'FRENTE VETERINARIA MARIELA MONGE',
    score: 24.8,
    destinationWalkMeters: 1321,
    totalWalkMeters: 1481,
  });
  const sanBlasReturnOverbranch = makeJourney({
    id: 'san-blas-return-overbranch',
    routeName: 'EL ALTO - SAN BLAS - CARTAGO - PARQUE INDUSTRIAL',
    boardStopName: 'DIAGONAL A MACDONALD',
    dropStopName: 'EN LA ENTRADA DE MINISUPER MARTINEZ',
    score: 24.2,
    destinationWalkMeters: 176,
    totalWalkMeters: 500,
  });
  const sanBlasNearDrop = makeJourney({
    id: 'san-blas-local',
    routeName: 'CARTAGO - SAN BLAS',
    boardStopName: 'San Blas',
    dropStopName: 'A UN COSTADO DE LA IGLESIA DE SAN BLAS',
    score: 26.6,
    destinationWalkMeters: 106,
    totalWalkMeters: 607,
  });

  const ranking = rankRaptorJourneys({
    journeys: [sanJoseFarDrop, sanRafaelFarDrop, sanBlasReturnOverbranch, sanBlasNearDrop],
    origin: [-83.919373, 9.864429],
    destination: [-83.9106802132904, 9.87732094323902],
    destinationName: 'San Blas',
  });
  const sanJoseDebug = ranking.debugById.get('san-jose-hop');
  const sanBlasOverbranchDebug = ranking.debugById.get('san-blas-return-overbranch');
  const sanBlasDebug = ranking.debugById.get('san-blas-local');

  assert.equal(ranking.ranked[0]?.id, 'san-blas-local');
  assert.ok(sanJoseDebug);
  assert.ok(sanBlasDebug);
  assert.equal(
    sanJoseDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-san-blas-far-drop-when-local-available',
    ),
    true,
  );
  assert.equal(
    ranking.debugById.get('san-rafael-hop')?.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-san-blas-return-overbranch-penalty',
    ),
    true,
  );
  assert.equal(
    sanBlasDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-san-blas-local-corridor-bonus',
    ),
    true,
  );
  assert.equal(
    sanBlasOverbranchDebug?.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-san-blas-return-overbranch-penalty',
    ),
    true,
  );
});

test('San Blas local preference does not apply outside the San Blas destination box', () => {
  const sanJoseFarDrop = makeJourney({
    id: 'san-jose-hop',
    routeName: 'SAN JOSE - SAN PEDRO - PISTA - LA LIMA - CARTAGO',
    score: 23.2,
    destinationWalkMeters: 700,
    totalWalkMeters: 950,
  });
  const sanBlasNearDrop = makeJourney({
    id: 'san-blas-local',
    routeName: 'CARTAGO - SAN BLAS',
    score: 26.6,
    destinationWalkMeters: 106,
    totalWalkMeters: 607,
  });

  const ranking = rankRaptorJourneys({
    journeys: [sanJoseFarDrop, sanBlasNearDrop],
    origin: [-83.919373, 9.864429],
    destination: [-83.919373, 9.864429],
    destinationName: 'Cartago centro',
  });

  assert.equal(ranking.ranked[0]?.id, 'san-jose-hop');
  assert.equal(ranking.debugById.get('san-jose-hop')?.raptorPolishReasons.length, 0);
});
