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

test('La Alegria origin prefers the Palomo-Orosi return branch over Loaiza/Tucurrique', () => {
  const loaizaTucurrique = makeJourney({
    id: 'loaiza-tucurrique',
    routeName: 'LOAIZA - CARTAGO luego EL HUMO - TUCURRIQUE - CARTAGO',
    score: 136.4,
    originWalkMeters: 17,
    destinationWalkMeters: 136,
    totalWalkMeters: 153,
    boardStopName: 'TERMINAL TELARICA',
  });
  const alegriaPalomo = makeJourney({
    id: 'alegria-palomo',
    routeName: 'LA ALEGRIA - PALOMO - OROSI - CARTAGO luego SANTIAGO - CERVANTES - BIRRISITO - PARAISO - CARTAGO - PARQUE INDUSTRIAL',
    score: 154.7,
    originWalkMeters: 825,
    destinationWalkMeters: 136,
    totalWalkMeters: 961,
    boardStopName: 'DESPUÉS DE RESTAURANTE TARDICIONES DON JOSÉ',
  });

  const ranking = rankRaptorJourneys({
    journeys: [loaizaTucurrique, alegriaPalomo],
    origin: [-83.84751, 9.81181333],
    destination: [-83.919373, 9.864429],
    destinationName: 'Cartago centro',
  });

  assert.equal(ranking.ranked[0]?.id, 'alegria-palomo');
  assert.equal(
    ranking
      .debugById
      .get('loaiza-tucurrique')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-east-branch-origin-wrong-branch-when-local-return-available',
      ),
    true,
  );
});

test('La Campina origin prefers the Guayabal return branch over Santa Elena', () => {
  const santaElena = makeJourney({
    id: 'santa-elena',
    routeName: 'SANTA ELENA ABAJO - CARTAGO',
    score: 44,
    originWalkMeters: 166,
    destinationWalkMeters: 476,
    totalWalkMeters: 642,
    boardStopName: 'FRENTE AL PARQUECITO LA CAMPINA 2-1',
  });
  const laCampina = makeJourney({
    id: 'la-campina',
    routeName: 'CARTAGO-GUAYABAL-LA CAMPINA POR ASUNCION',
    score: 52,
    originWalkMeters: 20,
    destinationWalkMeters: 144,
    totalWalkMeters: 164,
    boardStopName: 'FRENTE AL PARQUECITO LA CAMPINA 2-1',
  });

  const ranking = rankRaptorJourneys({
    journeys: [santaElena, laCampina],
    origin: [-83.9364834537593, 9.83770228559147],
    destination: [-83.919373, 9.864429],
    destinationName: 'Cartago centro',
  });

  assert.equal(ranking.ranked[0]?.id, 'la-campina');
  assert.equal(
    ranking
      .debugById
      .get('santa-elena')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-east-branch-origin-wrong-branch-when-local-return-available',
      ),
    true,
  );
  assert.equal(
    ranking
      .debugById
      .get('la-campina')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-east-branch-origin-local-return-bonus',
      ),
    true,
  );
});

test('Pedregal origin prefers a nearby El Carmen/Quircot return over distant neighboring boards', () => {
  const elCovaoLourdes = makeJourney({
    id: 'el-covao-lourdes',
    routeName: 'EL COVAO - LOURDES',
    score: 26.3,
    originWalkMeters: 807,
    destinationWalkMeters: 384,
    totalWalkMeters: 1191,
    boardStopName: 'ANTES DE GIMNASIO CROSSFIT',
    dropStopName: 'Tres Rios - Cartago',
  });
  const elCarmenQuircot = makeJourney({
    id: 'el-carmen-quircot',
    routeName: 'CARTAGO - EL CARMEN - QUIRCOT - COOPERROSALES POR SAN RAFAEL',
    score: 32.2,
    originWalkMeters: 106,
    destinationWalkMeters: 384,
    totalWalkMeters: 490,
    boardStopName: 'DIAGONAL A SODA SEGURA',
    dropStopName: 'Tres Rios - Cartago',
  });

  const ranking = rankRaptorJourneys({
    journeys: [elCovaoLourdes, elCarmenQuircot],
    origin: [-83.9270248413086, 9.877954483032227],
    destination: [-83.919373, 9.864429],
    destinationName: 'Cartago centro',
  });

  assert.equal(ranking.ranked[0]?.id, 'el-carmen-quircot');
  assert.equal(
    ranking
      .debugById
      .get('el-covao-lourdes')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-east-branch-origin-wrong-branch-when-local-return-available',
      ),
    true,
  );
});

test('east branch origin preference does not fire outside La Alegria', () => {
  const loaizaTucurrique = makeJourney({
    id: 'loaiza-tucurrique',
    routeName: 'LOAIZA - CARTAGO luego EL HUMO - TUCURRIQUE - CARTAGO',
    score: 136.4,
  });
  const alegriaPalomo = makeJourney({
    id: 'alegria-palomo',
    routeName: 'LA ALEGRIA - PALOMO - OROSI - CARTAGO',
    score: 154.7,
  });

  const ranking = rankRaptorJourneys({
    journeys: [loaizaTucurrique, alegriaPalomo],
    origin: [-83.80707509, 9.82731855],
    destination: [-83.919373, 9.864429],
    destinationName: 'Cartago centro',
  });

  assert.equal(ranking.ranked[0]?.id, 'loaiza-tucurrique');
  assert.equal(ranking.debugById.get('loaiza-tucurrique')?.raptorPolishReasons.length, 0);
});
