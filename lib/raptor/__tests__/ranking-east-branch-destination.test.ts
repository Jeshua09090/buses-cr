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

test('Penas Blancas destination prefers the matching branch over a Tucurrique far drop', () => {
  const tucurriqueFarDrop = makeJourney({
    id: 'tucurrique',
    routeName: 'CARTAGO - TUCURRIQUE - EL HUMO',
    score: 117.1,
    destinationWalkMeters: 1950,
    totalWalkMeters: 2168,
    dropStopName: 'FRENTE IGLESIA URASCA 2-1',
  });
  const penasBlancasBranch = makeJourney({
    id: 'penas-blancas',
    routeName: 'CARTAGO - PENAS BLANCAS',
    score: 136.7,
    destinationWalkMeters: 0,
    totalWalkMeters: 218,
    dropStopName: 'FRENTE IGLESIA DE PENAS BLANCAS',
  });

  const ranking = rankRaptorJourneys({
    journeys: [tucurriqueFarDrop, penasBlancasBranch],
    origin: [-83.919373, 9.864429],
    destination: [-83.78481747, 9.82705109],
    destinationName: 'Iglesia de Penas Blancas',
  });
  const tucurriqueDebug = ranking.debugById.get('tucurrique');
  const penasDebug = ranking.debugById.get('penas-blancas');

  assert.equal(ranking.ranked[0]?.id, 'penas-blancas');
  assert.ok(tucurriqueDebug);
  assert.ok(penasDebug);
  assert.equal(
    tucurriqueDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-east-branch-far-drop-when-exact-branch-available',
    ),
    true,
  );
  assert.equal(
    penasDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-east-branch-exact-destination-corridor-bonus',
    ),
    true,
  );
});

test('Santiago destination prefers the matching Santiago branch over adjacent branches', () => {
  const tucurriqueFarDrop = makeJourney({
    id: 'tucurrique',
    routeName: 'CARTAGO - PARAISO - BIRRISITO - CERVANTES - BAJO CERVANTES luego CARTAGO - TUCURRIQUE - EL HUMO',
    score: 116.4,
    destinationWalkMeters: 1455,
    totalWalkMeters: 1633,
    dropStopName: 'PARADA DE SAN JERONIMO 2-1',
  });
  const santiagoBranch = makeJourney({
    id: 'santiago',
    routeName: 'PARQUE INDUSTRIAL - CARTAGO - PARAISO - BIRRISITO - CERVANTES - SANTIAGO',
    score: 140.9,
    destinationWalkMeters: 0,
    totalWalkMeters: 190,
    dropStopName: 'COSTADO NORTE DE IGLESIA SANTIAGO',
  });

  const ranking = rankRaptorJourneys({
    journeys: [tucurriqueFarDrop, santiagoBranch],
    origin: [-83.919373, 9.864429],
    destination: [-83.798834, 9.869528],
    destinationName: 'Santiago de Paraiso',
  });

  assert.equal(ranking.ranked[0]?.id, 'santiago');
  assert.equal(
    ranking
      .debugById
      .get('tucurrique')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-east-branch-far-drop-when-exact-branch-available',
      ),
    true,
  );
});

test('La Alegria destination prefers the Palomo-La Alegria branch over a Rio Macho far drop', () => {
  const rioMachoFarDrop = makeJourney({
    id: 'rio-macho',
    routeName: 'PARQUE INDUSTRIAL - CARTAGO - OROSI - RIO MACHO',
    score: 89.6,
    destinationWalkMeters: 1548,
    totalWalkMeters: 1758,
    dropStopName: 'FRENTE MIRADOR OROSI',
  });
  const laAlegriaBranch = makeJourney({
    id: 'la-alegria',
    routeName: 'CARTAGO - OROSI - PALOMO - LA ALEGRIA',
    score: 138.1,
    destinationWalkMeters: 0,
    totalWalkMeters: 210,
    dropStopName: 'TERMINAL LA ALEGRIA',
  });

  const ranking = rankRaptorJourneys({
    journeys: [rioMachoFarDrop, laAlegriaBranch],
    origin: [-83.919373, 9.864429],
    destination: [-83.84751, 9.81181333],
    destinationName: 'Terminal La Alegria',
  });

  assert.equal(ranking.ranked[0]?.id, 'la-alegria');
  assert.equal(
    ranking
      .debugById
      .get('rio-macho')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-east-branch-far-drop-when-exact-branch-available',
      ),
    true,
  );
});

test('Cachi destination prefers the Cachi branch over Tucurrique far drops', () => {
  const tucurriqueFarDrop = makeJourney({
    id: 'tucurrique',
    routeName: 'CARTAGO - TUCURRIQUE - EL HUMO',
    score: 103.2,
    destinationWalkMeters: 1322,
    totalWalkMeters: 1540,
    dropStopName: 'ENTRADA 4 CALLES',
  });
  const cachiBranch = makeJourney({
    id: 'cachi',
    routeName: 'CARTAGO - CACHI',
    score: 110.2,
    destinationWalkMeters: 0,
    totalWalkMeters: 218,
    dropStopName: 'ENTRADA CACHI',
  });

  const ranking = rankRaptorJourneys({
    journeys: [tucurriqueFarDrop, cachiBranch],
    origin: [-83.919373, 9.864429],
    destination: [-83.80707509, 9.82731855],
    destinationName: 'Entrada Cachi',
  });

  assert.equal(ranking.ranked[0]?.id, 'cachi');
  assert.equal(
    ranking
      .debugById
      .get('tucurrique')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-east-branch-far-drop-when-exact-branch-available',
      ),
    true,
  );
});

test('east branch preference does not fire without a near exact-branch alternative', () => {
  const tucurriqueOnly = makeJourney({
    id: 'tucurrique',
    routeName: 'CARTAGO - TUCURRIQUE - EL HUMO',
    score: 117.1,
    destinationWalkMeters: 1950,
    totalWalkMeters: 2168,
  });

  const ranking = rankRaptorJourneys({
    journeys: [tucurriqueOnly],
    origin: [-83.919373, 9.864429],
    destination: [-83.78481747, 9.82705109],
    destinationName: 'Iglesia de Penas Blancas',
  });

  assert.equal(ranking.ranked[0]?.id, 'tucurrique');
  assert.equal(ranking.debugById.get('tucurrique')?.raptorPolishReasons.length, 0);
});
