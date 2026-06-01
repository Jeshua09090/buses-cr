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

test('destination-aware hints cancel Orosi detour reasons for Orosi destinations', () => {
  const orosiJourney = makeJourney({
    id: 'orosi',
    routeName: 'Parque Industrial - Cartago - Orosi - Rio Macho',
    score: 70,
  });

  const ranking = rankRaptorJourneys({
    journeys: [orosiJourney],
    origin: [-83.919373, 9.864429],
    destination: [-83.853, 9.797],
    destinationName: null,
  });
  const debug = ranking.debugById.get('orosi');

  assert.ok(debug);
  assert.equal(debug.reasons.some((reason) => reason.id === 'medium-interurban-OROSI'), false);
  assert.equal(debug.reasons.some((reason) => reason.id === 'medium-interurban-RIO MACHO'), false);
  assert.equal(
    debug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-cancel-medium-interurban-OROSI' && reason.penalty < 0,
    ),
    true,
  );
});

test('destination-aware hints keep Orosi detour reasons outside Orosi destinations', () => {
  const orosiJourney = makeJourney({
    id: 'orosi',
    routeName: 'Parque Industrial - Cartago - Orosi - Rio Macho',
    score: 70,
  });

  const ranking = rankRaptorJourneys({
    journeys: [orosiJourney],
    origin: [-83.919373, 9.864429],
    destination: [-83.919373, 9.864429],
    destinationName: null,
  });
  const debug = ranking.debugById.get('orosi');

  assert.ok(debug);
  assert.equal(debug.reasons.some((reason) => reason.id === 'medium-interurban-OROSI'), true);
  assert.equal(
    debug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-cancel-medium-interurban-OROSI',
    ),
    false,
  );
});

test('destination-aware hints cancel Orosi/Rio Macho reasons for Tapanti destinations', () => {
  const tapantiJourney = makeJourney({
    id: 'tapanti',
    routeName: 'Cartago - Orosi - Rio Macho - Purisil',
    score: 70,
  });

  const ranking = rankRaptorJourneys({
    journeys: [tapantiJourney],
    origin: [-83.923164, 9.862138],
    destination: [-83.78541, 9.76586],
    destinationName: 'Parque Nacional Tapanti',
  });
  const debug = ranking.debugById.get('tapanti');

  assert.ok(debug);
  assert.equal(debug.reasons.some((reason) => reason.id === 'medium-interurban-OROSI'), false);
  assert.equal(debug.reasons.some((reason) => reason.id === 'medium-interurban-RIO MACHO'), false);
  assert.equal(debug.totalContextPenalty, 0);
});

test('destination-aware hints prefer the Paraiso trunk for Paraiso destinations', () => {
  const paraisoTrunk = makeJourney({
    id: 'paraiso',
    routeName: 'Cartago - Paraiso',
    score: 50,
  });
  const orosiViaParaiso = makeJourney({
    id: 'orosi-via-paraiso',
    routeName: 'Parque Industrial - Cartago - Orosi - Rio Macho',
    score: 48,
  });

  const ranking = rankRaptorJourneys({
    journeys: [orosiViaParaiso, paraisoTrunk],
    origin: [-83.919373, 9.864429],
    destination: [-83.865581, 9.838231],
    destinationName: 'Parque de Paraiso',
  });
  const paraisoDebug = ranking.debugById.get('paraiso');

  assert.equal(ranking.ranked[0]?.id, 'paraiso');
  assert.ok(paraisoDebug);
  assert.equal(
    paraisoDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-paraiso-trunk-name-match' && reason.penalty === -3,
    ),
    true,
  );
});

