import type { Stop } from 'minotor';

import { getSnapshot } from './snapshot-cache';
import type { CachedSnapshot, ServiceRouteDirectoryEntry } from './types';

type Coordinate = [number, number];

type RoutePathEntry = Pick<ServiceRouteDirectoryEntry, 'ruta_id' | 'sub_arcs'>;

const paradaCoordinatesCache = new WeakMap<CachedSnapshot, Map<number, Coordinate>>();

function toNumberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stopToParadaCoordinate(stop: Stop): { paradaId: number; coordinate: Coordinate } | null {
  const paradaId = toNumberOrNull(stop.sourceStopId);
  if (paradaId === null || typeof stop.lat !== 'number' || typeof stop.lon !== 'number') {
    return null;
  }

  return {
    paradaId,
    coordinate: [stop.lon, stop.lat],
  };
}

function getParadaCoordinates(snapshot: CachedSnapshot) {
  const cached = paradaCoordinatesCache.get(snapshot);
  if (cached) return cached;

  const coordinates = new Map<number, Coordinate>();
  for (const stop of snapshot.stopsIndex) {
    const parsed = stopToParadaCoordinate(stop);
    if (!parsed || coordinates.has(parsed.paradaId)) continue;
    coordinates.set(parsed.paradaId, parsed.coordinate);
  }

  paradaCoordinatesCache.set(snapshot, coordinates);
  return coordinates;
}

function fallbackEndpointPath(params: {
  boardCoordinate: Coordinate | null;
  alightCoordinate: Coordinate | null;
}) {
  if (!params.boardCoordinate || !params.alightCoordinate) return [];
  return [params.boardCoordinate, params.alightCoordinate];
}

function pathFromParadaIds(
  paradaIds: number[],
  paradaCoordinates: ReadonlyMap<number, Coordinate>,
) {
  return paradaIds
    .map((paradaId) => paradaCoordinates.get(paradaId) ?? null)
    .filter((coordinate): coordinate is Coordinate => Boolean(coordinate));
}

export function buildRouteLegStopPathFromDirectory(params: {
  routeEntries: readonly RoutePathEntry[];
  routeId: number | null;
  boardStopId: number | null;
  alightStopId: number | null;
  paradaCoordinates: ReadonlyMap<number, Coordinate>;
  boardCoordinate: Coordinate | null;
  alightCoordinate: Coordinate | null;
}) {
  if (!params.routeId || params.boardStopId === null || params.alightStopId === null) {
    return fallbackEndpointPath(params);
  }

  const candidates: Array<{ path: Coordinate[]; score: number }> = [];

  for (const entry of params.routeEntries) {
    if (entry.ruta_id !== params.routeId) continue;

    for (const subArc of entry.sub_arcs) {
      const paradaIds = subArc.parada_ids ?? [];
      const boardIndex = paradaIds.indexOf(params.boardStopId);
      const alightIndex = paradaIds.indexOf(params.alightStopId);

      if (boardIndex < 0 || alightIndex < 0 || boardIndex === alightIndex) continue;

      const isForward = boardIndex < alightIndex;
      const startIndex = Math.min(boardIndex, alightIndex);
      const endIndex = Math.max(boardIndex, alightIndex);
      const slicedParadaIds = paradaIds.slice(startIndex, endIndex + 1);
      const orientedParadaIds = isForward ? slicedParadaIds : [...slicedParadaIds].reverse();
      const path = pathFromParadaIds(orientedParadaIds, params.paradaCoordinates);

      if (path.length < 2) continue;

      const span = Math.abs(alightIndex - boardIndex);
      candidates.push({
        path,
        score: (isForward ? 0 : 10_000) + span,
      });
    }
  }

  if (candidates.length === 0) {
    return fallbackEndpointPath(params);
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.path ?? fallbackEndpointPath(params);
}

export async function getSnapshotRouteLegStopPath(params: {
  routeId: number | null;
  boardStopId: number | null;
  alightStopId: number | null;
  boardCoordinate: Coordinate | null;
  alightCoordinate: Coordinate | null;
}) {
  const snapshot = await getSnapshot();
  return buildRouteLegStopPathFromDirectory({
    routeEntries: Object.values(snapshot.metadata.service_route_directory),
    paradaCoordinates: getParadaCoordinates(snapshot),
    ...params,
  });
}
