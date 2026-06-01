import { Router, StopsIndex, Timetable, type Stop } from 'minotor';

import { decodeSnapshotBundle } from './snapshot-decoder';
import type { CachedSnapshot, DiaTipo, RouteNamesByStopId, SnapshotMetadata } from './types';

const EXPECTED_MINOTOR_VERSION = '11.2.2';
const EXPECTED_SCHEMA_VERSION = 1;
const DIA_TIPOS: DiaTipo[] = ['habil', 'sabado', 'domingo', 'feriado'];

let snapshotPromise: Promise<CachedSnapshot> | null = null;
let snapshotOverride: CachedSnapshot | null = null;
const routeNamesByStopIdCache = new WeakMap<CachedSnapshot, RouteNamesByStopId>();

type SnapshotLoaders = {
  loadMetadata: () => SnapshotMetadata;
  loadBytes: () => Promise<Uint8Array>;
};

let snapshotLoadersOverride: SnapshotLoaders | null = null;

async function getSnapshotLoaders(): Promise<SnapshotLoaders> {
  if (snapshotLoadersOverride) {
    return snapshotLoadersOverride;
  }

  const assetModule = await import('./snapshot-asset');
  return {
    loadMetadata: assetModule.loadBundledMetadata,
    loadBytes: assetModule.loadBundledSnapshotBytes,
  };
}

function requiredBlob(blobs: Map<string, Uint8Array>, name: string) {
  const blob = blobs.get(name);
  if (!blob) {
    throw new Error(`Snapshot bundle is missing blob: ${name}`);
  }
  return blob;
}

function toParadaId(stop: Stop) {
  const parsed = Number(stop.sourceStopId);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildStopIdsByParadaId(stopsIndex: StopsIndex) {
  const stopIdsByParadaId = new Map<number, number[]>();

  for (const stop of stopsIndex) {
    const paradaId = toParadaId(stop);
    if (paradaId === null) continue;

    const existing = stopIdsByParadaId.get(paradaId) ?? [];
    existing.push(stop.id);
    stopIdsByParadaId.set(paradaId, existing);
  }

  return stopIdsByParadaId;
}

function addRouteName(target: Map<number, Set<string>>, stopId: number, routeName: string) {
  const existing = target.get(stopId) ?? new Set<string>();
  existing.add(routeName);
  target.set(stopId, existing);
}

function buildRouteNamesByStopId(snapshot: CachedSnapshot): RouteNamesByStopId {
  const stopIdsByParadaId = buildStopIdsByParadaId(snapshot.stopsIndex);
  const routeNamesByStopId = new Map<number, Set<string>>();

  for (const entry of Object.values(snapshot.metadata.service_route_directory)) {
    const routeName = entry.route_name ?? entry.pattern_name ?? entry.service_route_key;

    for (const subArc of entry.sub_arcs) {
      for (const paradaId of subArc.parada_ids ?? []) {
        const stopIds = stopIdsByParadaId.get(paradaId);
        if (!stopIds) continue;

        for (const stopId of stopIds) {
          addRouteName(routeNamesByStopId, stopId, routeName);
        }
      }
    }
  }

  return routeNamesByStopId;
}

async function loadSnapshot(): Promise<CachedSnapshot> {
  const loaders = await getSnapshotLoaders();
  const metadata = loaders.loadMetadata();

  if (metadata.minotor_version !== EXPECTED_MINOTOR_VERSION) {
    throw new Error(
      `Snapshot minotor version mismatch: expected ${EXPECTED_MINOTOR_VERSION}, got ${metadata.minotor_version}`,
    );
  }

  if (metadata.schema_version !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(`Snapshot schema version mismatch: expected ${EXPECTED_SCHEMA_VERSION}, got ${metadata.schema_version}`);
  }

  const bytes = await loaders.loadBytes();
  const { blobs } = decodeSnapshotBundle(bytes);
  const stopsIndex = StopsIndex.fromData(requiredBlob(blobs, 'stops'));
  const timetables = new Map<DiaTipo, Timetable>();
  const routers = new Map<DiaTipo, Router>();

  for (const diaTipo of DIA_TIPOS) {
    const timetable = Timetable.fromData(requiredBlob(blobs, `tt-${diaTipo}`));
    timetables.set(diaTipo, timetable);
    routers.set(diaTipo, new Router(timetable, stopsIndex));
  }

  return { metadata, stopsIndex, timetables, routers };
}

export function getSnapshot(): Promise<CachedSnapshot> {
  if (snapshotOverride) {
    return Promise.resolve(snapshotOverride);
  }

  if (!snapshotPromise) {
    snapshotPromise = loadSnapshot();
  }

  return snapshotPromise;
}

export function prefetchSnapshot() {
  return getSnapshot();
}

export function getTimetable(snapshot: CachedSnapshot, diaTipo: DiaTipo) {
  const timetable = snapshot.timetables.get(diaTipo);
  if (!timetable) {
    throw new Error(`Snapshot has no timetable for ${diaTipo}`);
  }
  return timetable;
}

export function getRouter(snapshot: CachedSnapshot, diaTipo: DiaTipo) {
  const router = snapshot.routers.get(diaTipo);
  if (!router) {
    throw new Error(`Snapshot has no router for ${diaTipo}`);
  }
  return router;
}

export function getRouteNamesByStopId(snapshot: CachedSnapshot): RouteNamesByStopId {
  const cached = routeNamesByStopIdCache.get(snapshot);
  if (cached) {
    return cached;
  }

  const routeNamesByStopId = buildRouteNamesByStopId(snapshot);
  routeNamesByStopIdCache.set(snapshot, routeNamesByStopId);
  return routeNamesByStopId;
}

export function setSnapshotForTesting(snapshot: CachedSnapshot | null) {
  snapshotOverride = snapshot;
  snapshotPromise = null;
}

export function setSnapshotLoadersForTesting(loaders: SnapshotLoaders | null) {
  snapshotLoadersOverride = loaders;
  snapshotPromise = null;
}
