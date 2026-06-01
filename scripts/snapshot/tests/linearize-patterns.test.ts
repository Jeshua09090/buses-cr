import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { linearizePattern } from '../src/linearize-patterns.ts';
import type { ParadaCoord, RawPatternRow } from '../src/types.ts';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function stop(paradaId: number, stopSequence: number): RawPatternRow {
  return {
    pattern_id: 1,
    ruta_id: 500,
    parada_id: paradaId,
    stop_sequence: stopSequence,
    es_subida: true,
    es_bajada: true,
    pickup_type: 0,
    drop_off_type: 0,
    distancia_acumulada_m: stopSequence * 100,
    tiempo_estimado_desde_inicio_min: stopSequence,
  };
}

function fixture(patternId: number): RawPatternRow[] {
  return JSON.parse(readFileSync(path.join(fixtureDir, `pattern-${patternId}.json`), 'utf8')) as RawPatternRow[];
}

function stopIds(arcs: ReturnType<typeof linearizePattern>): number[][] {
  return arcs.map((arc) => arc.stops);
}

function assertNoDuplicatedStopsWithinArc(arcs: ReturnType<typeof linearizePattern>) {
  for (const arc of arcs) {
    assert.equal(new Set(arc.stops).size, arc.stops.length, `arc ${arc.sub_arc_index} has duplicated stops`);
  }
}

describe('linearizePattern', () => {
  it('keeps a strictly linear pattern as one arc', () => {
    const arcs = linearizePattern({
      pattern_id: 101,
      ruta_id: 501,
      stops: [stop(10, 1), stop(20, 2), stop(30, 3)],
    });

    assert.deepEqual(stopIds(arcs), [[10, 20, 30]]);
    assert.equal(arcs[0]?.reason, 'linear');
    assertNoDuplicatedStopsWithinArc(arcs);
  });

  it('drops the trailing repeated stop for a simple loop', () => {
    const arcs = linearizePattern({
      pattern_id: 102,
      ruta_id: 502,
      stops: [stop(10, 1), stop(20, 2), stop(30, 3), stop(10, 4)],
    });

    assert.deepEqual(stopIds(arcs), [[10, 20, 30]]);
    assert.equal(arcs[0]?.reason, 'loop');
    assertNoDuplicatedStopsWithinArc(arcs);
  });

  it('splits a mid-route revisit into contiguous non-duplicated arcs', () => {
    const arcs = linearizePattern({
      pattern_id: 103,
      ruta_id: 503,
      stops: [stop(10, 1), stop(20, 2), stop(30, 3), stop(20, 4), stop(40, 5)],
    });

    assert.deepEqual(stopIds(arcs), [
      [10, 20, 30],
      [30, 20, 40],
    ]);
    assert.deepEqual(arcs.map((arc) => arc.reason), ['revisit', 'revisit']);
    assertNoDuplicatedStopsWithinArc(arcs);
  });

  it('splits multiple revisits without creating one-stop arcs', () => {
    const arcs = linearizePattern({
      pattern_id: 104,
      ruta_id: 504,
      stops: [
        stop(10, 1),
        stop(20, 2),
        stop(30, 3),
        stop(20, 4),
        stop(40, 5),
        stop(50, 6),
        stop(40, 7),
        stop(60, 8),
      ],
    });

    assert.deepEqual(stopIds(arcs), [
      [10, 20, 30],
      [30, 20, 40, 50],
      [50, 40, 60],
    ]);
    assertNoDuplicatedStopsWithinArc(arcs);
    assert.ok(arcs.every((arc) => arc.stops.length >= 2));
  });

  it('squashes consecutive repeated stops from real duplicated stop rows', () => {
    const arcs = linearizePattern({
      pattern_id: 803,
      ruta_id: 5332,
      stops: [
        stop(1566, 44),
        stop(1567, 45),
        stop(1611, 46),
        stop(851, 47),
        stop(851, 48),
        stop(852, 49),
        stop(852, 50),
        stop(852, 51),
      ],
    });

    assert.deepEqual(stopIds(arcs), [[1566, 1567, 1611, 851, 852]]);
    assert.equal(arcs[0]?.reason, 'linear');
    assertNoDuplicatedStopsWithinArc(arcs);
  });

  it('keeps source sequence ranges from the retained raw stop rows', () => {
    const arcs = linearizePattern({
      pattern_id: 105,
      ruta_id: 505,
      stops: [stop(10, 10), stop(20, 20), stop(30, 30), stop(20, 40), stop(40, 50)],
    });

    assert.deepEqual(arcs.map((arc) => arc.source_seq_range), [
      [10, 30],
      [30, 50],
    ]);
  });
});

