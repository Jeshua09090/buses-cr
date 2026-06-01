import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlannedJourney } from '@/lib/journey-planner';

import { rankRaptorJourneys } from '../journey-ranking';

const HOSPITAL_CALDERON_GUARDIA_DESTINATION: [number, number] = [-84.0712, 9.9366];

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

test('Calderon Guardia destination prefers a nearby San Pedro drop over a central San Jose long walk', () => {
  const centralLongWalk = makeJourney({
    id: 'central-long-walk',
    routeName: 'Cartago-Ministerio De Salud En San Jose',
    boardStopName: 'Parada UCR-Cartago',
    dropStopName: 'Bus hacia Curridabat por Pista',
    score: 89.3,
    destinationWalkMeters: 1355,
    totalWalkMeters: 1983,
  });
  const nearbySanPedroDrop = makeJourney({
    id: 'nearby-san-pedro-drop',
    routeName: 'San Jose - San Pedro - Pista - Taras - Cartago',
    boardStopName: 'Cartago - Dulce Nombre',
    dropStopName: 'UN COSTADO DEL PARQUE NACIONAL FRENTE A LA PARADA DE TAXIS',
    score: 106.3,
    destinationWalkMeters: 186,
    totalWalkMeters: 408,
  });

  const ranking = rankRaptorJourneys({
    journeys: [centralLongWalk, nearbySanPedroDrop],
    origin: [-83.919373, 9.864429],
    destination: HOSPITAL_CALDERON_GUARDIA_DESTINATION,
    destinationName: 'Hospital Calderon Guardia',
  });
  const centralDebug = ranking.debugById.get('central-long-walk');
  const nearbyDebug = ranking.debugById.get('nearby-san-pedro-drop');

  assert.equal(ranking.ranked[0]?.id, 'nearby-san-pedro-drop');
  assert.ok(centralDebug);
  assert.ok(nearbyDebug);
  assert.equal(
    centralDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-calderon-guardia-far-drop-penalty',
    ),
    true,
  );
  assert.equal(
    nearbyDebug.raptorPolishReasons.some(
      (reason) => reason.id === 'raptor-calderon-guardia-corridor-bonus',
    ),
    true,
  );
});
