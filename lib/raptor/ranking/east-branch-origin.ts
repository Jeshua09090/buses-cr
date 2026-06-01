import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { hasAlternativeMatching, journeyRouteText } from './_shared';
import { destinationInBox, LA_ALEGRIA_BOX, LA_CAMPINA_BOX, PEDREGAL_BOX, type GeoBox } from './geo-boxes';

type EastBranchOrigin = {
  box: GeoBox;
  routeHints: readonly string[];
  matchMode?: 'all' | 'any';
};

const EAST_BRANCH_ORIGINS: readonly EastBranchOrigin[] = [
  {
    box: LA_ALEGRIA_BOX,
    routeHints: ['LA ALEGRIA', 'PALOMO'],
  },
  {
    box: LA_CAMPINA_BOX,
    routeHints: ['LA CAMPINA', 'GUAYABAL'],
  },
  {
    box: PEDREGAL_BOX,
    routeHints: ['PEDREGAL', 'LOYOLA', 'EL CARMEN', 'QUIRCOT'],
    matchMode: 'any',
  },
];

const LOCAL_RETURN_BONUS: JourneyContextPenaltyReason = {
  id: 'raptor-east-branch-origin-local-return-bonus',
  label: 'Sale por la rama local correcta del origen este.',
  penalty: -8,
};

const WRONG_BRANCH_FROM_LOCAL_ORIGIN_PENALTY: JourneyContextPenaltyReason = {
  id: 'raptor-east-branch-origin-wrong-branch-when-local-return-available',
  label: 'Sale desde una rama vecina aunque existe la rama local del origen.',
  penalty: 45,
};

function matchingOrigin(origin: [number, number] | null) {
  return EAST_BRANCH_ORIGINS.find((candidate) => destinationInBox(origin, candidate.box)) ?? null;
}

function isLocalReturn(journey: PlannedJourney, origin: EastBranchOrigin) {
  const text = journeyRouteText(journey);
  if (origin.matchMode === 'any') {
    return origin.routeHints.some((hint) => text.includes(hint));
  }

  return origin.routeHints.every((hint) => text.includes(hint));
}

function hasLocalReturnAlternative(
  journey: PlannedJourney,
  candidates: PlannedJourney[],
  origin: EastBranchOrigin,
) {
  return hasAlternativeMatching(journey, candidates, (candidate) => isLocalReturn(candidate, origin));
}

export function buildEastBranchOriginPreferenceReasons(params: {
  journey: PlannedJourney;
  origin: [number, number] | null;
  ranked?: PlannedJourney[];
}): JourneyContextPenaltyReason[] {
  const origin = matchingOrigin(params.origin);
  if (!origin) return [];

  if (isLocalReturn(params.journey, origin)) {
    return [LOCAL_RETURN_BONUS];
  }

  if (hasLocalReturnAlternative(params.journey, params.ranked ?? [], origin)) {
    return [WRONG_BRANCH_FROM_LOCAL_ORIGIN_PENALTY];
  }

  return [];
}
