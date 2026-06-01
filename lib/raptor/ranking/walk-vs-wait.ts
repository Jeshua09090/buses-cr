import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { haversineMeters } from '../geo';

const SHORT_TRIP_MAX_METERS = 1_700;
const SHORT_TRIP_MIN_METERS = 250;
const MIN_AWKWARD_TOTAL_WALK_METERS = 350;
const MIN_AWKWARD_ENDPOINT_WALK_RATIO = 0.95;
const SHORT_HOP_PENALTY = 8;

function straightLineDistanceMeters(origin: [number, number], destination: [number, number]) {
  return haversineMeters(
    { lat: origin[1], lng: origin[0] },
    { lat: destination[1], lng: destination[0] },
  );
}

export function buildWalkVsWaitReasons(params: {
  destination: [number, number];
  journey: PlannedJourney;
  origin: [number, number];
}): JourneyContextPenaltyReason[] {
  const tripDistanceMeters = straightLineDistanceMeters(params.origin, params.destination);
  if (tripDistanceMeters < SHORT_TRIP_MIN_METERS) return [];
  if (tripDistanceMeters > SHORT_TRIP_MAX_METERS) return [];

  const awkwardWalkThreshold = Math.max(
    MIN_AWKWARD_TOTAL_WALK_METERS,
    tripDistanceMeters * MIN_AWKWARD_ENDPOINT_WALK_RATIO,
  );
  const endpointWalkMeters = params.journey.originWalkMeters + params.journey.destinationWalkMeters;
  if (endpointWalkMeters < awkwardWalkThreshold) return [];

  return [
    {
      id: 'raptor-walk-vs-wait-short-hop',
      label: 'En viajes cortos, caminar compite con esta combinacion de bus y espera.',
      penalty: SHORT_HOP_PENALTY,
    },
  ];
}