test('Terramall destination keeps San Jose-Tejar secondary when San Pedro/Tres Rios drops nearby', () => {
  const sanJoseTejar = makeJourney({
    id: 'san-jose-tejar',
    routeName: 'San Jose-Tejar',
    score: 33.9,
    originWalkMeters: 311,
    destinationWalkMeters: 242,
    totalWalkMeters: 553,
  });
  const turrialbaExpress = makeJourney({
    id: 'turrialba-express',
    routeName: 'Turrialba - San Jose Expreso',
    score: 37.9,
    originWalkMeters: 486,
    destinationWalkMeters: 242,
    totalWalkMeters: 728,
  });
  const sanPedro = makeJourney({
    id: 'san-pedro-terramall',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    score: 38.9,
    originWalkMeters: 486,
    destinationWalkMeters: 242,
    totalWalkMeters: 728,
  });

  const ranking = rankRaptorJourneys({
    journeys: [sanJoseTejar, turrialbaExpress, sanPedro],
    origin: [-83.9389683, 9.87829],
    destination: [-83.9844, 9.9057],
    destinationName: 'Terramall',
  });

  assert.equal(ranking.preferredJourneyId, 'san-pedro-terramall');
  assert.equal(
    ranking.debugById
      .get('san-jose-tejar')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-terramall-tejar-secondary-penalty',
      ),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('turrialba-express')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-terramall-tejar-secondary-penalty',
      ),
    true,
  );
});

test('Terramall destination keeps ITCR/San Jose secondary when San Pedro/Tres Rios drops nearby', () => {
  const itcrSanJose = makeJourney({
    id: 'itcr-san-jose-terramall',
    routeName: 'ITCR - San Jose',
    score: 32.9,
    originWalkMeters: 313,
    destinationWalkMeters: 242,
    totalWalkMeters: 555,
  });
  const cartagoTresRios = makeJourney({
    id: 'cartago-tres-rios-terramall',
    routeName: 'Cartago - Tres Rios Por La Lima',
    score: 39.5,
    originWalkMeters: 311,
    destinationWalkMeters: 248,
    totalWalkMeters: 559,
  });
  const sanPedro = makeJourney({
    id: 'san-pedro-terramall',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    score: 38.9,
    originWalkMeters: 486,
    destinationWalkMeters: 242,
    totalWalkMeters: 728,
  });

  const ranking = rankRaptorJourneys({
    journeys: [itcrSanJose, cartagoTresRios, sanPedro],
    origin: [-83.9389683, 9.87829],
    destination: [-83.9844, 9.9057],
    destinationName: 'Terramall',
  });

  assert.equal(ranking.preferredJourneyId, 'san-pedro-terramall');
  assert.equal(
    ranking.debugById
      .get('itcr-san-jose-terramall')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-terramall-tejar-secondary-penalty',
      ),
    true,
  );
});

test('Terramall destination accepts Mapbox-network final walks around the mall', () => {
  const itcrSanJose = makeJourney({
    id: 'itcr-san-jose-terramall',
    routeName: 'ITCR - San Jose',
    score: 34.9,
    originWalkMeters: 354,
    destinationWalkMeters: 403,
    totalWalkMeters: 757,
  });
  const sanPedro = makeJourney({
    id: 'san-pedro-terramall',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    score: 40.9,
    originWalkMeters: 486,
    destinationWalkMeters: 403,
    totalWalkMeters: 889,
  });

  const ranking = rankRaptorJourneys({
    journeys: [itcrSanJose, sanPedro],
    origin: [-83.9389683, 9.87829],
    destination: [-83.9844, 9.9057],
    destinationName: 'Terramall',
  });

  assert.equal(ranking.preferredJourneyId, 'san-pedro-terramall');
  assert.equal(
    ranking.debugById
      .get('itcr-san-jose-terramall')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-terramall-tejar-secondary-penalty',
      ),
    true,
  );
});

test('Basilica destination prefers Dulce Nombre boarding over farther Blanquillo boarding', () => {
  const blanquilloFarBoard = makeJourney({
    id: 'blanquillo-far-board',
    routeName: 'Blanquillo - Cartago',
    score: 34.6,
    originWalkMeters: 502,
    destinationWalkMeters: 226,
    totalWalkMeters: 728,
  });
  const dulceNombreNearBoard = makeJourney({
    id: 'dulce-nombre-near-board',
    routeName: 'Dulce Nombre - Caballo Blanco - Cartago',
    score: 40.1,
    originWalkMeters: 218,
    destinationWalkMeters: 226,
    totalWalkMeters: 444,
  });

  const ranking = rankRaptorJourneys({
    journeys: [blanquilloFarBoard, dulceNombreNearBoard],
    origin: [-83.90865325927734, 9.84384822845459],
    destination: [-83.9124, 9.8642],
    destinationName: 'Basilica de Los Angeles',
  });

  assert.equal(ranking.preferredJourneyId, 'dulce-nombre-near-board');
  assert.equal(
    ranking.debugById
      .get('blanquillo-far-board')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-basilica-farther-board-penalty',
      ),
    true,
  );
});

