import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlannedJourney } from '@/lib/journey-planner';

import { rankRaptorJourneys } from '../journey-ranking';

const INA_LLANOS_DESTINATION: [number, number] = [-83.8829415, 9.8421571];
const LLANOS_MAPBOX_POI_DESTINATION: [number, number] = [-83.8784335, 9.83865394];

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

test('INA Llanos demotes Orosi/Rio Macho when a closer corridor alternative exists', () => {
  const orosi = makeJourney({
    id: 'orosi',
    routeName: 'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Orosi - Rio Macho',
    score: 60.9,
    destinationWalkMeters: 122,
    totalWalkMeters: 230,
    dropStopName: 'ENTRADA LLANOS DE SANTA LUCIA 1-2',
  });
  const turrialba = makeJourney({
    id: 'turrialba',
    routeName: 'Cartago - Taras - San Nicolas luego San Jose - Turrialba Expreso',
    score: 67.6,
    destinationWalkMeters: 152,
    totalWalkMeters: 724,
    dropStopName: 'CONTIGUO PALI DE LLANOS DE SANTA LUCIA',
  });

  const ranking = rankRaptorJourneys({
    journeys: [orosi, turrialba],
    origin: [-83.9389683, 9.87829],
    destination: INA_LLANOS_DESTINATION,
    destinationName: 'INA Paraiso Llanos de Santa Lucia',
  });
  const orosiDebug = ranking.debugById.get('orosi');

  assert.equal(ranking.ranked[0]?.id, 'turrialba');
  assert.ok(orosiDebug);
  assert.equal(
    orosiDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-llanos-santa-lucia-overbranch-penalty',
    ),
    true,
  );
});

test('Llanos POI demotes Orosi/Rio Macho when a compatible branch is within the barrio', () => {
  const orosi = makeJourney({
    id: 'orosi',
    routeName: 'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Orosi - Rio Macho',
    score: 68.3,
    destinationWalkMeters: 335,
    totalWalkMeters: 442,
    dropStopName: 'CERAMICA EL ANGEL',
  });
  const turrialba = makeJourney({
    id: 'turrialba',
    routeName: 'Cartago - Taras - San Nicolas luego San Jose - Turrialba Colectivo',
    score: 76.5,
    destinationWalkMeters: 335,
    totalWalkMeters: 907,
    dropStopName: 'CERAMICA EL ANGEL',
  });

  const ranking = rankRaptorJourneys({
    journeys: [orosi, turrialba],
    origin: [-83.9389683, 9.87829],
    destination: LLANOS_MAPBOX_POI_DESTINATION,
    destinationName: 'El Pollote Llanos de Santa Lucia',
  });
  const orosiDebug = ranking.debugById.get('orosi');

  assert.equal(ranking.ranked[0]?.id, 'turrialba');
  assert.ok(orosiDebug);
  assert.equal(
    orosiDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-llanos-santa-lucia-overbranch-penalty',
    ),
    true,
  );
});

test('Llanos POI prefers the closer boarding stop for equivalent compatible branches', () => {
  const farBoard = makeJourney({
    id: 'far-board',
    routeName: 'Cartago - Taras - San Nicolas luego San Jose - Turrialba Colectivo',
    score: 76.5,
    originWalkMeters: 457,
    transferWalkMeters: 115,
    destinationWalkMeters: 335,
    totalWalkMeters: 907,
    boardStopName: 'Parada sin nombre',
    dropStopName: 'CERAMICA EL ANGEL',
  });
  const nearBoard = makeJourney({
    id: 'near-board',
    routeName: 'Cartago - Taras - San Nicolas luego San Jose - Turrialba Colectivo',
    score: 76.6,
    originWalkMeters: 328,
    transferWalkMeters: 115,
    destinationWalkMeters: 335,
    totalWalkMeters: 778,
    boardStopName: 'FRENTE A CASA FELLO MEZA',
    dropStopName: 'CERAMICA EL ANGEL',
  });

  const ranking = rankRaptorJourneys({
    journeys: [farBoard, nearBoard],
    origin: [-83.9389683, 9.87829],
    destination: LLANOS_MAPBOX_POI_DESTINATION,
    destinationName: 'El Pollote Llanos de Santa Lucia',
  });
  const farBoardDebug = ranking.debugById.get('far-board');

  assert.equal(ranking.ranked[0]?.id, 'near-board');
  assert.ok(farBoardDebug);
  assert.equal(
    farBoardDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-llanos-santa-lucia-farther-board-penalty',
    ),
    true,
  );
});

