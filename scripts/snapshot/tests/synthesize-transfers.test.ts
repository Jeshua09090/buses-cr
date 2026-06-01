import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { haversineMeters } from '../src/geo.ts';
import { mediumWalkTransferStopIds, synthesizeWalkingTransfers } from '../src/synthesize-transfers.ts';
import type { RawParadaRow } from '../src/types.ts';

function parada(id: number, lat: number, lng: number): RawParadaRow {
  return { id, nombre: `Parada ${id}`, lat, lng };
}

describe('synthesizeWalkingTransfers', () => {
  it('emits no transfers for paradas farther than the maximum walk radius', () => {
    const transfers = synthesizeWalkingTransfers([
      parada(1, 9.86, -83.92),
      parada(2, 9.8665, -83.92),
    ]);

    assert.equal(transfers.length, 0);
  });

  it('emits both directions for a close pair', () => {
    const transfers = synthesizeWalkingTransfers([
      parada(1, 9.86, -83.92),
      parada(2, 9.8605, -83.9201),
    ]);

    assert.deepEqual(
      transfers.map((edge) => [edge.from_parada_id, edge.to_parada_id]),
      [
        [1, 2],
        [2, 1],
      ],
    );
  });

  it('does not emit medium transfer walks unless both stops are eligible', () => {
    const transfers = synthesizeWalkingTransfers([
      parada(1, 9.86, -83.92),
      parada(2, 9.8648, -83.92),
    ]);

    assert.equal(transfers.length, 0);
  });

  it('allows eligible medium transfer walks and clamps walk time to one to eight minutes', () => {
    const short = synthesizeWalkingTransfers([
      parada(1, 9.86, -83.92),
      parada(2, 9.86001, -83.92001),
    ]);
    const longer = synthesizeWalkingTransfers([
      parada(1, 9.86, -83.92),
      parada(2, 9.8648, -83.92),
    ], { mediumWalkStopIds: new Set([1, 2]) });

    assert.equal(short[0]?.walk_time_min, 1);
    assert.equal(longer.length, 2);
    assert.ok((longer[0]?.walk_time_min ?? 0) <= 8);
  });

  it('keeps a medium hub transfer alive only when both stops serve three or more patterns', () => {
    const mediumStopIds = mediumWalkTransferStopIds([
      { parada_id: 1, pattern_id: 10 },
      { parada_id: 1, pattern_id: 11 },
      { parada_id: 1, pattern_id: 12 },
      { parada_id: 2, pattern_id: 20 },
      { parada_id: 2, pattern_id: 21 },
      { parada_id: 2, pattern_id: 22 },
      { parada_id: 3, pattern_id: 30 },
      { parada_id: 3, pattern_id: 31 },
    ]);
    const transfers = synthesizeWalkingTransfers([
      parada(1, 9.86, -83.92),
      parada(2, 9.8648, -83.92),
      parada(3, 9.8552, -83.92),
    ], { mediumWalkStopIds: mediumStopIds });

    assert.deepEqual([...mediumStopIds].sort((a, b) => a - b), [1, 2]);
    assert.deepEqual(
      transfers.map((edge) => [edge.from_parada_id, edge.to_parada_id]),
      [
        [1, 2],
        [2, 1],
      ],
    );
  });

  it('uses haversine distance for threshold checks', () => {
    const meters = haversineMeters(parada(1, 9.86, -83.92), parada(2, 9.861, -83.92));

    assert.ok(meters > 100);
    assert.ok(meters < 120);
  });

  it('skips self transfers', () => {
    const transfers = synthesizeWalkingTransfers([parada(1, 9.86, -83.92), parada(1, 9.86001, -83.92001)]);

    assert.equal(transfers.length, 0);
  });

  it('produces deterministic sorted output', () => {
    const transfers = synthesizeWalkingTransfers([
      parada(3, 9.8602, -83.9201),
      parada(1, 9.86, -83.92),
      parada(2, 9.8601, -83.9201),
    ]);

    assert.deepEqual(
      transfers.map((edge) => [edge.from_parada_id, edge.to_parada_id]),
      [
        [1, 2],
        [1, 3],
        [2, 1],
        [2, 3],
        [3, 1],
        [3, 2],
      ],
    );
  });
});
