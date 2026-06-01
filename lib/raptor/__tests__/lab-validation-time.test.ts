import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_RAPTOR_LAB_DEPARTURE_ISO,
  formatRaptorLabDepartureDebug,
  resolveRaptorLabDepartureDate,
} from '../lab-validation-time';

test('resolveRaptorLabDepartureDate returns the stable default when no query param exists', () => {
  assert.equal(
    resolveRaptorLabDepartureDate(null).toISOString(),
    new Date(DEFAULT_RAPTOR_LAB_DEPARTURE_ISO).toISOString(),
  );
});

test('resolveRaptorLabDepartureDate accepts explicit ISO query params', () => {
  assert.equal(
    resolveRaptorLabDepartureDate('2026-05-10T19:25:00-06:00').toISOString(),
    '2026-05-11T01:25:00.000Z',
  );
});

test('resolveRaptorLabDepartureDate captures now once for manual Moovit comparisons', () => {
  const now = new Date('2026-05-10T20:15:00-06:00');

  assert.equal(resolveRaptorLabDepartureDate('now', now).toISOString(), now.toISOString());
});

test('resolveRaptorLabDepartureDate falls back for invalid query params', () => {
  assert.equal(
    resolveRaptorLabDepartureDate('not-a-date').toISOString(),
    new Date(DEFAULT_RAPTOR_LAB_DEPARTURE_ISO).toISOString(),
  );
});

test('formatRaptorLabDepartureDebug renders the Costa Rica validation time', () => {
  assert.match(
    formatRaptorLabDepartureDebug(new Date('2026-05-10T19:25:00-06:00')),
    /2026.*19:25|10\/5\/26.*19:25|5\/10\/26.*19:25/,
  );
});