test('Llanos POI prefers a local Paraiso branch over Turrialba when both drop nearby', () => {
  const turrialba = makeJourney({
    id: 'turrialba',
    routeName: 'Cartago - Taras - San Nicolas luego San Jose - Turrialba Colectivo',
    score: 68,
    originWalkMeters: 108,
    transferWalkMeters: 115,
    destinationWalkMeters: 106,
    totalWalkMeters: 330,
    boardStopName: 'DIAGONAL A LA CASA DE LOS PATOS',
    dropStopName: 'CERAMICA EL ANGEL',
  });
  const paraiso = makeJourney({
    id: 'paraiso',
    routeName:
      'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Paraiso - Birrisito - Cervantes - Santiago',
    score: 79.4,
    originWalkMeters: 348,
    transferWalkMeters: 115,
    destinationWalkMeters: 106,
    totalWalkMeters: 570,
    boardStopName: 'FRENTE A BAR LINDA VISTA',
    dropStopName: 'CERAMICA EL ANGEL',
  });

  const ranking = rankRaptorJourneys({
    journeys: [turrialba, paraiso],
    origin: [-83.9389683, 9.87829],
    destination: [-83.8785308, 9.8414655],
    destinationName: 'Llanos de Santa Lucia',
  });
  const turrialbaDebug = ranking.debugById.get('turrialba');

  assert.equal(ranking.ranked[0]?.id, 'paraiso');
  assert.ok(turrialbaDebug);
  assert.equal(
    turrialbaDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-llanos-santa-lucia-interurban-fallback-penalty',
    ),
    true,
  );
});

test('Pali Llanos keeps Paraiso local above Cachi when exact Llanos is not surfaced', () => {
  const cachi = makeJourney({
    id: 'cachi',
    kind: 'transfer',
    routeName: 'Cartago - Taras - San Nicolas luego Cartago - Cachi',
    score: 72.3,
    originWalkMeters: 108,
    transferWalkMeters: 523,
    destinationWalkMeters: 0,
    totalWalkMeters: 631,
    boardStopName: 'DIAGONAL A LA CASA DE LOS PATOS',
    dropStopName: 'CONTIGUO PALI DE LLANOS DE SANTA LUCIA',
    legs: [
      {
        routeId: 4719,
        routeName: 'CARTAGO - TARAS - SAN NICOLAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'DIAGONAL A LA CASA DE LOS PATOS',
        alightStopName: 'Parada Plaza Iglesias',
      },
      {
        routeId: 4364,
        routeName: 'CARTAGO - CACHI',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Cartago - Dulce Nombre',
        alightStopName: 'CONTIGUO PALI DE LLANOS DE SANTA LUCIA',
      },
    ],
  });
  const paraiso = makeJourney({
    id: 'paraiso',
    kind: 'transfer',
    routeName:
      'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Paraiso - Birrisito - Cervantes - Santiago',
    score: 73.9,
    originWalkMeters: 108,
    transferWalkMeters: 115,
    destinationWalkMeters: 0,
    totalWalkMeters: 224,
    boardStopName: 'DIAGONAL A LA CASA DE LOS PATOS',
    dropStopName: 'CONTIGUO PALI DE LLANOS DE SANTA LUCIA',
    legs: [
      {
        routeId: 4719,
        routeName: 'CARTAGO - TARAS - SAN NICOLAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'DIAGONAL A LA CASA DE LOS PATOS',
        alightStopName: 'Parada Cementerio General Tres Rios-Cartago',
      },
      {
        routeId: 4386,
        routeName: 'PARQUE INDUSTRIAL - CARTAGO - PARAISO - BIRRISITO - CERVANTES - SANTIAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'A un costado del Cementerio',
        alightStopName: 'CONTIGUO PALI DE LLANOS DE SANTA LUCIA',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [cachi, paraiso],
    origin: [-83.9389683, 9.87829],
    destination: [-83.88357049, 9.8433782],
    destinationName: 'Pali Llanos de Santa Lucia',
  });

  assert.equal(ranking.preferredJourneyId, 'paraiso');
  assert.equal(
    ranking.debugById
      .get('paraiso')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-taras-east-cementerio-transfer-secondary',
      ),
    false,
  );
});

test('INA Llanos gives a small bonus to the exact Llanos branch', () => {
  const bajoCervantes = makeJourney({
    id: 'bajo-cervantes',
    routeName: 'Cartago - Paraiso - Birrisito - Cervantes - Bajo Cervantes',
    score: 33.2,
    destinationWalkMeters: 152,
  });
  const llanos = makeJourney({
    id: 'llanos',
    routeName: 'Cartago - Llanos De Santa Lucia',
    score: 41.6,
    destinationWalkMeters: 192,
  });

  const ranking = rankRaptorJourneys({
    journeys: [bajoCervantes, llanos],
    origin: [-83.919373, 9.864429],
    destination: INA_LLANOS_DESTINATION,
    destinationName: 'INA Paraiso Llanos de Santa Lucia',
  });
  const llanosDebug = ranking.debugById.get('llanos');

  assert.ok(llanosDebug);
  assert.equal(
    llanosDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-llanos-santa-lucia-exact-corridor-bonus',
    ),
    true,
  );
});

test('Llanos rule does not penalize Orosi when no compatible alternative exists', () => {
  const orosiOnly = makeJourney({
    id: 'orosi',
    routeName: 'Parque Industrial - Cartago - Orosi - Rio Macho',
    score: 60,
    destinationWalkMeters: 122,
  });

  const ranking = rankRaptorJourneys({
    journeys: [orosiOnly],
    origin: [-83.919373, 9.864429],
    destination: INA_LLANOS_DESTINATION,
    destinationName: 'INA Paraiso Llanos de Santa Lucia',
  });

  assert.equal(ranking.ranked[0]?.id, 'orosi');
  assert.equal(
    ranking
      .debugById
      .get('orosi')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-llanos-santa-lucia-overbranch-penalty',
      ),
    false,
  );
});