test('TEC destination prefers ITCR campus drop over a far central Cartago drop', () => {
  const centralCartagoDrop = makeJourney({
    id: 'central-cartago-drop',
    routeName: 'Llano Grande - Cartago luego San Jose - San Pedro - Tres Rios - Taras - Cartago',
    score: 50,
    originWalkMeters: 321,
    destinationWalkMeters: 974,
    transferWalkMeters: 233,
    totalWalkMeters: 1528,
  });
  const itcrCampusDrop = makeJourney({
    id: 'itcr-campus-drop',
    routeName: 'Llano Grande - Cartago luego San Jose - ITCR',
    score: 90,
    originWalkMeters: 321,
    destinationWalkMeters: 210,
    transferWalkMeters: 964,
    totalWalkMeters: 1495,
  });

  const ranking = rankRaptorJourneys({
    journeys: [centralCartagoDrop, itcrCampusDrop],
    origin: [-83.906791, 9.937464],
    destination: [-83.9124243, 9.8554619],
    destinationName: 'TEC Cartago',
  });

  assert.equal(ranking.ranked[0]?.id, 'itcr-campus-drop');
  assert.equal(
    ranking.debugById
      .get('central-cartago-drop')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-tec-itcr-far-drop-penalty'),
    true,
  );
  assert.equal(
    ranking.debugById
      .get('itcr-campus-drop')
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-tec-itcr-campus-bonus'),
    true,
  );
});

test('TEC destination prefers a closer board stop when ITCR drops are equivalent', () => {
  const farBoardItcr = makeJourney({
    id: 'far-board-itcr',
    routeName: 'Cartago - La Angelina luego San Jose - ITCR',
    score: 121.1,
    originWalkMeters: 1622,
    destinationWalkMeters: 210,
    transferWalkMeters: 259,
    totalWalkMeters: 2090,
  });
  const nearBoardItcr = makeJourney({
    id: 'near-board-itcr',
    routeName: 'Llano Grande - Cartago luego San Jose - ITCR',
    score: 129.1,
    originWalkMeters: 666,
    destinationWalkMeters: 210,
    transferWalkMeters: 619,
    totalWalkMeters: 1495,
  });

  const ranking = rankRaptorJourneys({
    journeys: [farBoardItcr, nearBoardItcr],
    origin: [-83.910782, 9.9412609],
    destination: [-83.9124243, 9.8554619],
    destinationName: 'TEC Cartago',
  });

  assert.equal(ranking.ranked[0]?.id, 'near-board-itcr');
  assert.equal(
    ranking.debugById
      .get('far-board-itcr')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-tec-itcr-farther-board-penalty',
      ),
    true,
  );
});

test('destination-aware hints demote Orosi/Rio Macho when a local Paraiso branch drops nearby', () => {
  const orosiViaParaiso = makeJourney({
    id: 'orosi-via-paraiso',
    kind: 'transfer',
    routeName: 'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Orosi - Rio Macho',
    score: 75.2,
    originWalkMeters: 108,
    destinationWalkMeters: 47,
    transferWalkMeters: 0,
    totalWalkMeters: 155,
  });
  const localParaiso = makeJourney({
    id: 'local-paraiso',
    kind: 'transfer',
    routeName:
      'Cartago - Taras - San Nicolas luego Parque Industrial - Cartago - Paraiso - Birrisito - Cervantes - Santiago',
    score: 90.5,
    originWalkMeters: 348,
    destinationWalkMeters: 47,
    transferWalkMeters: 115,
    totalWalkMeters: 511,
  });

  const ranking = rankRaptorJourneys({
    journeys: [orosiViaParaiso, localParaiso],
    origin: [-83.9389683, 9.87829],
    destination: [-83.8664324, 9.8392523],
    destinationName: 'Paraiso centro',
  });
  const orosiDebug = ranking.debugById.get('orosi-via-paraiso');

  assert.equal(ranking.ranked[0]?.id, 'local-paraiso');
  assert.ok(orosiDebug);
  assert.equal(
    orosiDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-paraiso-local-overbranch-penalty',
    ),
    true,
  );
});
