import type { Stop, StopsIndex } from 'minotor';

import { haversineMeters } from './geo';
import type { FindNearestStopsParams, LatLng, NearbyStopCandidate } from './types';

const PROXIMITY_FLOOR = 6;
const DESTINATION_COMPATIBLE_RESERVE = 8;
// FU2-rev: output remains capped at 24, but Terminal Cartago's relevant Sanatorio
// boarding stop is around distance rank 179; a 5x pool cannot even inspect it.
const DIVERSITY_POOL_MULTIPLIER = 10;

function toNumberOrNull(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stopToCandidate(stop: Stop, point: LatLng): NearbyStopCandidate | null {
  if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') {
    return null;
  }

  const distanceMeters = haversineMeters(point, { lat: stop.lat, lng: stop.lon });

  return {
    stopId: stop.id,
    sourceStopId: stop.sourceStopId ?? null,
    paradaId: toNumberOrNull(stop.sourceStopId),
    name: stop.name,
    lat: stop.lat,
    lng: stop.lon,
    distanceMeters,
  };
}

function addCandidate(params: {
  candidate: NearbyStopCandidate;
  selected: NearbyStopCandidate[];
  selectedStopIds: Set<number>;
  seenRouteNames: Set<string>;
  coveredDestinationRouteNames: Set<string>;
  routeNamesByStopId?: FindNearestStopsParams['routeNamesByStopId'];
  destinationRouteNames?: FindNearestStopsParams['destinationRouteNames'];
}) {
  params.selected.push(params.candidate);
  params.selectedStopIds.add(params.candidate.stopId);

  for (const routeName of params.routeNamesByStopId?.get(params.candidate.stopId) ?? []) {
    params.seenRouteNames.add(routeName);
    if (params.destinationRouteNames?.has(routeName)) {
      params.coveredDestinationRouteNames.add(routeName);
    }
  }
}

function introducesRouteName(
  candidate: NearbyStopCandidate,
  routeNamesByStopId: NonNullable<FindNearestStopsParams['routeNamesByStopId']>,
  seenRouteNames: ReadonlySet<string>,
) {
  for (const routeName of routeNamesByStopId.get(candidate.stopId) ?? []) {
    if (!seenRouteNames.has(routeName)) {
      return true;
    }
  }
  return false;
}

function fillByProximity(params: {
  pool: NearbyStopCandidate[];
  selected: NearbyStopCandidate[];
  selectedStopIds: Set<number>;
  seenRouteNames: Set<string>;
  coveredDestinationRouteNames: Set<string>;
  limit: number;
  routeNamesByStopId?: FindNearestStopsParams['routeNamesByStopId'];
  destinationRouteNames?: FindNearestStopsParams['destinationRouteNames'];
}) {
  for (const candidate of params.pool) {
    if (params.selected.length >= params.limit) break;
    if (params.selectedStopIds.has(candidate.stopId)) continue;

    addCandidate({
      candidate,
      selected: params.selected,
      selectedStopIds: params.selectedStopIds,
      seenRouteNames: params.seenRouteNames,
      coveredDestinationRouteNames: params.coveredDestinationRouteNames,
      routeNamesByStopId: params.routeNamesByStopId,
      destinationRouteNames: params.destinationRouteNames,
    });
  }
}

function destinationCompatibleRouteNames(params: {
  candidate: NearbyStopCandidate;
  routeNamesByStopId: NonNullable<FindNearestStopsParams['routeNamesByStopId']>;
  destinationRouteNames: NonNullable<FindNearestStopsParams['destinationRouteNames']>;
  coveredDestinationRouteNames: ReadonlySet<string>;
}) {
  const compatibleRouteNames: string[] = [];

  for (const routeName of params.routeNamesByStopId.get(params.candidate.stopId) ?? []) {
    if (params.destinationRouteNames.has(routeName) && !params.coveredDestinationRouteNames.has(routeName)) {
      compatibleRouteNames.push(routeName);
    }
  }

  return compatibleRouteNames;
}

export function findNearestStops(params: FindNearestStopsParams): NearbyStopCandidate[] {
  const stops = params.stopsIndex.findStopsByLocation(
    params.point.lat,
    params.point.lng,
    params.limit * DIVERSITY_POOL_MULTIPLIER,
    params.radiusMeters / 1000,
  );

  const pool = stops
    .map((stop) => stopToCandidate(stop, params.point))
    .filter((candidate): candidate is NearbyStopCandidate => Boolean(candidate))
    .filter((candidate) => candidate.distanceMeters <= params.radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const selected: NearbyStopCandidate[] = [];
  const selectedStopIds = new Set<number>();
  const seenRouteNames = new Set<string>();
  const coveredDestinationRouteNames = new Set<string>();

  fillByProximity({
    pool: pool.slice(0, Math.min(PROXIMITY_FLOOR, params.limit)),
    selected,
    selectedStopIds,
    seenRouteNames,
    coveredDestinationRouteNames,
    limit: params.limit,
    routeNamesByStopId: params.routeNamesByStopId,
    destinationRouteNames: params.destinationRouteNames,
  });

  if (params.routeNamesByStopId && params.destinationRouteNames?.size && selected.length < params.limit) {
    let destinationCompatibleSelected = 0;

    for (const candidate of pool) {
      if (selected.length >= params.limit) break;
      if (destinationCompatibleSelected >= DESTINATION_COMPATIBLE_RESERVE) break;
      if (selectedStopIds.has(candidate.stopId)) continue;

      const compatibleRouteNames = destinationCompatibleRouteNames({
        candidate,
        routeNamesByStopId: params.routeNamesByStopId,
        destinationRouteNames: params.destinationRouteNames,
        coveredDestinationRouteNames,
      });
      if (compatibleRouteNames.length === 0) continue;

      addCandidate({
        candidate,
        selected,
        selectedStopIds,
        seenRouteNames,
        coveredDestinationRouteNames,
        routeNamesByStopId: params.routeNamesByStopId,
        destinationRouteNames: params.destinationRouteNames,
      });
      destinationCompatibleSelected += 1;
    }
  }

  if (params.routeNamesByStopId && selected.length < params.limit) {
    for (const candidate of pool) {
      if (selected.length >= params.limit) break;
      if (selectedStopIds.has(candidate.stopId)) continue;
      if (!introducesRouteName(candidate, params.routeNamesByStopId, seenRouteNames)) continue;

      addCandidate({
        candidate,
        selected,
        selectedStopIds,
        seenRouteNames,
        coveredDestinationRouteNames,
        routeNamesByStopId: params.routeNamesByStopId,
        destinationRouteNames: params.destinationRouteNames,
      });
    }
  }

  fillByProximity({
    pool,
    selected,
    selectedStopIds,
    seenRouteNames,
    coveredDestinationRouteNames,
    limit: params.limit,
    routeNamesByStopId: params.routeNamesByStopId,
    destinationRouteNames: params.destinationRouteNames,
  });

  return selected.sort((a, b) => a.distanceMeters - b.distanceMeters);
}
