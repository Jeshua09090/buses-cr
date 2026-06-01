import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { finalWalkMeters, hasAlternativeMatching, includesAny, journeyRouteText } from './_shared';
import {
  CACHI_BOX,
  destinationInBox,
  LA_ALEGRIA_BOX,
  PENAS_BLANCAS_BOX,
  SANTIAGO_BOX,
  type GeoBox,
} from './geo-boxes';

type EastBranchDestination = {
  box: GeoBox;
  routeHints: readonly string[];
};

const NEAR_BRANCH_DROP_MAX_WALK_METERS = 250;
const FAR_ADJACENT_BRANCH_DROP_MIN_WALK_METERS = 800;

const EAST_BRANCH_DESTINATIONS: readonly EastBranchDestination[] = [
  {
    box: PENAS_BLANCAS_BOX,
    routeHints: ['PENAS BLANCAS'],
  },
  {
    box: SANTIAGO_BOX,
    routeHints: ['SANTIAGO'],
  },
  {
    box: LA_ALEGRIA_BOX,
    routeHints: ['LA ALEGRIA', 'PALOMO'],
  },
  {
    box: CACHI_BOX,
    routeHints: ['CACHI'],
  },
];

const EXACT_BRANCH_BONUS: JourneyContextPenaltyReason = {
  id: 'raptor-east-branch-exact-destination-corridor-bonus',
  label: 'Usa la rama que llega directo al destino este.',
  penalty: -8,
};

const FAR_DROP_PENALTY: JourneyContextPenaltyReason = {
  id: 'raptor-east-branch-far-drop-when-exact-branch-available',
  label: 'Baja lejos en una rama vecina aunque existe la rama directa.',
  penalty: 70,
};

function matchingDestination(destination: [number, number] | null) {
  return EAST_BRANCH_DESTINATIONS.find((candidate) => destinationInBox(destination, candidate.box)) ?? null;
}

function hasRouteHint(journey: PlannedJourney, destination: EastBranchDestination) {
  return includesAny(journeyRouteText(journey), destination.routeHints);
}

function isNearExactBranch(journey: PlannedJourney, destination: EastBranchDestination) {
  return hasRouteHint(journey, destination) && finalWalkMeters(journey) <= NEAR_BRANCH_DROP_MAX_WALK_METERS;
}

function hasNearExactBranchAlternative(
  journey: PlannedJourney,
  candidates: PlannedJourney[],
  destination: EastBranchDestination,
) {
  return hasAlternativeMatching(journey, candidates, (candidate) => isNearExactBranch(candidate, destination));
}

export function buildEastBranchDestinationPreferenceReasons(params: {
  journey: PlannedJourney;
  destination: [number, number] | null;
  ranked?: PlannedJourney[];
}): JourneyContextPenaltyReason[] {
  const destination = matchingDestination(params.destination);
  if (!destination) return [];

  if (isNearExactBranch(params.journey, destination)) {
    return [EXACT_BRANCH_BONUS];
  }

  if (
    finalWalkMeters(params.journey) >= FAR_ADJACENT_BRANCH_DROP_MIN_WALK_METERS &&
    hasNearExactBranchAlternative(params.journey, params.ranked ?? [], destination)
  ) {
    return [FAR_DROP_PENALTY];
  }

  return [];
}
