import { haversineMeters } from './geo.ts';
import type { RawParadaRow, RawTransferEdgeRow } from './types.ts';

export const BASE_WALK_DISTANCE_M = 200;
export const MAX_WALK_DISTANCE_M = 650;
export const MIN_PATTERNS_FOR_MEDIUM_HUB = 3;
const WALK_SPEED_M_PER_SEC = 1.4;
const MIN_WALK_TIME_MIN = 1;
const MAX_WALK_TIME_MIN = 8;
const APPROX_METERS_PER_DEGREE = 111_320;
const BUCKET_DEGREES = MAX_WALK_DISTANCE_M / APPROX_METERS_PER_DEGREE;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bucketKey(lat: number, lng: number): string {
  return `${Math.floor(lat / BUCKET_DEGREES)}:${Math.floor(lng / BUCKET_DEGREES)}`;
}

function neighborKeys(parada: RawParadaRow): string[] {
  const latBucket = Math.floor(parada.lat / BUCKET_DEGREES);
  const lngBucket = Math.floor(parada.lng / BUCKET_DEGREES);
  const keys: string[] = [];

  for (let latDelta = -1; latDelta <= 1; latDelta += 1) {
    for (let lngDelta = -1; lngDelta <= 1; lngDelta += 1) {
      keys.push(`${latBucket + latDelta}:${lngBucket + lngDelta}`);
    }
  }

  return keys;
}

function walkTimeMinutes(distanceM: number): number {
  return clamp(Math.round(distanceM / (WALK_SPEED_M_PER_SEC * 60)), MIN_WALK_TIME_MIN, MAX_WALK_TIME_MIN);
}

function makeSyntheticEdge(from: RawParadaRow, to: RawParadaRow, distanceM: number): RawTransferEdgeRow {
  return {
    from_boarding_point_id: null,
    to_boarding_point_id: null,
    from_area_id: null,
    to_area_id: null,
    from_parada_id: from.id,
    to_parada_id: to.id,
    distance_m: Math.round(distanceM),
    walk_time_min: walkTimeMinutes(distanceM),
    transfer_type: 'nearby_walk',
    confidence: 0.75,
    activo: true,
    source: 'auto_synthesized',
  };
}

function canUseMediumWalkTransfer(
  from: RawParadaRow,
  to: RawParadaRow,
  mediumWalkStopIds: ReadonlySet<number>,
) {
  return mediumWalkStopIds.has(from.id) && mediumWalkStopIds.has(to.id);
}

export function mediumWalkTransferStopIds(patternStops: { parada_id: number; pattern_id: number }[]) {
  const patternsByStop = new Map<number, Set<number>>();

  for (const stop of patternStops) {
    const patterns = patternsByStop.get(stop.parada_id) ?? new Set<number>();
    patterns.add(stop.pattern_id);
    patternsByStop.set(stop.parada_id, patterns);
  }

  return new Set(
    [...patternsByStop.entries()]
      .filter(([, patterns]) => patterns.size >= MIN_PATTERNS_FOR_MEDIUM_HUB)
      .map(([paradaId]) => paradaId),
  );
}

export function synthesizeWalkingTransfers(
  paradas: RawParadaRow[],
  options: { mediumWalkStopIds?: ReadonlySet<number> } = {},
): RawTransferEdgeRow[] {
  const buckets = new Map<string, RawParadaRow[]>();
  const mediumWalkStopIds = options.mediumWalkStopIds ?? new Set<number>();
  const sortedParadas = paradas
    .filter((parada) => Number.isFinite(parada.lat) && Number.isFinite(parada.lng))
    .slice()
    .sort((a, b) => a.id - b.id);
  const transfers: RawTransferEdgeRow[] = [];

  for (const parada of sortedParadas) {
    const key = bucketKey(parada.lat, parada.lng);
    const bucket = buckets.get(key) ?? [];
    bucket.push(parada);
    buckets.set(key, bucket);
  }

  for (const from of sortedParadas) {
    for (const key of neighborKeys(from)) {
      for (const to of buckets.get(key) ?? []) {
        if (to.id <= from.id) continue;

        const distanceM = haversineMeters(from, to);
        if (distanceM > MAX_WALK_DISTANCE_M) continue;
        if (distanceM > BASE_WALK_DISTANCE_M && !canUseMediumWalkTransfer(from, to, mediumWalkStopIds)) {
          continue;
        }

        transfers.push(makeSyntheticEdge(from, to, distanceM), makeSyntheticEdge(to, from, distanceM));
      }
    }
  }

  return transfers.sort((a, b) => {
    const fromDiff = (a.from_parada_id ?? 0) - (b.from_parada_id ?? 0);
    return fromDiff === 0 ? (a.to_parada_id ?? 0) - (b.to_parada_id ?? 0) : fromDiff;
  });
}
