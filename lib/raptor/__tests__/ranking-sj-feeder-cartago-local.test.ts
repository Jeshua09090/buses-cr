import assert from 'node:assert/strict';
import test from 'node:test';

import type { JourneyLeg, PlannedJourney } from '@/lib/journey-planner';
import type { Parada } from '@/lib/paradas';

import { rankRaptorJourneys } from '../journey-ranking';
import { buildSjFeederCartagoLocalReasons } from '../ranking/sj-feeder-cartago-local';

const SANATORIO_DESTINATION: [number, number] = [-83.880095, 9.931869];
const TOBOSI_DESTINATION: [number, number] = [-83.945, 9.84];
const CARTAGO_CENTRO_DESTINATION: [number, number] = [-83.919373, 9.864429];

function parada(nombre: string, lat: number, lng: number): Parada {
  return {
    parada_id: Math.abs(nombre.length),
    nombre,
    lat,
    lng,
    tiene_techo: null,
    accesible: null,
  };
}

const TARAS = parada('Taras', 9.878, -83.939);
const CARTAGO_CENTRO = parada('Cartago centro', 9.864, -83.919);
const SAN_JOSE = parada('San Jose', 9.933, -84.078);
const SANATORIO = parada('Terminal Sanatorio', 9.931869, -83.880095);
const TOBOSI = parada('Tobosi', 9.84, -83.945);

function makeLeg(routeName: string, boardStop: Parada, alightStop: Parada): JourneyLeg {
  return {
    routeId: Math.abs(routeName.length),
    routeName,
    routeCode: null,
    operator: 'RAPTOR local',
    boardStopName: boardStop.nombre,
    alightStopName: alightStop.nombre,
    boardStop,
    alightStop,
  };
}

function makeJourney(overrides: Partial<PlannedJourney> = {}): PlannedJourney {
  const legs = overrides.legs ?? [makeLeg('Cartago Test', TARAS, CARTAGO_CENTRO)];
  const routeName = overrides.routeName ?? legs.map((leg) => leg.routeName).join(' luego ');

  return {
    id: overrides.id ?? 'journey-a',
    kind: overrides.kind ?? (legs.length > 1 ? 'transfer' : 'direct'),
    routeId: overrides.routeId ?? legs[0]?.routeId ?? 1,
    routeName,
    routeCode: overrides.routeCode ?? null,
    operatorLabel: overrides.operatorLabel ?? 'RAPTOR local',
    routeIds: overrides.routeIds ?? legs.map((leg) => leg.routeId),
    routeCodes: overrides.routeCodes ?? [],
    legs,
    originWalkMeters: overrides.originWalkMeters ?? 0,
    destinationWalkMeters: overrides.destinationWalkMeters ?? 0,
    transferWalkMeters: overrides.transferWalkMeters ?? 0,
    totalWalkMeters: overrides.totalWalkMeters ?? 0,
    totalFare: overrides.totalFare ?? null,
    score: overrides.score ?? 10,
    boardStopName: overrides.boardStopName ?? legs[0]?.boardStopName ?? 'Origen',
    dropStopName: overrides.dropStopName ?? legs.at(-1)?.alightStopName ?? 'Destino',
    transferLabel: overrides.transferLabel ?? null,
    geoMetrics: overrides.geoMetrics ?? null,
  };
}

function sanatorioSjFeeder(overrides: Partial<PlannedJourney> = {}) {
  return makeJourney({
    id: 'sj-feeder-sanatorio',
    kind: 'transfer',
    legs: [
      makeLeg('San Jose - San Pedro - Tres Rios - La Lima - Cartago', TARAS, CARTAGO_CENTRO),
      makeLeg('Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio', CARTAGO_CENTRO, SANATORIO),
    ],
    score: 75,
    ...overrides,
  });
}

function sanatorioLocalFeeder(overrides: Partial<PlannedJourney> = {}) {
  return makeJourney({
    id: 'local-feeder-sanatorio',
    kind: 'transfer',
    legs: [
      makeLeg('Cartago - Taras - San Nicolas', TARAS, CARTAGO_CENTRO),
      makeLeg('Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio', CARTAGO_CENTRO, SANATORIO),
    ],
    score: 88,
    ...overrides,
  });
}

test('Sanatorio SJ feeder is demoted when a local feeder alternative exists', () => {
  const sjFeeder = sanatorioSjFeeder();
  const localFeeder = sanatorioLocalFeeder();
  const reasons = buildSjFeederCartagoLocalReasons({
    journey: sjFeeder,
    destination: SANATORIO_DESTINATION,
    ranked: [sjFeeder, localFeeder],
  });
  const localReasons = buildSjFeederCartagoLocalReasons({
    journey: localFeeder,
    destination: SANATORIO_DESTINATION,
    ranked: [sjFeeder, localFeeder],
  });
  const ranking = rankRaptorJourneys({
    journeys: [sjFeeder, localFeeder],
    origin: [-83.939, 9.878],
    destination: SANATORIO_DESTINATION,
    destinationName: 'Sanatorio Duran',
  });

  assert.equal(reasons.length, 1);
  assert.equal(reasons[0]?.id, 'raptor-sj-feeder-when-local-available-for-cartago-dest');
  assert.equal(reasons[0]?.penalty, 50);
  assert.equal(
    ranking.debugById
      .get(sjFeeder.id)
      ?.raptorPolishReasons.some((reason) => reason.id === 'raptor-national-feeder-when-local-available'),
    true,
  );
  assert.deepEqual(localReasons, []);
  assert.equal(ranking.ranked[0]?.id, 'local-feeder-sanatorio');
});

