import { haversineMeters } from './geo.ts';
import type { LinearizedSubPatternWithRows, ParadaCoord, RawPatternRow } from './types.ts';

export type LinearizePatternInput = {
  pattern_id: number;
  ruta_id: number | null;
  stops: RawPatternRow[];
};

type LinearizationReason = LinearizedSubPatternWithRows['reason'];
const LOOP_PROXIMITY_THRESHOLD_M = 80;

function byStopSequence(a: RawPatternRow, b: RawPatternRow): number {
  return a.stop_sequence - b.stop_sequence;
}

function squashConsecutiveDuplicates(stops: RawPatternRow[]): RawPatternRow[] {
  const squashed: RawPatternRow[] = [];

  for (const stop of stops) {
    const previous = squashed.at(-1);
    if (previous?.parada_id === stop.parada_id) {
      continue;
    }

    squashed.push(stop);
  }

  return squashed;
}

function hasDuplicateStop(stops: RawPatternRow[]): boolean {
  const seen = new Set<number>();

  for (const stop of stops) {
    if (seen.has(stop.parada_id)) {
      return true;
    }

    seen.add(stop.parada_id);
  }

  return false;
}

function dedupeAllStops(stops: RawPatternRow[]): RawPatternRow[] {
  const seen = new Set<number>();
  const deduped: RawPatternRow[] = [];

  for (const stop of stops) {
    if (seen.has(stop.parada_id)) continue;
    seen.add(stop.parada_id);
    deduped.push(stop);
  }

  return deduped;
}

function isLoop(first: RawPatternRow, last: RawPatternRow, paradaCoords?: Map<number, ParadaCoord>): boolean {
  if (first.parada_id === last.parada_id) {
    return true;
  }

  const firstCoord = paradaCoords?.get(first.parada_id);
  const lastCoord = paradaCoords?.get(last.parada_id);
  if (!firstCoord || !lastCoord) {
    return false;
  }

  return haversineMeters(firstCoord, lastCoord) <= LOOP_PROXIMITY_THRESHOLD_M;
}

function createArc(
  patternId: number,
  rutaId: number | null,
  serviceRouteKey: string,
  subArcIndex: number,
  reason: LinearizationReason,
  rows: RawPatternRow[],
): LinearizedSubPatternWithRows {
  const first = rows[0];
  const last = rows.at(-1);

  if (!first || !last) {
    throw new Error(`Cannot create an empty sub-pattern for pattern ${patternId}`);
  }

  return {
    pattern_id: patternId,
    ruta_id: rutaId ?? 0,
    service_route_key: serviceRouteKey,
    sub_arc_index: subArcIndex,
    reason,
    stops: rows.map((stop) => stop.parada_id),
    source_seq_range: [first.stop_sequence, last.stop_sequence],
    rows,
  };
}

function splitRevisits(
  patternId: number,
  rutaId: number | null,
  serviceRouteKey: string,
  stops: RawPatternRow[],
  reason: LinearizationReason,
): LinearizedSubPatternWithRows[] {
  const arcs: LinearizedSubPatternWithRows[] = [];
  let current: RawPatternRow[] = [];
  let currentIds = new Set<number>();

  for (const nextStop of stops) {
    if (!currentIds.has(nextStop.parada_id)) {
      current.push(nextStop);
      currentIds.add(nextStop.parada_id);
      continue;
    }

    if (current.length >= 2) {
      arcs.push(createArc(patternId, rutaId, serviceRouteKey, arcs.length, reason, current));
      const connector = current.at(-1);
      current = connector && connector.parada_id !== nextStop.parada_id ? [connector, nextStop] : [nextStop];
    } else {
      current = [nextStop];
    }

    currentIds = new Set(current.map((stop) => stop.parada_id));
  }

  if (current.length >= 2) {
    arcs.push(createArc(patternId, rutaId, serviceRouteKey, arcs.length, reason, current));
  }

  return arcs;
}

export function linearizePattern(
  input: LinearizePatternInput,
  paradaCoords?: Map<number, ParadaCoord>,
): LinearizedSubPatternWithRows[] {
  const orderedStops = input.stops.slice().sort(byStopSequence);
  let normalizedStops = squashConsecutiveDuplicates(orderedStops);
  const serviceRouteKey = `pattern-${input.pattern_id}`;
  let reason: LinearizationReason = 'linear';

  const first = normalizedStops[0];
  const last = normalizedStops.at(-1);

  if (!first || !last || normalizedStops.length < 2) {
    return [];
  }

  if (isLoop(first, last, paradaCoords)) {
    normalizedStops = dedupeAllStops(normalizedStops.slice(0, -1));
    reason = 'loop';
  }

  if (normalizedStops.length < 2) {
    return [];
  }

  if (!hasDuplicateStop(normalizedStops)) {
    return [createArc(input.pattern_id, input.ruta_id, serviceRouteKey, 0, reason, normalizedStops)];
  }

  return splitRevisits(input.pattern_id, input.ruta_id, serviceRouteKey, normalizedStops, 'revisit');
}

export function linearizePatterns(
  rows: RawPatternRow[],
  patternToRutaId: Map<number, number | null> = new Map(),
  paradaCoords?: Map<number, ParadaCoord>,
): LinearizedSubPatternWithRows[] {
  const rowsByPattern = new Map<number, RawPatternRow[]>();

  for (const row of rows) {
    const current = rowsByPattern.get(row.pattern_id) ?? [];
    current.push(row);
    rowsByPattern.set(row.pattern_id, current);
  }

  return Array.from(rowsByPattern.entries())
    .sort(([a], [b]) => a - b)
    .flatMap(([patternId, stops]) =>
      linearizePattern({
        pattern_id: patternId,
        ruta_id: patternToRutaId.get(patternId) ?? null,
        stops,
      }, paradaCoords),
    );
}