describe('linearizePattern - proximity-based loop detection', () => {
  it('detects loop when first and last paradas are different IDs but colocated', () => {
    const coords = new Map<number, ParadaCoord>([
      [100, { id: 100, lat: 9.86, lng: -83.92 }],
      [101, { id: 101, lat: 9.86001, lng: -83.92001 }],
      [50, { id: 50, lat: 9.861, lng: -83.921 }],
    ]);
    const arcs = linearizePattern(
      {
        pattern_id: 106,
        ruta_id: 506,
        stops: [stop(100, 1), stop(50, 2), stop(101, 3)],
      },
      coords,
    );

    assert.deepEqual(stopIds(arcs), [[100, 50]]);
    assert.equal(arcs[0]?.reason, 'loop');
  });

  it('does not detect loop when paradas are far apart', () => {
    const coords = new Map<number, ParadaCoord>([
      [100, { id: 100, lat: 9.86, lng: -83.92 }],
      [101, { id: 101, lat: 9.87, lng: -83.92 }],
    ]);
    const arcs = linearizePattern(
      {
        pattern_id: 107,
        ruta_id: 507,
        stops: [stop(100, 1), stop(50, 2), stop(101, 3)],
      },
      coords,
    );

    assert.equal(arcs[0]?.reason, 'linear');
  });

  it('falls back to literal id loop detection when coordinates are not provided', () => {
    const arcs = linearizePattern({
      pattern_id: 108,
      ruta_id: 508,
      stops: [stop(100, 1), stop(50, 2), stop(100, 3)],
    });

    assert.deepEqual(stopIds(arcs), [[100, 50]]);
    assert.equal(arcs[0]?.reason, 'loop');
  });

  it('does not split mid-route revisits when loop is detected', () => {
    const coords = new Map<number, ParadaCoord>([
      [100, { id: 100, lat: 9.86, lng: -83.92 }],
      [101, { id: 101, lat: 9.86001, lng: -83.92001 }],
    ]);
    const arcs = linearizePattern(
      {
        pattern_id: 109,
        ruta_id: 509,
        stops: [stop(100, 1), stop(50, 2), stop(60, 3), stop(50, 4), stop(101, 5)],
      },
      coords,
    );

    assert.equal(arcs.length, 1);
    assert.equal(arcs[0]?.reason, 'loop');
    assertNoDuplicatedStopsWithinArc(arcs);
  });
});

describe('linearizePattern - real Cartago patterns', () => {
  it('pattern 803 keeps a single linear arc after squashing consecutive duplicate rows', () => {
    const rows = fixture(803);
    const arcs = linearizePattern({ pattern_id: 803, ruta_id: 5332, stops: rows });

    assert.equal(arcs.length, 1);
    assert.equal(arcs[0]?.reason, 'linear');
    assert.equal(arcs[0]?.stops.length, 48);
    assertNoDuplicatedStopsWithinArc(arcs);
  });

  it('pattern 804 remains a two-arc revisit regression case', () => {
    const rows = fixture(804);
    const arcs = linearizePattern({ pattern_id: 804, ruta_id: 5333, stops: rows });

    assert.equal(arcs.length, 2);
    assert.deepEqual(arcs.map((arc) => arc.reason), ['revisit', 'revisit']);
    assertNoDuplicatedStopsWithinArc(arcs);
  });

  it('pattern 861 classifies as a literal loop', () => {
    const rows = fixture(861);
    const arcs = linearizePattern({ pattern_id: 861, ruta_id: 4719, stops: rows });

    assert.equal(arcs.length, 1);
    assert.equal(arcs[0]?.reason, 'loop');
    assertNoDuplicatedStopsWithinArc(arcs);
  });
});
