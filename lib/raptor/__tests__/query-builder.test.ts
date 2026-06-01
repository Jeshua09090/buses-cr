import assert from 'node:assert/strict';
import test from 'node:test';

import { buildJourneyQuery, buildJourneyRangeQuery } from '../query-builder';

test('buildJourneyQuery applies RAPTOR defaults needed by the app', () => {
  const query = buildJourneyQuery({
    fromStopId: 1,
    toStopId: 2,
    departureMinutes: 480,
    maxTransfers: 1,
    maxInitialWaitingMinutes: 45,
  });

  assert.equal(query.from, 1);
  assert.deepEqual(query.to, new Set([2]));
  assert.equal(query.departureTime, 480);
  assert.equal(query.options.maxTransfers, 1);
  assert.equal(query.options.minTransferTime, 3);
  assert.equal(query.options.maxInitialWaitingTime, 45);
  assert.deepEqual(query.options.transportModes, new Set(['BUS']));
});

test('buildJourneyRangeQuery applies bounded Range RAPTOR defaults needed by the app', () => {
  const query = buildJourneyRangeQuery({
    fromStopId: 1,
    toStopId: 2,
    departureMinutes: 480,
    lastDepartureMinutes: 510,
    maxTransfers: 1,
    maxInitialWaitingMinutes: 45,
  });

  assert.equal(query.from, 1);
  assert.deepEqual(query.to, new Set([2]));
  assert.equal(query.departureTime, 480);
  assert.equal(query.lastDepartureTime, 510);
  assert.equal(query.options.maxTransfers, 1);
  assert.equal(query.options.minTransferTime, 3);
  assert.equal(query.options.maxInitialWaitingTime, 45);
  assert.deepEqual(query.options.transportModes, new Set(['BUS']));
  assert.equal(query.rangeOptions.optimizeBeyondLatestDeparture, false);
});
