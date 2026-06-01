import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlannedJourney } from '@/lib/journey-planner';

import { rankRaptorJourneys } from '../journey-ranking';

const PALI_TARAS_DESTINATION: [number, number] = [-83.934149, 9.8788492];

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

test('Pali Taras prefers Cartago-Taras-San Nicolas over neighboring local routes', () => {
  const laAngelina = makeJourney({
    id: 'la-angelina',
    routeName: 'La Angelina - Cartago',
    score: 30,
    destinationWalkMeters: 90,
    dropStopName: 'FRENTE A PALI',
  });
  const tarasSanNicolas = makeJourney({
    id: 'taras-san-nicolas',
    routeName: 'Cartago - Taras - San Nicolas',
    score: 50,
    destinationWalkMeters: 90,
    dropStopName: 'FRENTE A PALI',
  });

  const ranking = rankRaptorJourneys({
    journeys: [laAngelina, tarasSanNicolas],
    origin: [-83.9389683, 9.87829],
    destination: PALI_TARAS_DESTINATION,
    destinationName: 'Pali Taras',
  });
  const laAngelinaDebug = ranking.debugById.get('la-angelina');
  const tarasDebug = ranking.debugById.get('taras-san-nicolas');

  assert.equal(ranking.ranked[0]?.id, 'taras-san-nicolas');
  assert.ok(laAngelinaDebug);
  assert.ok(tarasDebug);
  assert.equal(
    laAngelinaDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-pali-taras-non-taras-route-penalty',
    ),
    true,
  );
  assert.equal(
    tarasDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-taras-san-nicolas-local-bonus',
    ),
    true,
  );
});

test('Pali Taras preference does not penalize neighboring routes without a San Nicolas alternative', () => {
  const laAngelina = makeJourney({
    id: 'la-angelina',
    routeName: 'La Angelina - Cartago',
    score: 30,
    destinationWalkMeters: 90,
  });

  const ranking = rankRaptorJourneys({
    journeys: [laAngelina],
    origin: [-83.9389683, 9.87829],
    destination: PALI_TARAS_DESTINATION,
    destinationName: 'Pali Taras',
  });

  assert.equal(ranking.ranked[0]?.id, 'la-angelina');
  assert.equal(
    ranking.debugById
      .get('la-angelina')
      ?.raptorPolishReasons.some(
        (reason) => reason.id === 'raptor-pali-taras-non-taras-route-penalty',
      ),
    false,
  );
});

test('Pali Taras demotes secondary Taras variants when San Nicolas is available', () => {
  const tarasOchomogo = makeJourney({
    id: 'taras-ochomogo',
    routeName: 'Cartago - Taras - Ochomogo',
    score: 30,
    destinationWalkMeters: 90,
    dropStopName: 'FRENTE A PALI',
  });
  const tarasSanNicolas = makeJourney({
    id: 'taras-san-nicolas',
    routeName: 'Cartago - Taras - San Nicolas',
    score: 40,
    destinationWalkMeters: 90,
    dropStopName: 'FRENTE A PALI',
  });

  const ranking = rankRaptorJourneys({
    journeys: [tarasOchomogo, tarasSanNicolas],
    origin: [-83.9389683, 9.87829],
    destination: PALI_TARAS_DESTINATION,
    destinationName: 'Pali Taras',
  });
  const ochomogoDebug = ranking.debugById.get('taras-ochomogo');

  assert.equal(ranking.ranked[0]?.id, 'taras-san-nicolas');
  assert.ok(ochomogoDebug);
  assert.equal(
    ochomogoDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-pali-taras-secondary-taras-route-penalty',
    ),
    true,
  );
});

test('Pali Taras prefers the closer San Nicolas boarding stop when alternatives are otherwise equivalent', () => {
  const lindaVista = makeJourney({
    id: 'linda-vista',
    routeName: 'Cartago - Taras - San Nicolas',
    score: 13.87,
    originWalkMeters: 348,
    destinationWalkMeters: 45,
    totalWalkMeters: 393,
    boardStopName: 'FRENTE A BAR LINDA VISTA',
    dropStopName: 'FRENTE A PALI',
  });
  const boutiqueTara = makeJourney({
    id: 'boutique-tara',
    routeName: 'Cartago - Taras - San Nicolas',
    score: 13.94,
    originWalkMeters: 231,
    destinationWalkMeters: 45,
    totalWalkMeters: 276,
    boardStopName: 'FRENTE A BOUTIQUE TARA',
    dropStopName: 'FRENTE A PALI',
  });

  const ranking = rankRaptorJourneys({
    journeys: [lindaVista, boutiqueTara],
    origin: [-83.9389683, 9.87829],
    destination: PALI_TARAS_DESTINATION,
    destinationName: 'Pali Taras',
  });
  const lindaVistaDebug = ranking.debugById.get('linda-vista');

  assert.equal(ranking.ranked[0]?.id, 'boutique-tara');
  assert.ok(lindaVistaDebug);
  assert.equal(
    lindaVistaDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-pali-taras-farther-board-penalty',
    ),
    true,
  );
});
