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

test('sanatorio terminal preference ranks Tierra Blanca terminal over Cruce Sanatorio', () => {
  const chicuaJourney = makeJourney({
    id: 'chicua',
    routeName: 'Lourdes - El Covao luego Cartago - San Juan De Chicua - La Pastora - Volcan Irazu',
    dropStopName: 'CRUCE SANATORIO',
    score: 80,
  });
  const tierraBlancaJourney = makeJourney({
    id: 'tierra-blanca',
    routeName: 'Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio',
    dropStopName: 'TERMINAL SANATORIO DE DURAN',
    score: 90,
  });

  const ranking = rankRaptorJourneys({
    journeys: [chicuaJourney, tierraBlancaJourney],
    origin: [-83.919373, 9.864429],
    destination: [-83.885614, 9.936879],
    destinationName: 'Sanatorio Duran',
  });
  const chicuaDebug = ranking.debugById.get('chicua');
  const tierraBlancaDebug = ranking.debugById.get('tierra-blanca');

  assert.equal(ranking.ranked[0]?.id, 'tierra-blanca');
  assert.ok(chicuaDebug);
  assert.ok(tierraBlancaDebug);
  assert.equal(
    chicuaDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-sanatorio-cruce-instead-of-terminal',
    ),
    true,
  );
  assert.equal(
    tierraBlancaDebug.raptorPolishReasons.some(
      (reason) =>
        reason.id === 'raptor-sanatorio-terminal-corridor-bonus' && reason.penalty < 0,
    ),
    true,
  );
});

test('Prusia west pin prefers Sanatorio over the Volcan Irazu road branch', () => {
  const volcanIrazu = makeJourney({
    id: 'volcan-irazu',
    routeName: 'Cartago - San Juan De Chicua - La Pastora - Volcan Irazu',
    dropStopName: 'ENTRADA LAS VIVIENDAS',
    score: 112,
    destinationWalkMeters: 1764,
    totalWalkMeters: 1764,
  });
  const sanatorio = makeJourney({
    id: 'sanatorio',
    routeName: 'Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio',
    dropStopName: 'TERMINAL SANATORIO DE DURAN',
    score: 128,
    destinationWalkMeters: 1970,
    totalWalkMeters: 1970,
  });

  const ranking = rankRaptorJourneys({
    journeys: [volcanIrazu, sanatorio],
    origin: [-83.923164, 9.862138],
    destination: [-83.88125895327642, 9.953845289007294],
    destinationName: 'Pin oeste Volcan Irazu',
  });

  assert.equal(ranking.ranked[0]?.id, 'sanatorio');
  assert.equal(
    ranking.debugById
      .get('volcan-irazu')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-prusia-west-volcan-branch-penalty'),
    true,
  );
});

test('Prusia west preference does not demote Volcan Irazu for the actual volcano destination', () => {
  const volcanIrazu = makeJourney({
    id: 'volcan-irazu',
    routeName: 'Cartago - San Juan De Chicua - La Pastora - Volcan Irazu',
    dropStopName: 'VOLCAN IRAZU',
    score: 112,
  });
  const sanatorio = makeJourney({
    id: 'sanatorio',
    routeName: 'Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio',
    dropStopName: 'TERMINAL SANATORIO DE DURAN',
    score: 128,
  });

  const ranking = rankRaptorJourneys({
    journeys: [volcanIrazu, sanatorio],
    origin: [-83.923164, 9.862138],
    destination: [-83.84487054, 9.9778156],
    destinationName: 'Parque Nacional Volcan Irazu',
  });

  assert.equal(ranking.ranked[0]?.id, 'volcan-irazu');
  assert.equal(
    ranking.debugById
      .get('volcan-irazu')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-prusia-west-volcan-branch-penalty'),
    false,
  );
});

test('sanatorio terminal preference does not fire outside the Sanatorio destination box', () => {
  const chicuaJourney = makeJourney({
    id: 'chicua',
    routeName: 'Lourdes - El Covao luego Cartago - San Juan De Chicua - La Pastora - Volcan Irazu',
    dropStopName: 'CRUCE SANATORIO',
    score: 80,
  });
  const tierraBlancaJourney = makeJourney({
    id: 'tierra-blanca',
    routeName: 'Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio',
    dropStopName: 'TERMINAL SANATORIO DE DURAN',
    score: 90,
  });

  const ranking = rankRaptorJourneys({
    journeys: [chicuaJourney, tierraBlancaJourney],
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
        'raptor-sanatorio-cruce-instead-of-terminal',
        'raptor-sanatorio-terminal-corridor-bonus',
      ].includes(reason.id),
    ),
    false,
  );
});
