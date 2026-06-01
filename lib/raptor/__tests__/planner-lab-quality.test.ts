import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildJourneyDisplayAdvice,
  findInferiorSameRouteBoardingAlternatives,
} from '../../planner-lab-quality';
import { formatRouteDisplayName, getRouteDisplayNote } from '../../route-display';
import { buildRouteLegStopPathFromDirectory } from '../route-visualization';
import { buildLegTrajectoryPath } from '../visualization-path';

test('formatRouteDisplayName preserves ITCR as an acronym', () => {
  assert.equal(formatRouteDisplayName('SAN JOSE - ITCR'), 'San Jose - ITCR');
  assert.equal(formatRouteDisplayName('ITCR - SAN JOSE'), 'ITCR - San Jose');
});

test('getRouteDisplayNote explains local ITCR source without calling it internal TEC service', () => {
  const note = getRouteDisplayNote('Llano Grande - Cartago luego San Jose - ITCR');

  assert.ok(note);
  assert.match(note, /CTP 0300-P/);
  assert.doesNotMatch(note, /interno/i);
});

test('buildJourneyDisplayAdvice flags short bus hops where walking may be clearer', () => {
  const advice = buildJourneyDisplayAdvice({
    destinationName: 'Walmart La Lima',
    routeName: 'Tierra Blanca - Cot - Parque Industrial',
    totalBusMeters: 620,
    totalWalkMeters: 468,
    tripDistanceMeters: 860,
  });

  assert.equal(advice.some((item) => item.id === 'walk-competitive-short-hop'), true);
});

test('buildJourneyDisplayAdvice flags focused journeys with large network-walk deltas', () => {
  const advice = buildJourneyDisplayAdvice({
    destinationName: 'TEC Cartago',
    routeName: 'Cartago - Taras - San Nicolas luego San Jose - ITCR',
    totalBusMeters: 3_800,
    totalWalkMeters: 1_620,
    tripDistanceMeters: 4_900,
    networkWalkDeltaMeters: 930,
  });

  assert.equal(advice.some((item) => item.id === 'walk-network-detour-watch'), true);
});

test('findInferiorSameRouteBoardingAlternatives hides farther duplicate boardings', () => {
  const inferior = findInferiorSameRouteBoardingAlternatives({
    journeys: [
      {
        id: 'near-board',
        routeName: 'Cartago - Taras - San Nicolas luego San Jose - ITCR',
        dropStopName: 'Diagonal a una entrada secundaria del TEC',
        originWalkMeters: 108,
        destinationWalkMeters: 210,
        totalWalkMeters: 433,
      },
      {
        id: 'far-board',
        routeName: 'Cartago - Taras - San Nicolas luego San Jose - ITCR',
        dropStopName: 'Diagonal a una entrada secundaria del TEC',
        originWalkMeters: 457,
        destinationWalkMeters: 210,
        totalWalkMeters: 782,
      },
      {
        id: 'different-route',
        routeName: 'San Jose - ITCR',
        dropStopName: 'Diagonal a una entrada secundaria del TEC',
        originWalkMeters: 364,
        destinationWalkMeters: 210,
        totalWalkMeters: 573,
      },
    ],
    displayScoreByJourneyId: new Map([
      ['near-board', 35],
      ['far-board', 36],
      ['different-route', 33],
    ]),
  });

  assert.deepEqual([...inferior], ['far-board']);
});

test('buildLegTrajectoryPath snaps near endpoints instead of drawing short diagonal spurs', () => {
  const path = buildLegTrajectoryPath({
    trajectorySegments: [
      [
        [-83.92, 9.86],
        [-83.91, 9.86],
        [-83.9, 9.86],
      ],
    ],
    boardCoordinate: [-83.92005, 9.86],
    alightCoordinate: [-83.90005, 9.86],
  });

  assert.equal(path.length, 3);
  assert.deepEqual(path[0], [-83.92005, 9.86]);
  assert.deepEqual(path[path.length - 1], [-83.90005, 9.86]);
});

test('buildRouteLegStopPathFromDirectory follows snapshot stop order for preview routes', () => {
  const path = buildRouteLegStopPathFromDirectory({
    routeEntries: [
      {
        ruta_id: 4291,
        sub_arcs: [
          {
            sub_arc_index: 0,
            reason: 'linear',
            stop_count: 4,
            parada_ids: [10, 20, 30, 40],
          },
        ],
      },
    ],
    routeId: 4291,
    boardStopId: 20,
    alightStopId: 40,
    paradaCoordinates: new Map([
      [10, [-83.93, 9.85]],
      [20, [-83.92, 9.86]],
      [30, [-83.91, 9.87]],
      [40, [-83.9, 9.88]],
    ]),
    boardCoordinate: [-83.92, 9.86],
    alightCoordinate: [-83.9, 9.88],
  });

  assert.deepEqual(path, [
    [-83.92, 9.86],
    [-83.91, 9.87],
    [-83.9, 9.88],
  ]);
});

test('buildRouteLegStopPathFromDirectory prefers the directional arc when both share a route id', () => {
  const path = buildRouteLegStopPathFromDirectory({
    routeEntries: [
      {
        ruta_id: 4719,
        sub_arcs: [
          {
            sub_arc_index: 0,
            reason: 'linear',
            stop_count: 3,
            parada_ids: [1, 2, 3],
          },
        ],
      },
      {
        ruta_id: 4719,
        sub_arcs: [
          {
            sub_arc_index: 0,
            reason: 'linear',
            stop_count: 3,
            parada_ids: [3, 2, 1],
          },
        ],
      },
    ],
    routeId: 4719,
    boardStopId: 3,
    alightStopId: 1,
    paradaCoordinates: new Map([
      [1, [-83.9, 9.86]],
      [2, [-83.91, 9.86]],
      [3, [-83.92, 9.86]],
    ]),
    boardCoordinate: [-83.92, 9.86],
    alightCoordinate: [-83.9, 9.86],
  });

  assert.deepEqual(path, [
    [-83.92, 9.86],
    [-83.91, 9.86],
    [-83.9, 9.86],
  ]);
});