test('long SJ ride does not trigger the local feeder penalty', () => {
  const longSjRide = sanatorioSjFeeder({
    legs: [
      makeLeg('San Jose - San Pedro - Tres Rios - La Lima - Cartago', SAN_JOSE, CARTAGO_CENTRO),
      makeLeg('Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio', CARTAGO_CENTRO, SANATORIO),
    ],
  });

  assert.deepEqual(
    buildSjFeederCartagoLocalReasons({
      journey: longSjRide,
      destination: SANATORIO_DESTINATION,
      ranked: [longSjRide, sanatorioLocalFeeder()],
    }),
    [],
  );
});

test('SJ feeder gets a smaller penalty when no non-interurban alternative exists', () => {
  const sjFeeder = sanatorioSjFeeder();
  const reasons = buildSjFeederCartagoLocalReasons({
    journey: sjFeeder,
    destination: SANATORIO_DESTINATION,
    ranked: [sjFeeder],
  });

  assert.equal(reasons.length, 1);
  assert.equal(reasons[0]?.id, 'raptor-sj-feeder-cartago-dest-no-alternative');
  assert.equal(reasons[0]?.penalty, 30);
});

test('long SJ ride without an alternative does not trigger the no-alternative penalty', () => {
  const longSjRide = sanatorioSjFeeder({
    legs: [
      makeLeg('San Jose - San Pedro - Tres Rios - La Lima - Cartago', SAN_JOSE, CARTAGO_CENTRO),
      makeLeg('Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio', CARTAGO_CENTRO, SANATORIO),
    ],
  });

  assert.deepEqual(
    buildSjFeederCartagoLocalReasons({
      journey: longSjRide,
      destination: SANATORIO_DESTINATION,
      ranked: [longSjRide],
    }),
    [],
  );
});

test('destination outside Cartago-local boxes does not trigger the penalty', () => {
  const sjFeeder = sanatorioSjFeeder();

  assert.deepEqual(
    buildSjFeederCartagoLocalReasons({
      journey: sjFeeder,
      destination: CARTAGO_CENTRO_DESTINATION,
      ranked: [sjFeeder, sanatorioLocalFeeder()],
    }),
    [],
  );
});

test('Tobosi destination also demotes a short SJ feeder with a local alternative', () => {
  const sjFeeder = makeJourney({
    id: 'sj-feeder-tobosi',
    kind: 'transfer',
    legs: [
      makeLeg('San Jose - San Pedro - Tres Rios - La Lima - Cartago', TARAS, CARTAGO_CENTRO),
      makeLeg('Cartago - Tobosi - Quebradillas', CARTAGO_CENTRO, TOBOSI),
    ],
    score: 75,
  });
  const localFeeder = makeJourney({
    id: 'local-feeder-tobosi',
    kind: 'transfer',
    legs: [
      makeLeg('Cartago - Taras - San Nicolas', TARAS, CARTAGO_CENTRO),
      makeLeg('Cartago - Tobosi - Quebradillas', CARTAGO_CENTRO, TOBOSI),
    ],
    score: 88,
  });

  const reasons = buildSjFeederCartagoLocalReasons({
    journey: sjFeeder,
    destination: TOBOSI_DESTINATION,
    ranked: [sjFeeder, localFeeder],
  });

  assert.equal(reasons[0]?.id, 'raptor-sj-feeder-when-local-available-for-cartago-dest');
});

test('missing first-leg coordinates do not trigger the penalty', () => {
  const missingCoords = sanatorioSjFeeder({
    legs: [
      makeLeg(
        'San Jose - San Pedro - Tres Rios - La Lima - Cartago',
        { ...TARAS, lat: Number.NaN },
        CARTAGO_CENTRO,
      ),
      makeLeg('Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio', CARTAGO_CENTRO, SANATORIO),
    ],
  });

  assert.deepEqual(
    buildSjFeederCartagoLocalReasons({
      journey: missingCoords,
      destination: SANATORIO_DESTINATION,
      ranked: [missingCoords, sanatorioLocalFeeder()],
    }),
    [],
  );
});

test('direct non-interurban journey counts as a valid alternative', () => {
  const sjFeeder = sanatorioSjFeeder();
  const directToTerminal = makeJourney({
    id: 'direct-to-terminal',
    kind: 'direct',
    legs: [makeLeg('Cartago - Tierra Blanca - Potrero Cerrado - Sanatorio', CARTAGO_CENTRO, SANATORIO)],
    score: 90,
  });

  const reasons = buildSjFeederCartagoLocalReasons({
    journey: sjFeeder,
    destination: SANATORIO_DESTINATION,
    ranked: [sjFeeder, directToTerminal],
  });

  assert.equal(reasons[0]?.penalty, 50);
});
