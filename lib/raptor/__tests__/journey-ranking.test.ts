import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlannedJourney } from '@/lib/journey-planner';

import { computeRaptorContextPenalty, rankRaptorJourneys } from '../journey-ranking';
import {
  destinationInBox,
  LA_CAMPINA_BOX,
  LLANO_GRANDE_SCHOOL_BOX,
  OCHOMOGO_BOX,
} from '../ranking/geo-boxes';

function makeJourney(overrides: Partial<PlannedJourney> = {}): PlannedJourney {
  return {
    id: overrides.id ?? 'journey-a',
    kind: overrides.kind ?? 'direct',
    routeId: overrides.routeId ?? 1,
    routeName: overrides.routeName ?? 'Cartago Test',
    routeCode: overrides.routeCode ?? null,
    operatorLabel: overrides.operatorLabel ?? 'RAPTOR local',
    routeIds: overrides.routeIds ?? [1],
    routeCodes: overrides.routeCodes ?? [],
    legs:
      overrides.legs ??
      [
        {
          routeId: 1,
          routeName: overrides.routeName ?? 'Cartago Test',
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

test('rankRaptorJourneys handles empty input', () => {
  const ranking = rankRaptorJourneys({
    journeys: [],
    origin: null,
    destination: null,
  });

  assert.deepEqual(ranking.ranked, []);
  assert.equal(ranking.debugById.size, 0);
  assert.equal(ranking.preferredJourneyId, null);
});

test('rankRaptorJourneys sorts by display score, walk, then leg count', () => {
  const direct = makeJourney({ id: 'direct', score: 20, totalWalkMeters: 50 });
  const shorterWalk = makeJourney({ id: 'shorter-walk', score: 10, totalWalkMeters: 20 });
  const longerWalk = makeJourney({ id: 'longer-walk', score: 10, totalWalkMeters: 40 });

  const ranking = rankRaptorJourneys({
    journeys: [direct, longerWalk, shorterWalk],
    origin: null,
    destination: null,
  });

  assert.deepEqual(
    ranking.ranked.map((journey) => journey.id),
    ['shorter-walk', 'longer-walk', 'direct'],
  );
  assert.equal(ranking.preferredJourneyId, 'shorter-walk');
});

test('rankRaptorJourneys is deterministic for identical inputs', () => {
  const journeys = [
    makeJourney({ id: 'a', score: 30 }),
    makeJourney({ id: 'b', score: 25, totalWalkMeters: 12 }),
  ];
  const input = {
    journeys,
    origin: [-83.919373, 9.864429] as [number, number],
    destination: [-83.9364834537593, 9.83770228559147] as [number, number],
    destinationName: 'Parquecito La Campina',
  };

  const first = rankRaptorJourneys(input);
  const second = rankRaptorJourneys(input);

  assert.deepEqual(
    [...first.debugById.entries()].map(([id, debug]) => [id, debug.displayScore]),
    [...second.debugById.entries()].map(([id, debug]) => [id, debug.displayScore]),
  );
});

test('computeRaptorContextPenalty returns no penalty when no destination hints apply', () => {
  const result = computeRaptorContextPenalty({
    journey: makeJourney(),
    origin: [-83.919373, 9.864429],
    destination: [-83.9364834537593, 9.83770228559147],
    destinationName: 'Parquecito La Campina',
  });

  assert.equal(result.totalPenalty, 0);
  assert.deepEqual(result.reasons, []);
});

test('rankRaptorJourneys adds walk pressure to short trips with awkward bus access', () => {
  const awkwardShortHop = makeJourney({
    id: 'awkward-short-hop',
    score: 20,
    originWalkMeters: 360,
    destinationWalkMeters: 260,
    totalWalkMeters: 620,
  });
  const simplerShortHop = makeJourney({
    id: 'simpler-short-hop',
    score: 23,
    originWalkMeters: 90,
    destinationWalkMeters: 90,
    totalWalkMeters: 180,
  });

  const ranking = rankRaptorJourneys({
    journeys: [awkwardShortHop, simplerShortHop],
    origin: [-83.9389, 9.8782],
    destination: [-83.9334, 9.8782],
  });

  assert.equal(ranking.preferredJourneyId, 'simpler-short-hop');
  assert.equal(
    ranking.debugById
      .get('awkward-short-hop')
      ?.reasons.some((reason) => reason.id === 'raptor-walk-vs-wait-short-hop'),
    true,
  );
});

function hasRaptorReason(journey: PlannedJourney, reasonId: string, params: {
  destination: [number, number];
  ranked: PlannedJourney[];
}) {
  const result = computeRaptorContextPenalty({
    journey,
    origin: [-83.919373, 9.864429],
    destination: params.destination,
    ranked: params.ranked,
  });

  return result.reasons.some((reason) => reason.id === reasonId);
}

function hasReasonPrefix(journeys: PlannedJourney[], destination: [number, number], prefix: string) {
  return journeys.some((journey) => {
    const result = computeRaptorContextPenalty({
      journey,
      origin: [-83.919373, 9.864429],
      destination,
      ranked: journeys,
    });

    return result.reasons.some((reason) => reason.id.startsWith(prefix));
  });
}

test('destinationInBox detects points inside the configured geo boxes', () => {
  assert.equal(
    destinationInBox([-83.9364834537593, 9.83770228559147], LA_CAMPINA_BOX),
    true,
  );
  assert.equal(destinationInBox([-83.919373, 9.864429], LA_CAMPINA_BOX), false);
  assert.equal(destinationInBox(null, LA_CAMPINA_BOX), false);
});

test('Tejar east destination prefers San Isidro/Tejar over adjacent overbranches', () => {
  const adjacentOverbranch = makeJourney({
    id: 'santa-elena-parque-industrial',
    routeName: 'Santa Elena Abajo - Cartago Por Parque Industrial',
    score: 20,
    destinationWalkMeters: 120,
  });
  const tejar = makeJourney({
    id: 'san-isidro-tejar',
    routeName: 'Cartago - San Isidro De Tejar',
    score: 52,
    destinationWalkMeters: 130,
  });
  const ranked = [adjacentOverbranch, tejar];

  assert.equal(
    hasRaptorReason(tejar, 'raptor-tejar-east-corridor-bonus', {
      destination: [-83.9385643, 9.8439289],
      ranked,
    }),
    true,
  );
  assert.equal(
    hasRaptorReason(adjacentOverbranch, 'raptor-tejar-east-overbranch-penalty', {
      destination: [-83.9385643, 9.8439289],
      ranked,
    }),
    true,
  );
});

test('Taras origin to Tejar east prefers local Taras feeder over walking to an adjacent direct branch', () => {
  const adjacentDirect = makeJourney({
    id: 'san-rafael-parque-industrial',
    routeName: 'San Rafael De Oreamuno - Parque Industrial',
    score: 20,
    originWalkMeters: 2100,
    destinationWalkMeters: 240,
    totalWalkMeters: 2340,
  });
  const tarasFeeder = makeJourney({
    id: 'taras-santa-elena',
    kind: 'transfer',
    routeName: 'Cartago - Taras - San Nicolas luego Santa Elena Abajo - Cartago Por Parque Industrial',
    score: 55,
    originWalkMeters: 108,
    destinationWalkMeters: 260,
    totalWalkMeters: 368,
    legs: [
      {
        routeId: 11,
        routeName: 'CARTAGO - TARAS - SAN NICOLAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Parada sin nombre',
        alightStopName: 'Cartago centro',
      },
      {
        routeId: 12,
        routeName: 'SANTA ELENA ABAJO - CARTAGO POR PARQUE INDUSTRIAL',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Cartago centro',
        alightStopName: 'A un costado de la Iglesia del Guarco',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [adjacentDirect, tarasFeeder],
    origin: [-83.9389683, 9.87829],
    destination: [-83.9385643, 9.8439289],
  });

  assert.equal(ranking.preferredJourneyId, 'taras-santa-elena');
  assert.equal(
    ranking.debugById
      .get('san-rafael-parque-industrial')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-taras-tejar-adjacent-branch-penalty'),
    true,
  );
});

test('Taras to Paseo Metropoli prefers the Casa de los Patos feeder over La Lima access hops', () => {
  const sanJoseLaLimaHop = makeJourney({
    id: 'sj-la-lima-hop',
    routeName: 'San Jose - San Pedro - Tres Rios - La Lima - Cartago',
    score: 13.8,
    originWalkMeters: 341,
    destinationWalkMeters: 83,
    totalWalkMeters: 425,
    legs: [
      {
        routeId: 4698,
        routeName: 'SAN JOSE - SAN PEDRO - TRES RIOS - LA LIMA - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Cruzando la calle frente Fabrica de Candelas',
        alightStopName: 'Parada Paseo Metropoli hacia Cartago',
      },
    ],
  });
  const cartagoLaLimaHop = makeJourney({
    id: 'cartago-la-lima-hop',
    routeName: 'Cartago - La Lima',
    score: 26.9,
    originWalkMeters: 538,
    destinationWalkMeters: 340,
    totalWalkMeters: 878,
    geoMetrics: {
      finalWalkNetworkMeters: 340,
    } as NonNullable<PlannedJourney['geoMetrics']>,
    legs: [
      {
        routeId: 804,
        routeName: 'CARTAGO - LA LIMA',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Contiguo Minisuper Armonia',
        alightStopName: 'Parada Paseo Metropoli hacia Cartago',
      },
    ],
  });
  const tarasFeeder = makeJourney({
    id: 'taras-feeder-la-lima',
    kind: 'transfer',
    routeName: 'Cartago - Taras - San Nicolas luego Cartago - Tres Rios Por La Lima',
    score: 28.1,
    originWalkMeters: 108,
    transferWalkMeters: 166,
    destinationWalkMeters: 83,
    totalWalkMeters: 357,
    legs: [
      {
        routeId: 797,
        routeName: 'CARTAGO - TARAS - SAN NICOLAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Diagonal A La Casa De Los Patos',
        alightStopName: 'Parada Cementerio General Tres Rios-Cartago',
      },
      {
        routeId: 898,
        routeName: 'CARTAGO - TRES RIOS POR LA LIMA',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Parada de Diagonal a McDonalds',
        alightStopName: 'Parada Paseo Metropoli hacia Cartago',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [sanJoseLaLimaHop, cartagoLaLimaHop, tarasFeeder],
    origin: [-83.9389683, 9.87829],
    destination: [-83.9426214, 9.867107],
    destinationName: 'Paseo Metropoli',
  });

  assert.equal(ranking.preferredJourneyId, 'taras-feeder-la-lima');
  assert.equal(
    ranking.debugById
      .get('sj-la-lima-hop')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-taras-paseo-local-feeder-penalty',
      ),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('cartago-la-lima-hop')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-taras-paseo-local-feeder-penalty',
      ),
    true,
  );
});

test('Taras to Paseo Metropoli keeps La Lima transfers secondary to a direct Parque Industrial option', () => {
  const laLimaTransfer = makeJourney({
    id: 'taras-la-lima-transfer',
    kind: 'transfer',
    routeName: 'Cartago - Taras - San Nicolas luego Cartago - Tres Rios Por La Lima',
    score: 28.1,
    originWalkMeters: 108,
    transferWalkMeters: 166,
    destinationWalkMeters: 83,
    totalWalkMeters: 357,
    legs: [
      {
        routeId: 797,
        routeName: 'CARTAGO - TARAS - SAN NICOLAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Diagonal A La Casa De Los Patos',
        alightStopName: 'Parada Cementerio General Tres Rios-Cartago',
      },
      {
        routeId: 898,
        routeName: 'CARTAGO - TRES RIOS POR LA LIMA',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Parada de Diagonal a McDonalds',
        alightStopName: 'Parada Paseo Metropoli hacia Cartago',
      },
    ],
  });
  const parqueIndustrial = makeJourney({
    id: 'parque-industrial-direct',
    routeName: 'Tierra Blanca - Cot - Parque Industrial',
    score: 25.3,
    originWalkMeters: 364,
    destinationWalkMeters: 289,
    totalWalkMeters: 653,
    legs: [
      {
        routeId: 871,
        routeName: 'TIERRA BLANCA - COT - PARQUE INDUSTRIAL',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Cruzando la calle frente Fabrica de Candelas',
        alightStopName: 'Entrada Parque Industrial La Lima',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [laLimaTransfer, parqueIndustrial],
    origin: [-83.9389683, 9.87829],
    destination: [-83.9426214, 9.867107],
    destinationName: 'Paseo Metropoli',
  });

  assert.equal(ranking.preferredJourneyId, 'parque-industrial-direct');
  assert.equal(
    ranking.debugById
      .get('taras-la-lima-transfer')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-taras-paseo-la-lima-transfer-secondary',
      ),
    true,
  );
});

test('Taras to Paseo Metropoli keeps La Lima transfers secondary even when Parque Industrial walks more', () => {
  const laLimaTransfer = makeJourney({
    id: 'taras-la-lima-transfer',
    kind: 'transfer',
    routeName: 'Cartago - Taras - San Nicolas luego Cartago - Tres Rios Por La Lima',
    score: 28.1,
    originWalkMeters: 108,
    transferWalkMeters: 166,
    destinationWalkMeters: 83,
    totalWalkMeters: 357,
    legs: [
      {
        routeId: 797,
        routeName: 'CARTAGO - TARAS - SAN NICOLAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Diagonal A La Casa De Los Patos',
        alightStopName: 'Parada Cementerio General Tres Rios-Cartago',
      },
      {
        routeId: 898,
        routeName: 'CARTAGO - TRES RIOS POR LA LIMA',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Parada de Diagonal a McDonalds',
        alightStopName: 'Parada Paseo Metropoli hacia Cartago',
      },
    ],
  });
  const parqueIndustrial = makeJourney({
    id: 'parque-industrial-direct',
    routeName: 'Cartago - Quircot - Pedregal - Parque Industrial',
    score: 31.7,
    originWalkMeters: 631,
    destinationWalkMeters: 221,
    totalWalkMeters: 852,
    legs: [
      {
        routeId: 4409,
        routeName: 'CARTAGO - QUIRCOT - PEDREGAL - PARQUE INDUSTRIAL',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Frente al Restaurante Elegante',
        alightStopName: 'Parada de Paseo Metropoli',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [laLimaTransfer, parqueIndustrial],
    origin: [-83.9389683, 9.87829],
    destination: [-83.9426214, 9.867107],
    destinationName: 'Paseo Metropoli',
  });

  assert.equal(ranking.preferredJourneyId, 'parque-industrial-direct');
  assert.equal(
    ranking.debugById
      .get('taras-la-lima-transfer')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-taras-paseo-la-lima-transfer-secondary',
      ),
    true,
  );
});

test('Taras to Paseo Metropoli demotes Taras far-drop and La Lima access hops below Parque Industrial', () => {
  const tarasFarDrop = makeJourney({
    id: 'taras-far-drop',
    routeName: 'Cartago - Taras - San Nicolas',
    score: 19.2,
    originWalkMeters: 231,
    destinationWalkMeters: 977,
    totalWalkMeters: 1207,
    legs: [
      {
        routeId: 4719,
        routeName: 'CARTAGO - TARAS - SAN NICOLAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Frente A Boutique Tara',
        alightStopName: 'Frente A Bar Linda Vista',
      },
    ],
  });
  const laLimaAccessHop = makeJourney({
    id: 'sj-la-lima-hop',
    routeName: 'San Jose - San Pedro - Tres Rios - La Lima - Cartago',
    score: 13.5,
    originWalkMeters: 462,
    destinationWalkMeters: 83,
    totalWalkMeters: 545,
    legs: [
      {
        routeId: 4703,
        routeName: 'SAN JOSE - SAN PEDRO - TRES RIOS - LA LIMA - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Gastomza',
        alightStopName: 'Parada Paseo Metropoli hacia Cartago',
      },
    ],
  });
  const parqueIndustrial = makeJourney({
    id: 'parque-industrial-direct',
    routeName: 'Cartago - Quircot - Pedregal - Parque Industrial',
    score: 31.7,
    originWalkMeters: 631,
    destinationWalkMeters: 221,
    totalWalkMeters: 852,
    legs: [
      {
        routeId: 4409,
        routeName: 'CARTAGO - QUIRCOT - PEDREGAL - PARQUE INDUSTRIAL',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Frente al Restaurante Elegante',
        alightStopName: 'Parada de Paseo Metropoli',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [tarasFarDrop, laLimaAccessHop, parqueIndustrial],
    origin: [-83.9389683, 9.87829],
    destination: [-83.9426214, 9.867107],
    destinationName: 'Paseo Metropoli',
  });

  assert.equal(ranking.preferredJourneyId, 'parque-industrial-direct');
  assert.equal(
    ranking.debugById
      .get('taras-far-drop')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-taras-paseo-taras-far-drop-secondary',
      ),
    true,
  );
});

test('Taras to Paseo Metropoli demotes direct La Lima hops after network walking validation', () => {
  const laLimaDirect = makeJourney({
    id: 'cartago-la-lima-network-hop',
    routeName: 'Cartago - La Lima',
    score: 30.4,
    originWalkMeters: 851,
    destinationWalkMeters: 388,
    totalWalkMeters: 1493,
    geoMetrics: {
      finalWalkNetworkMeters: 642,
    } as NonNullable<PlannedJourney['geoMetrics']>,
    legs: [
      {
        routeId: 804,
        routeName: 'CARTAGO - LA LIMA',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Frente Panaderia Falaned',
        alightStopName: 'Frente al Bar La Union',
      },
    ],
  });
  const laLimaTransfer = makeJourney({
    id: 'taras-la-lima-transfer',
    kind: 'transfer',
    routeName: 'Cartago - Taras - San Nicolas luego Cartago - Tres Rios Por La Lima',
    score: 30.1,
    originWalkMeters: 108,
    transferWalkMeters: 166,
    destinationWalkMeters: 306,
    totalWalkMeters: 650,
    legs: [
      {
        routeId: 797,
        routeName: 'CARTAGO - TARAS - SAN NICOLAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Diagonal A La Casa De Los Patos',
        alightStopName: 'Parada Cementerio General Tres Rios-Cartago',
      },
      {
        routeId: 898,
        routeName: 'CARTAGO - TRES RIOS POR LA LIMA',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Parada de Diagonal a McDonalds',
        alightStopName: 'Parada de Paseo Metropoli',
      },
    ],
  });
  const parqueIndustrial = makeJourney({
    id: 'parque-industrial-direct',
    routeName: 'Cartago - Quircot - Pedregal - Parque Industrial',
    score: 33.7,
    originWalkMeters: 631,
    destinationWalkMeters: 306,
    totalWalkMeters: 1000,
    legs: [
      {
        routeId: 4409,
        routeName: 'CARTAGO - QUIRCOT - PEDREGAL - PARQUE INDUSTRIAL',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Frente al Restaurante Elegante',
        alightStopName: 'Parada de Paseo Metropoli',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [laLimaDirect, laLimaTransfer, parqueIndustrial],
    origin: [-83.9389683, 9.87829],
    destination: [-83.9426214, 9.867107],
    destinationName: 'Paseo Metropoli',
  });

  assert.equal(ranking.preferredJourneyId, 'parque-industrial-direct');
  assert.equal(
    ranking.debugById
      .get('cartago-la-lima-network-hop')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-taras-paseo-local-feeder-penalty',
      ),
    true,
  );
});

test('Taras to Paraiso prefers the Plaza Iglesias terminal transfer over Cementerio when the route family matches', () => {
  const cementerioTransfer = makeJourney({
    id: 'cementerio-paraiso',
    kind: 'transfer',
    routeName:
      'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Paraiso - Birrisito - Cervantes - Santiago',
    score: 90.5,
    originWalkMeters: 348,
    transferWalkMeters: 115,
    destinationWalkMeters: 47,
    totalWalkMeters: 511,
    legs: [
      {
        routeId: 4719,
        routeName: 'CARTAGO - TARAS - SAN NICOLAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'FRENTE A BAR LINDA VISTA',
        alightStopName: 'Parada Cementerio General Tres Rios-Cartago',
      },
      {
        routeId: 4386,
        routeName: 'PARQUE INDUSTRIAL - CARTAGO - PARAISO - BIRRISITO - CERVANTES - SANTIAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'A un costado del Cementerio',
        alightStopName: 'En la entrada de Casa Blanca, frente a Gollo tienda',
      },
    ],
  });
  const plazaIglesiasTerminal = makeJourney({
    id: 'plaza-iglesias-terminal',
    kind: 'transfer',
    routeName: 'Cartago - Taras - San Nicolas luego Cartago - Paraiso',
    score: 89.9,
    originWalkMeters: 108,
    transferWalkMeters: 523,
    destinationWalkMeters: 47,
    totalWalkMeters: 678,
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
        routeId: 4360,
        routeName: 'CARTAGO - PARAISO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Cartago - Dulce Nombre',
        alightStopName: 'En la entrada de Casa Blanca, frente a Gollo tienda',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [cementerioTransfer, plazaIglesiasTerminal],
    origin: [-83.9389683, 9.87829],
    destination: [-83.8664324, 9.8392523],
    destinationName: 'Paraiso centro',
  });

  assert.equal(ranking.preferredJourneyId, 'plaza-iglesias-terminal');
  assert.equal(
    ranking.debugById
      .get('cementerio-paraiso')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-taras-east-cementerio-transfer-secondary',
      ),
    true,
  );
});

test('Taras to Paraiso keeps the Paraiso route family above Cachi terminal fallback', () => {
  const cachiTerminal = makeJourney({
    id: 'cachi-terminal',
    kind: 'transfer',
    routeName: 'Cartago - Taras - San Nicolas luego Cartago - Cachi',
    score: 89.9,
    originWalkMeters: 108,
    transferWalkMeters: 523,
    destinationWalkMeters: 47,
    totalWalkMeters: 678,
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
        alightStopName: 'En la entrada de Casa Blanca, frente a Gollo tienda',
      },
    ],
  });
  const paraisoCementerio = makeJourney({
    id: 'paraiso-cementerio',
    kind: 'transfer',
    routeName:
      'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Paraiso - Birrisito - Cervantes - Santiago',
    score: 91.6,
    originWalkMeters: 108,
    transferWalkMeters: 115,
    destinationWalkMeters: 47,
    totalWalkMeters: 270,
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
        alightStopName: 'En la entrada de Casa Blanca, frente a Gollo tienda',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [cachiTerminal, paraisoCementerio],
    origin: [-83.9389683, 9.87829],
    destination: [-83.8664324, 9.8392523],
    destinationName: 'Paraiso centro',
  });

  assert.equal(ranking.preferredJourneyId, 'paraiso-cementerio');
  assert.equal(
    ranking.debugById
      .get('paraiso-cementerio')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-taras-east-cementerio-transfer-secondary',
      ),
    false,
  );
});

test('Taras to Paraiso prefers Casa de los Patos boarding over Linda Vista when the route is equivalent', () => {
  const lindaVista = makeJourney({
    id: 'linda-vista',
    kind: 'transfer',
    routeName:
      'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Paraiso - Birrisito - Cervantes - Santiago',
    score: 90.5,
    originWalkMeters: 348,
    transferWalkMeters: 115,
    destinationWalkMeters: 47,
    totalWalkMeters: 511,
    legs: [
      {
        routeId: 4719,
        routeName: 'CARTAGO - TARAS - SAN NICOLAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Frente A Bar Linda Vista',
        alightStopName: 'Parada Cementerio General Tres Rios-Cartago',
      },
      {
        routeId: 4386,
        routeName: 'PARQUE INDUSTRIAL - CARTAGO - PARAISO - BIRRISITO - CERVANTES - SANTIAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'A un costado del Cementerio',
        alightStopName: 'En la entrada de Casa Blanca, frente a Gollo tienda',
      },
    ],
  });
  const casaPatos = makeJourney({
    id: 'casa-patos',
    kind: 'transfer',
    routeName:
      'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Paraiso - Birrisito - Cervantes - Santiago',
    score: 91.6,
    originWalkMeters: 108,
    transferWalkMeters: 115,
    destinationWalkMeters: 47,
    totalWalkMeters: 270,
    legs: [
      {
        routeId: 4719,
        routeName: 'CARTAGO - TARAS - SAN NICOLAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Diagonal A La Casa De Los Patos',
        alightStopName: 'Parada Cementerio General Tres Rios-Cartago',
      },
      {
        routeId: 4386,
        routeName: 'PARQUE INDUSTRIAL - CARTAGO - PARAISO - BIRRISITO - CERVANTES - SANTIAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'A un costado del Cementerio',
        alightStopName: 'En la entrada de Casa Blanca, frente a Gollo tienda',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [lindaVista, casaPatos],
    origin: [-83.9389683, 9.87829],
    destination: [-83.8664324, 9.8392523],
    destinationName: 'Paraiso centro',
  });

  assert.equal(ranking.preferredJourneyId, 'casa-patos');
  assert.equal(
    ranking.debugById
      .get('linda-vista')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-paraiso-farther-board-penalty',
      ),
    true,
  );
});

test('Lourdes destination prefers the direct Lourdes corridor over El Covao', () => {
  const elCovao = makeJourney({
    id: 'el-covao',
    routeName: 'El Covao - Lourdes',
    score: 20,
    destinationWalkMeters: 110,
  });
  const lourdes = makeJourney({
    id: 'cartago-lourdes',
    routeName: 'Cartago - Agua Caliente - Lourdes',
    score: 52,
    destinationWalkMeters: 10,
  });
  const ranked = [elCovao, lourdes];

  assert.equal(
    hasRaptorReason(lourdes, 'raptor-lourdes-corridor-bonus', {
      destination: [-83.9086919704042, 9.82545597844213],
      ranked,
    }),
    true,
  );
  assert.equal(
    hasRaptorReason(elCovao, 'raptor-lourdes-overbranch-penalty', {
      destination: [-83.9086919704042, 9.82545597844213],
      ranked,
    }),
    true,
  );
});

test('Lourdes destination demotes adjacent branches when a Lourdes drop is available', () => {
  const caballoBlanco = makeJourney({
    id: 'caballo-blanco',
    routeName: 'Piedra Azul - Cartago luego Cartago - Caballo Blanco - Dulce Nombre',
    score: 96,
    destinationWalkMeters: 1616,
    totalWalkMeters: 1710,
  });
  const lourdes = makeJourney({
    id: 'paraiso-lourdes',
    routeName: 'Paraiso - Cartago luego Cartago - Agua Caliente - Lourdes - Mata De Guineo',
    score: 128,
    destinationWalkMeters: 2,
    totalWalkMeters: 772,
  });

  const ranking = rankRaptorJourneys({
    journeys: [caballoBlanco, lourdes],
    origin: [-83.865581, 9.838231],
    destination: [-83.9086919704042, 9.82545597844213],
  });

  assert.equal(ranking.preferredJourneyId, 'paraiso-lourdes');
  assert.equal(
    ranking.debugById
      .get('caballo-blanco')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-lourdes-overbranch-penalty'),
    true,
  );
});

test('Parque Industrial destination prefers near Parque Industrial corridor drops', () => {
  const tablonCartago = makeJourney({
    id: 'tablon-cartago',
    routeName: 'Tablon - Cartago',
    score: 38,
    destinationWalkMeters: 1152,
    totalWalkMeters: 1400,
  });
  const coris = makeJourney({
    id: 'cartago-coris',
    routeName: 'Cartago - Coris',
    score: 73,
    destinationWalkMeters: 344,
    totalWalkMeters: 612,
  });
  const parqueIndustrial = makeJourney({
    id: 'parque-industrial',
    routeName: 'Tablon - Cartago luego Cartago - Santa Elena Abajo Por Parque Industrial',
    score: 108,
    destinationWalkMeters: 1,
    totalWalkMeters: 985,
  });

  const ranking = rankRaptorJourneys({
    journeys: [tablonCartago, coris, parqueIndustrial],
    origin: [-84.00739824, 9.831312],
    destination: [-83.9543747, 9.85659988],
  });

  assert.equal(ranking.preferredJourneyId, 'parque-industrial');
  assert.equal(
    ranking.debugById
      .get('parque-industrial')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-parque-industrial-corridor-bonus'),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('tablon-cartago')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-parque-industrial-nonmatching-penalty'),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('cartago-coris')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-parque-industrial-nonmatching-penalty'),
    true,
  );
});

test('Loaiza destination prefers the direct Loaiza corridor over Piedra Azul', () => {
  const piedraAzul = makeJourney({
    id: 'piedra-azul',
    routeName: 'Cartago - Piedra Azul',
    score: 20,
    destinationWalkMeters: 180,
  });
  const tucurriqueElHumo = makeJourney({
    id: 'tucurrique-el-humo',
    routeName: 'Cartago - Paraiso - Birrisito - Cervantes - Bajo Cervantes luego Cartago - Tucurrique - El Humo',
    score: 18,
    destinationWalkMeters: 180,
  });
  const loaiza = makeJourney({
    id: 'loaiza',
    routeName: 'Cartago - Loaiza',
    score: 52,
    destinationWalkMeters: 0,
  });
  const ranked = [piedraAzul, tucurriqueElHumo, loaiza];

  assert.equal(
    hasRaptorReason(loaiza, 'raptor-loaiza-corridor-bonus', {
      destination: [-83.82325817, 9.81294327],
      ranked,
    }),
    true,
  );
  assert.equal(
    hasRaptorReason(piedraAzul, 'raptor-loaiza-overbranch-penalty', {
      destination: [-83.82325817, 9.81294327],
      ranked,
    }),
    true,
  );
  assert.equal(
    hasRaptorReason(tucurriqueElHumo, 'raptor-loaiza-overbranch-penalty', {
      destination: [-83.82325817, 9.81294327],
      ranked,
    }),
    true,
  );
});

test('Llano Grande school prefers nearby Llano Grande drops over adjacent far drops', () => {
  const sagradaFamilia = makeJourney({
    id: 'sagrada-familia',
    routeName: 'Cartago - Barrio Sagrada Familia',
    score: 80.1,
    totalWalkMeters: 1425,
    destinationWalkMeters: 740,
  });
  const llanoGrande = makeJourney({
    id: 'llano-grande',
    routeName: 'Cartago - Llano Grande',
    score: 84.3,
    totalWalkMeters: 1226,
    destinationWalkMeters: 540,
  });
  const lasPavasNear = makeJourney({
    id: 'las-pavas-near',
    routeName: 'Cartago - Llano Grande Con Entrada A Las Pavas',
    score: 89.9,
    totalWalkMeters: 953,
    destinationWalkMeters: 267,
  });

  const ranking = rankRaptorJourneys({
    journeys: [sagradaFamilia, llanoGrande, lasPavasNear],
    origin: [-83.923164, 9.862138],
    destination: [-83.906791, 9.937464],
  });

  assert.equal(ranking.preferredJourneyId, 'las-pavas-near');
  assert.equal(
    ranking.debugById
      .get('sagrada-familia')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-llano-grande-school-nonmatching-penalty'),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('llano-grande')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-llano-grande-school-corridor-bonus'),
    false,
  );
  assert.equal(
    ranking.debugById
      .get('las-pavas-near')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-llano-grande-school-corridor-bonus'),
    true,
  );
});

test('urban north destinations prefer nearby local drops over interurban pass-throughs', () => {
  const scenarios = [
    {
      destination: [-83.92947387695312, 9.888154029846191] as [number, number],
      expectedId: 'quircot-local',
      expectedReason: 'raptor-quircot-corridor-bonus',
      penalizedId: 'sj-quircot-pass-through',
      penalizedReason: 'raptor-quircot-nonmatching-penalty',
      journeys: [
        makeJourney({
          id: 'sj-quircot-pass-through',
          routeName: 'San Jose - San Pedro - Tres Rios - Taras - Cartago',
          score: 37.1,
          destinationWalkMeters: 682,
          totalWalkMeters: 845,
        }),
        makeJourney({
          id: 'quircot-local',
          routeName: 'Cartago - El Carmen - Quircot - San Rafael',
          score: 45.7,
          destinationWalkMeters: 126,
          totalWalkMeters: 903,
        }),
      ],
    },
    {
      destination: [-83.9270248413086, 9.877954483032227] as [number, number],
      expectedId: 'pedregal-local',
      expectedReason: 'raptor-pedregal-corridor-bonus',
      penalizedId: 'sj-pedregal-pass-through',
      penalizedReason: 'raptor-pedregal-nonmatching-penalty',
      journeys: [
        makeJourney({
          id: 'sj-pedregal-pass-through',
          routeName: 'San Jose - San Pedro - Pista - La Lima - Cartago',
          score: 24.8,
          destinationWalkMeters: 1234,
          totalWalkMeters: 1438,
        }),
        makeJourney({
          id: 'pedregal-local',
          routeName: 'Cartago - Loyola - Pedregal - Quircot',
          score: 32.5,
          destinationWalkMeters: 106,
          totalWalkMeters: 737,
        }),
      ],
    },
    {
      destination: [-83.92220306396484, 9.873766899108887] as [number, number],
      expectedId: 'el-carmen-local',
      expectedReason: 'raptor-el-carmen-quircot-corridor-bonus',
      penalizedId: 'sj-el-carmen-pass-through',
      penalizedReason: 'raptor-el-carmen-quircot-nonmatching-penalty',
      journeys: [
        makeJourney({
          id: 'sj-el-carmen-pass-through',
          routeName: 'San Jose - San Pedro - Pista - La Lima - Cartago',
          score: 15.4,
          destinationWalkMeters: 580,
          totalWalkMeters: 783,
        }),
        makeJourney({
          id: 'el-carmen-local',
          routeName: 'Cartago - El Carmen - Quircot - Cooperrosales',
          score: 24.3,
          destinationWalkMeters: 99,
          totalWalkMeters: 549,
        }),
      ],
    },
    {
      destination: [-83.89291381835938, 9.867877006530762] as [number, number],
      expectedId: 'el-alto-local',
      expectedReason: 'raptor-el-alto-corridor-bonus',
      penalizedId: 'san-rafael-far-drop',
      penalizedReason: 'raptor-el-alto-nonmatching-penalty',
      journeys: [
        makeJourney({
          id: 'san-rafael-far-drop',
          routeName: 'Cartago - San Rafael De Oreamuno',
          score: 33.2,
          destinationWalkMeters: 1219,
          totalWalkMeters: 1397,
        }),
        makeJourney({
          id: 'el-alto-local',
          routeName: 'Cartago - La Cruz De Caravaca - El Alto',
          score: 36.7,
          destinationWalkMeters: 125,
          totalWalkMeters: 328,
        }),
      ],
    },
  ];

  for (const scenario of scenarios) {
    const ranking = rankRaptorJourneys({
      journeys: scenario.journeys,
      origin: [-83.919373, 9.864429],
      destination: scenario.destination,
    });

    assert.equal(ranking.preferredJourneyId, scenario.expectedId);
    assert.equal(
      ranking.debugById
        .get(scenario.expectedId)
        ?.raptorPolishReasons.some((reason) => reason.id === scenario.expectedReason),
      true,
    );
    assert.equal(
      ranking.debugById
        .get(scenario.penalizedId)
        ?.raptorPolishReasons.some((reason) => reason.id === scenario.penalizedReason),
      true,
    );
  }
});

test('El Humo destination prefers the direct Tucurrique corridor over a Paraiso feeder', () => {
  const forbiddenFeeder = makeJourney({
    id: 'paraiso-feeder-el-humo',
    routeName: 'Cartago - Paraiso - Birrisito - Cervantes - Bajo Cervantes luego Cartago - Tucurrique - El Humo',
    score: 20,
    destinationWalkMeters: 0,
  });
  const directElHumo = makeJourney({
    id: 'cartago-tucurrique-el-humo',
    routeName: 'Cartago - Tucurrique - El Humo',
    score: 50,
    destinationWalkMeters: 0,
  });

  const ranking = rankRaptorJourneys({
    journeys: [forbiddenFeeder, directElHumo],
    origin: [-83.919373, 9.864429],
    destination: [-83.71591776, 9.80183743],
  });

  assert.equal(ranking.preferredJourneyId, 'cartago-tucurrique-el-humo');
  assert.equal(
    ranking.debugById
      .get('cartago-tucurrique-el-humo')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-el-humo-direct-corridor-bonus'),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('paraiso-feeder-el-humo')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-el-humo-forbidden-feeder-penalty'),
    true,
  );
});

test('direct same-route alternatives beat branch-continuation transfers when both are viable', () => {
  const continuationTransfer = makeJourney({
    id: 'penas-transfer',
    kind: 'transfer',
    routeName: 'Penas Blancas - Cartago luego El Humo - Tucurrique - Cartago',
    score: 129,
    totalWalkMeters: 168,
    destinationWalkMeters: 136,
    legs: [
      {
        routeId: 81,
        routeName: 'PENAS BLANCAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopId: -200012393,
        boardStopName: 'FRENTE IGLESIA DE PENAS BLANCAS 2-1',
        alightStopId: -200012370,
        alightStopName: 'FRENTE LICORERA UJARRASQUENA 2-1',
      },
      {
        routeId: 73,
        routeName: 'EL HUMO - TUCURRIQUE - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopId: -200012315,
        boardStopName: 'FRENTE LICORERA UJARRASQUENA',
        alightStopId: 141,
        alightStopName: 'Cartago-Orosi',
      },
    ],
  });
  const directReturn = makeJourney({
    id: 'penas-direct',
    kind: 'direct',
    routeName: 'Penas Blancas - Cartago',
    score: 134,
    totalWalkMeters: 168,
    destinationWalkMeters: 136,
    legs: [
      {
        routeId: 81,
        routeName: 'PENAS BLANCAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopId: -200012393,
        boardStopName: 'FRENTE IGLESIA DE PENAS BLANCAS 2-1',
        alightStopId: 141,
        alightStopName: 'Cartago-Orosi',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [continuationTransfer, directReturn],
    origin: [-83.78481747, 9.82705109],
    destination: [-83.919373, 9.864429],
  });

  assert.equal(ranking.preferredJourneyId, 'penas-direct');
  assert.equal(
    ranking.debugById
      .get('penas-transfer')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-direct-alternative-transfer-penalty'),
    true,
  );
});

test('direct same-route alternative can use a nearby origin boarding stop', () => {
  const continuationTransfer = makeJourney({
    id: 'penas-nearby-transfer',
    kind: 'transfer',
    routeName: 'Penas Blancas - Cartago luego El Humo - Tucurrique - Cartago',
    score: 129,
    originWalkMeters: 95,
    totalWalkMeters: 240,
    destinationWalkMeters: 136,
    legs: [
      {
        routeId: 81,
        routeName: 'PENAS BLANCAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopId: -200012391,
        boardStopName: 'FRENTE CASA DEL PADRE',
        alightStopId: -200012370,
        alightStopName: 'FRENTE LICORERA UJARRASQUENA 2-1',
      },
      {
        routeId: 73,
        routeName: 'EL HUMO - TUCURRIQUE - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopId: -200012315,
        boardStopName: 'FRENTE LICORERA UJARRASQUENA',
        alightStopId: 141,
        alightStopName: 'Cartago-Orosi',
      },
    ],
  });
  const nearbyDirectReturn = makeJourney({
    id: 'penas-nearby-direct',
    kind: 'direct',
    routeName: 'Penas Blancas - Cartago',
    score: 134,
    originWalkMeters: 12,
    totalWalkMeters: 168,
    destinationWalkMeters: 136,
    legs: [
      {
        routeId: 81,
        routeName: 'PENAS BLANCAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopId: -200012393,
        boardStopName: 'FRENTE IGLESIA DE PENAS BLANCAS 2-1',
        alightStopId: 141,
        alightStopName: 'Cartago-Orosi',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [continuationTransfer, nearbyDirectReturn],
    origin: [-83.78481747, 9.82705109],
    destination: [-83.919373, 9.864429],
  });

  assert.equal(ranking.preferredJourneyId, 'penas-nearby-direct');
  assert.equal(
    ranking.debugById
      .get('penas-nearby-transfer')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-direct-alternative-transfer-penalty'),
    true,
  );
});

test('direct same-route alternative penalty does not fire when direct walk is much worse', () => {
  const transfer = makeJourney({
    id: 'useful-transfer',
    kind: 'transfer',
    routeName: 'Cartago Test luego Cartago Useful Branch',
    score: 30,
    totalWalkMeters: 120,
    destinationWalkMeters: 80,
    legs: [
      {
        routeId: 1,
        routeName: 'CARTAGO TEST',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopId: 10,
        boardStopName: 'Origen',
        alightStopId: 20,
        alightStopName: 'Transfer',
      },
      {
        routeId: 2,
        routeName: 'CARTAGO USEFUL BRANCH',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopId: 20,
        boardStopName: 'Transfer',
        alightStopId: 30,
        alightStopName: 'Destino',
      },
    ],
  });
  const poorDirect = makeJourney({
    id: 'poor-direct',
    kind: 'direct',
    routeName: 'Cartago Test',
    score: 32,
    totalWalkMeters: 1900,
    destinationWalkMeters: 1800,
    legs: [
      {
        routeId: 1,
        routeName: 'CARTAGO TEST',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopId: 10,
        boardStopName: 'Origen',
        alightStopId: 40,
        alightStopName: 'Far Stop',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [transfer, poorDirect],
    origin: [-83.919373, 9.864429],
    destination: [-83.91, 9.86],
  });

  assert.equal(ranking.preferredJourneyId, 'useful-transfer');
  assert.equal(
    ranking.debugById
      .get('useful-transfer')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-direct-alternative-transfer-penalty'),
    false,
  );
});

test('near same-corridor alternatives beat direct far drops', () => {
  const farDirect = makeJourney({
    id: 'san-pedro-far-direct',
    kind: 'direct',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    score: 85.4,
    originWalkMeters: 100,
    destinationWalkMeters: 2101,
    totalWalkMeters: 2201,
    legs: [
      {
        routeId: 4692,
        routeName: 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
        routeCode: '4692-direct-pattern',
        operator: 'RAPTOR local',
        boardStopName: 'San Blas',
        alightStopName: 'Buses hacia Curridabat por pista y Cartago',
      },
    ],
  });
  const nearTransfer = makeJourney({
    id: 'san-pedro-near-transfer',
    kind: 'transfer',
    routeName:
      'San Jose - San Pedro - Pista - Taras - Cartago luego San Pedro local connection',
    score: 95.5,
    originWalkMeters: 222,
    destinationWalkMeters: 196,
    totalWalkMeters: 418,
    legs: [
      {
        routeId: 4692,
        routeName: 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
        routeCode: '4692-transfer-pattern',
        operator: 'RAPTOR local',
        boardStopName: 'Cartago-Orosi',
        alightStopName: 'FRENTE AL RESTAURANTE PALMEADAS',
      },
      {
        routeId: 300,
        routeName: 'SAN PEDRO LOCAL CONNECTION',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'FRENTE AL RESTAURANTE PALMEADAS',
        alightStopName: 'Mall San Pedro',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [farDirect, nearTransfer],
    origin: [-83.919373, 9.864429],
    destination: [-84.0557, 9.934],
  });

  assert.equal(ranking.preferredJourneyId, 'san-pedro-near-transfer');
  assert.equal(
    ranking.debugById
      .get('san-pedro-far-direct')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-far-drop-near-alternative-penalty',
      ),
    true,
  );
});

test('near same-corridor alternatives beat 1km San Jose west final walks', () => {
  const sabanaFarDirect = makeJourney({
    id: 'sabana-far-direct',
    kind: 'direct',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    score: 93.9,
    originWalkMeters: 100,
    destinationWalkMeters: 1073,
    totalWalkMeters: 1587,
    legs: [
      {
        routeId: 4692,
        routeName: 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'San Blas',
        alightStopName: 'Parada Alajuela y Heredia',
      },
    ],
  });
  const sabanaConnector = makeJourney({
    id: 'sabana-connector',
    kind: 'transfer',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago luego San Jose - Sabana - Estadio',
    score: 113.6,
    originWalkMeters: 100,
    destinationWalkMeters: 188,
    totalWalkMeters: 459,
    legs: [
      {
        routeId: 4692,
        routeName: 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'San Blas',
        alightStopName: 'San Jose transfer',
      },
      {
        routeId: 17071,
        routeName: 'SAN JOSE - SABANA - ESTADIO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'San Jose transfer',
        alightStopName: 'En Estadio Nacional, frente a Canal 7',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [sabanaFarDirect, sabanaConnector],
    origin: [-83.919373, 9.864429],
    destination: [-84.1078, 9.9357],
    destinationName: 'ICE Sabana',
  });

  assert.equal(ranking.preferredJourneyId, 'sabana-connector');
  assert.equal(
    ranking.debugById
      .get('sabana-far-direct')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-far-drop-near-alternative-penalty',
      ),
    true,
  );
});

test('near Pavas connectors beat San Jose west final walks even with transfer walking', () => {
  const farDirect = makeJourney({
    id: 'estadio-far-direct',
    kind: 'direct',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    score: 84.2,
    originWalkMeters: 100,
    destinationWalkMeters: 1175,
    totalWalkMeters: 1275,
    legs: [
      {
        routeId: 4692,
        routeName: 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'San Blas',
        alightStopName: 'Parada Alajuela y Heredia',
      },
    ],
  });
  const pavasConnector = makeJourney({
    id: 'estadio-pavas-connector',
    kind: 'transfer',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago luego San Jose - Pavas Zona 2',
    score: 103.4,
    originWalkMeters: 100,
    destinationWalkMeters: 188,
    transferWalkMeters: 648,
    totalWalkMeters: 936,
    legs: [
      {
        routeId: 4692,
        routeName: 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'San Blas',
        alightStopName: 'San Jose transfer',
      },
      {
        routeId: 17145,
        routeName: 'SAN JOSE - PAVAS ZONA 2',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'San Jose transfer',
        alightStopName: 'EN BANCO IMPROSA',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [farDirect, pavasConnector],
    origin: [-83.919373, 9.864429],
    destination: [-84.107699, 9.936855],
    destinationName: 'Estadio Nacional',
  });

  assert.equal(ranking.preferredJourneyId, 'estadio-pavas-connector');
  assert.equal(
    ranking.debugById
      .get('estadio-far-direct')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-far-drop-near-alternative-penalty',
      ),
    true,
  );
});

test('near Pavas connectors beat ICE Sabana final walks with modest total-walk savings', () => {
  const farDirect = makeJourney({
    id: 'ice-far-direct',
    kind: 'direct',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    score: 81.5,
    originWalkMeters: 100,
    destinationWalkMeters: 1126,
    totalWalkMeters: 1226,
    legs: [
      {
        routeId: 4692,
        routeName: 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'San Blas',
        alightStopName: 'Parada Alajuela y Heredia',
      },
    ],
  });
  const pavasConnector = makeJourney({
    id: 'ice-pavas-connector',
    kind: 'transfer',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago luego San Jose - Pavas Zona 1',
    score: 105.7,
    originWalkMeters: 100,
    destinationWalkMeters: 210,
    transferWalkMeters: 647,
    totalWalkMeters: 957,
    legs: [
      {
        routeId: 4692,
        routeName: 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'San Blas',
        alightStopName: 'San Jose transfer',
      },
      {
        routeId: 17143,
        routeName: 'SAN JOSE - PAVAS ZONA 1',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'San Jose transfer',
        alightStopName: 'EN ESTADIO NACIONAL, FRENTE A CANAL 7',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [farDirect, pavasConnector],
    origin: [-83.919373, 9.864429],
    destination: [-84.1078, 9.9357],
    destinationName: 'ICE Sabana',
  });

  assert.equal(ranking.preferredJourneyId, 'ice-pavas-connector');
  assert.equal(
    ranking.debugById
      .get('ice-far-direct')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-far-drop-near-alternative-penalty',
      ),
    true,
  );
});

test('walk-dominant SJ connector alternatives beat slightly lower score worse walks', () => {
  const escazuFartherDrop = makeJourney({
    id: 'ice-escazu-farther-drop',
    kind: 'transfer',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago luego San Jose - Escazu Centro',
    score: 101.8,
    originWalkMeters: 100,
    destinationWalkMeters: 556,
    transferWalkMeters: 170,
    totalWalkMeters: 826,
    legs: [
      {
        routeId: 4692,
        routeName: 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'San Blas',
        alightStopName: 'San Jose transfer',
      },
      {
        routeId: 17240,
        routeName: 'SAN JOSE - ESCAZU CENTRO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'San Jose transfer',
        alightStopName: 'DIAGONAL COLEGIO DE MEDICOS',
      },
    ],
  });
  const closerDrop = makeJourney({
    id: 'ice-closer-walk',
    kind: 'transfer',
    routeName: 'Cartago-Ministerio De Salud En San Jose luego San Jose - Escazu Centro',
    score: 106.8,
    originWalkMeters: 100,
    destinationWalkMeters: 289,
    transferWalkMeters: 121,
    totalWalkMeters: 510,
    legs: [
      {
        routeId: 4700,
        routeName: 'CARTAGO-MINISTERIO DE SALUD EN SAN JOSE',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Cartago - Dulce Nombre',
        alightStopName: 'San Jose transfer',
      },
      {
        routeId: 17240,
        routeName: 'SAN JOSE - ESCAZU CENTRO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'San Jose transfer',
        alightStopName: 'DIAGONAL COLEGIO DE MEDICOS',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [escazuFartherDrop, closerDrop],
    origin: [-83.919373, 9.864429],
    destination: [-84.1078, 9.9357],
    destinationName: 'ICE Sabana',
  });

  assert.equal(ranking.preferredJourneyId, 'ice-closer-walk');
  assert.equal(
    ranking.debugById
      .get('ice-escazu-farther-drop')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-walk-dominant-alternative-penalty',
      ),
    true,
  );
});

test('walk-dominant alternatives can beat a direct local route with excessive final walking', () => {
  const laAngelinaFarWalk = makeJourney({
    id: 'basilica-la-angelina-far-walk',
    kind: 'direct',
    routeName: 'Cartago - La Angelina',
    score: 35.6,
    originWalkMeters: 638,
    destinationWalkMeters: 1082,
    transferWalkMeters: 0,
    totalWalkMeters: 1720,
    legs: [
      {
        routeId: 873,
        routeName: 'CARTAGO - LA ANGELINA',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'A un costado de la plaza de Taras',
        alightStopName: 'Terminal de Cartago buses Loyola',
      },
    ],
  });
  const tarasNearerWalk = makeJourney({
    id: 'basilica-taras-nearer-walk',
    kind: 'transfer',
    routeName: 'Cartago - Taras - San Nicolas luego Cartago-Ministerio De Salud En San Jose',
    score: 40.5,
    originWalkMeters: 328,
    destinationWalkMeters: 302,
    transferWalkMeters: 0,
    totalWalkMeters: 630,
    legs: [
      {
        routeId: 797,
        routeName: 'CARTAGO - TARAS - SAN NICOLAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Frente a Casa Fello Meza',
        alightStopName: 'Parada Cementerio General Tres Rios-Cartago',
      },
      {
        routeId: 4700,
        routeName: 'CARTAGO-MINISTERIO DE SALUD EN SAN JOSE',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Parada Cementerio General Tres Rios-Cartago',
        alightStopName: 'Parada UCR-Cartago',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [laAngelinaFarWalk, tarasNearerWalk],
    origin: [-83.9389683, 9.87829],
    destination: [-83.912982, 9.8640911],
    destinationName: 'Basilica de los Angeles',
  });

  assert.equal(ranking.preferredJourneyId, 'basilica-taras-nearer-walk');
  assert.equal(
    ranking.debugById
      .get('basilica-la-angelina-far-walk')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-walk-dominant-alternative-penalty',
      ),
    true,
  );
});

test('San Pedro outward destination prefers nearby San Pedro drops over far Ministerio drops', () => {
  const ministerioFarDrop = makeJourney({
    id: 'ministerio-far-drop',
    kind: 'direct',
    routeName: 'Cartago-Ministerio De Salud En San Jose',
    score: 95,
    originWalkMeters: 561,
    destinationWalkMeters: 2101,
    totalWalkMeters: 2662,
    legs: [
      {
        routeId: 4693,
        routeName: 'CARTAGO-MINISTERIO DE SALUD EN SAN JOSE',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Parada UCR-Cartago',
        alightStopName: 'Buses hacia Curridabat por pista y Cartago',
      },
    ],
  });
  const sanPedroNearDrop = makeJourney({
    id: 'san-pedro-near-drop',
    kind: 'transfer',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago luego Turrialba - San Jose Expreso',
    score: 98.3,
    originWalkMeters: 598,
    destinationWalkMeters: 196,
    totalWalkMeters: 794,
    legs: [
      {
        routeId: 4692,
        routeName: 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Cartago - Dulce Nombre',
        alightStopName: 'FRENTE AL RESTAURANTE PALMEADAS',
      },
      {
        routeId: 302,
        routeName: 'TURRIALBA - SAN JOSE EXPRESO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'FRENTE AL RESTAURANTE PALMEADAS',
        alightStopName: 'Mall San Pedro',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [ministerioFarDrop, sanPedroNearDrop],
    origin: [-83.919373, 9.864429],
    destination: [-84.0557, 9.934],
  });

  assert.equal(ranking.preferredJourneyId, 'san-pedro-near-drop');
  assert.equal(
    ranking.debugById
      .get('ministerio-far-drop')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-san-pedro-outward-far-drop-penalty',
      ),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('san-pedro-near-drop')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-san-pedro-outward-corridor-bonus',
      ),
    true,
  );
});

test('Ochomogo destination avoids Turrialba express local hop when Moovit-backed corridor alternative exists', () => {
  const turrialbaExpressHop = makeJourney({
    id: 'ochomogo-turrialba-expreso',
    routeName: 'Turrialba - San Jose Expreso',
    score: 50.9,
    originWalkMeters: 462,
    destinationWalkMeters: 386,
    totalWalkMeters: 848,
  });
  const neighboringLongWalk = makeJourney({
    id: 'ochomogo-neighboring-long-walk',
    routeName: 'Cartago - El Carmen - Quircot - San Rafael',
    score: 51.4,
    originWalkMeters: 1348,
    destinationWalkMeters: 620,
    totalWalkMeters: 1968,
  });
  const sanJoseTarasCorridor = makeJourney({
    id: 'ochomogo-san-jose-taras',
    kind: 'transfer',
    routeName: 'San Rafael De Oreamuno - Parque Industrial luego San Jose - San Pedro - Tres Rios - Taras - Cartago',
    score: 52.4,
    originWalkMeters: 381,
    destinationWalkMeters: 280,
    totalWalkMeters: 661,
  });

  const ranking = rankRaptorJourneys({
    journeys: [turrialbaExpressHop, neighboringLongWalk, sanJoseTarasCorridor],
    origin: [-83.9124, 9.8642],
    destination: [OCHOMOGO_BOX.centerLng, OCHOMOGO_BOX.centerLat],
    destinationName: 'Escuela Ochomogo',
  });

  assert.equal(ranking.preferredJourneyId, 'ochomogo-san-jose-taras');
  assert.equal(
    ranking.debugById
      .get('ochomogo-turrialba-expreso')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-rio-loro-turrialba-express-local-hop',
      ),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('ochomogo-neighboring-long-walk')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-ochomogo-nonmatching-penalty'),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('ochomogo-san-jose-taras')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-ochomogo-corridor-bonus'),
    true,
  );
});

test('Parque La Paz destination prefers Moovit-backed Paso Ancho/Seminario connector over long final walk', () => {
  const longWalk = makeJourney({
    id: 'parque-la-paz-long-walk',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    score: 79.9,
    originWalkMeters: 100,
    destinationWalkMeters: 1434,
    totalWalkMeters: 1534,
  });
  const seminarioConnector = makeJourney({
    id: 'parque-la-paz-seminario',
    kind: 'transfer',
    routeName: 'Cartago-Ministerio De Salud En San Jose luego San Jose - Monte Azul - Seminario - Loma Linda - Madeiras',
    score: 109,
    originWalkMeters: 222,
    destinationWalkMeters: 133,
    transferWalkMeters: 592,
    totalWalkMeters: 947,
    legs: [
      {
        routeId: 4693,
        routeName: 'CARTAGO-MINISTERIO DE SALUD EN SAN JOSE',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Cartago - Dulce Nombre',
        alightStopName: 'Terminal buses Escazu',
      },
      {
        routeId: 17232,
        routeName: 'SAN JOSE - MONTE AZUL - SEMINARIO - LOMA LINDA - MADEIRAS',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'TERMINAL MADEIRA -SJ SENTIDO 2-1',
        alightStopName: 'FRENTE A ILG',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [longWalk, seminarioConnector],
    origin: [-83.919373, 9.864429],
    destination: [-84.079, 9.913],
    destinationName: 'Parque La Paz',
  });

  assert.equal(ranking.preferredJourneyId, 'parque-la-paz-seminario');
  assert.equal(
    ranking.debugById
      .get('parque-la-paz-long-walk')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-sj-parque-la-paz-far-drop-penalty',
      ),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('parque-la-paz-seminario')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-sj-parque-la-paz-corridor-bonus',
      ),
    true,
  );
});

test('San Jose Guadalupe destination prefers Barrio Pilar connector over long San Pedro drop', () => {
  const longWalk = makeJourney({
    id: 'sj-guadalupe-long-walk',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    score: 116.9,
    originWalkMeters: 222,
    destinationWalkMeters: 1698,
    totalWalkMeters: 1920,
  });
  const barrioPilarConnector = makeJourney({
    id: 'sj-guadalupe-barrio-pilar',
    kind: 'transfer',
    routeName: 'Turrialba - San Jose Colectivo luego San Jose - Guadalupe - Barrio Pilar',
    score: 169.4,
    originWalkMeters: 594,
    destinationWalkMeters: 170,
    transferWalkMeters: 0,
    totalWalkMeters: 764,
    legs: [
      {
        routeId: 302,
        routeName: 'TURRIALBA - SAN JOSE COLECTIVO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Cartago-Orosi',
        alightStopName: 'Terminal San Jose',
      },
      {
        routeId: 17230,
        routeName: 'SAN JOSE - GUADALUPE - BARRIO PILAR',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Terminal San Jose',
        alightStopName: 'DIAGONAL A RADIO MARIA',
      },
    ],
  });
  const moraviaApproximation = makeJourney({
    id: 'sj-guadalupe-moravia-approximation',
    kind: 'transfer',
    routeName: 'Turrialba - San Jose Colectivo luego San Jose - Moravia - Dulce Nombre De Coronado',
    score: 156.6,
    originWalkMeters: 594,
    destinationWalkMeters: 464,
    transferWalkMeters: 0,
    totalWalkMeters: 1058,
    legs: [
      {
        routeId: 302,
        routeName: 'TURRIALBA - SAN JOSE COLECTIVO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Cartago-Orosi',
        alightStopName: 'Terminal San Jose',
      },
      {
        routeId: 17250,
        routeName: 'SAN JOSE - MORAVIA - DULCE NOMBRE DE CORONADO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Terminal San Jose',
        alightStopName: 'ATRA DEL CENTRO DE RECURSOS INCLUSIVOS CENTENO WELL',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [longWalk, barrioPilarConnector, moraviaApproximation],
    origin: [-83.919373, 9.864429],
    destination: [-84.056, 9.948],
    destinationName: 'Guadalupe centro',
  });

  assert.equal(ranking.preferredJourneyId, 'sj-guadalupe-barrio-pilar');
  assert.equal(
    ranking.debugById
      .get('sj-guadalupe-long-walk')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-sj-guadalupe-far-drop-penalty',
      ),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('sj-guadalupe-barrio-pilar')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-sj-guadalupe-corridor-bonus',
      ),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('sj-guadalupe-moravia-approximation')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-sj-guadalupe-moravia-secondary-penalty',
      ),
    true,
  );
});

test('near alternative penalty does not fire for unrelated route families', () => {
  const farDirect = makeJourney({
    id: 'far-direct',
    kind: 'direct',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    score: 85,
    destinationWalkMeters: 2100,
    totalWalkMeters: 2200,
  });
  const unrelatedNear = makeJourney({
    id: 'unrelated-near',
    kind: 'transfer',
    routeName: 'Cartago - Guadalupe luego Cartago - Llano Grande',
    score: 95,
    destinationWalkMeters: 150,
    totalWalkMeters: 350,
    legs: [
      {
        routeId: 1,
        routeName: 'CARTAGO - GUADALUPE',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Origen',
        alightStopName: 'Transfer',
      },
      {
        routeId: 2,
        routeName: 'CARTAGO - LLANO GRANDE',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Transfer',
        alightStopName: 'Destino',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [farDirect, unrelatedNear],
    origin: [-83.919373, 9.864429],
    destination: [-84.0557, 9.934],
  });

  assert.equal(
    ranking.debugById
      .get('far-direct')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-far-drop-near-alternative-penalty',
      ),
    false,
  );
});

test('near alternative penalty does not fire when direct final walk is acceptable', () => {
  const usableDirect = makeJourney({
    id: 'usable-direct',
    kind: 'direct',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    score: 85,
    destinationWalkMeters: 850,
    totalWalkMeters: 1000,
  });
  const nearTransfer = makeJourney({
    id: 'near-transfer',
    kind: 'transfer',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago luego San Pedro local',
    score: 90,
    destinationWalkMeters: 180,
    totalWalkMeters: 350,
    legs: [
      {
        routeId: 4692,
        routeName: 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Origen',
        alightStopName: 'Transfer',
      },
      {
        routeId: 300,
        routeName: 'SAN PEDRO LOCAL',
        routeCode: null,
        operator: 'RAPTOR local',
        boardStopName: 'Transfer',
        alightStopName: 'Destino',
      },
    ],
  });

  const ranking = rankRaptorJourneys({
    journeys: [usableDirect, nearTransfer],
    origin: [-83.919373, 9.864429],
    destination: [-84.0557, 9.934],
  });

  assert.equal(
    ranking.debugById
      .get('usable-direct')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-far-drop-near-alternative-penalty',
      ),
    false,
  );
});

test('FU4 corridor reasons do not fire on nearby non-target controls', () => {
  const paraisoJourneys = [
    makeJourney({
      id: 'paraiso',
      routeName: 'Cartago - Paraiso - Birrisito - Cervantes - Bajo Cervantes',
      destinationWalkMeters: 120,
    }),
    makeJourney({
      id: 'san-isidro',
      routeName: 'Cartago - San Isidro De Tejar',
      destinationWalkMeters: 120,
    }),
  ];
  const laCampinaJourneys = [
    makeJourney({
      id: 'la-campina',
      routeName: 'Cartago-Guayabal-La Campina Por Asuncion',
      destinationWalkMeters: 80,
    }),
    makeJourney({
      id: 'lourdes',
      routeName: 'Cartago - Agua Caliente - Lourdes',
      destinationWalkMeters: 80,
    }),
  ];

  assert.equal(
    hasReasonPrefix(paraisoJourneys, [-83.865581, 9.838231], 'raptor-tejar-east-'),
    false,
  );
  assert.equal(
    hasReasonPrefix(paraisoJourneys, [-83.865581, 9.838231], 'raptor-lourdes-'),
    false,
  );
  assert.equal(
    hasReasonPrefix(laCampinaJourneys, [-83.9364834537593, 9.83770228559147], 'raptor-tejar-east-'),
    false,
  );
  assert.equal(
    hasReasonPrefix(laCampinaJourneys, [-83.9364834537593, 9.83770228559147], 'raptor-lourdes-'),
    false,
  );
  assert.equal(
    hasReasonPrefix(paraisoJourneys, [-83.80707509, 9.82731855], 'raptor-loaiza-'),
    false,
  );
  assert.equal(
    hasReasonPrefix(paraisoJourneys, [-83.78481747, 9.82705109], 'raptor-loaiza-'),
    false,
  );
  assert.equal(
    hasReasonPrefix(paraisoJourneys, [-83.80707509, 9.82731855], 'raptor-el-humo-'),
    false,
  );
  assert.equal(
    hasReasonPrefix(paraisoJourneys, [-83.910782, 9.9412609], 'raptor-llano-grande-school-'),
    false,
  );
  assert.equal(destinationInBox([-83.906791, 9.937464], LLANO_GRANDE_SCHOOL_BOX), true);
  assert.equal(destinationInBox([-83.910782, 9.9412609], LLANO_GRANDE_SCHOOL_BOX), false);
});
