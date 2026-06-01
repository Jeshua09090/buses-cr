import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { finalWalkMeters, legRouteText } from './_shared';

const MAX_DIRECT_SCORE_DELTA = 30;
const MAX_DIRECT_ORIGIN_WALK_DELTA_METERS = 250;
const MAX_DIRECT_TOTAL_WALK_DELTA_METERS = 350;
const MAX_DIRECT_FINAL_WALK_DELTA_METERS = 250;

const TRANSFER_WHEN_DIRECT_ALTERNATIVE_EXISTS_PENALTY: JourneyContextPenaltyReason = {
  id: 'raptor-direct-alternative-transfer-penalty',
  label: 'Evita transbordo entre ramas cuando existe una opcion directa equivalente.',
  penalty: 35,
};

function isViableDirectAlternative(params: {
  directCandidate: PlannedJourney;
  transferCandidate: PlannedJourney;
}) {
  const directLeg = params.directCandidate.legs[0];
  const transferFirstLeg = params.transferCandidate.legs[0];
  if (!directLeg || !transferFirstLeg) return false;
  if (params.directCandidate.legs.length !== 1) return false;
  if (legRouteText(params.directCandidate, 0) !== legRouteText(params.transferCandidate, 0)) return false;
  if (
    params.directCandidate.originWalkMeters >
    params.transferCandidate.originWalkMeters + MAX_DIRECT_ORIGIN_WALK_DELTA_METERS
  ) {
    return false;
  }
  if (params.directCandidate.score > params.transferCandidate.score + MAX_DIRECT_SCORE_DELTA) return false;
  if (
    params.directCandidate.totalWalkMeters >
    params.transferCandidate.totalWalkMeters + MAX_DIRECT_TOTAL_WALK_DELTA_METERS
  ) {
    return false;
  }
  if (
    finalWalkMeters(params.directCandidate) >
    finalWalkMeters(params.transferCandidate) + MAX_DIRECT_FINAL_WALK_DELTA_METERS
  ) {
    return false;
  }

  return true;
}

export function buildDirectAlternativeReasons(params: {
  journey: PlannedJourney;
  ranked?: PlannedJourney[];
}): JourneyContextPenaltyReason[] {
  if (params.journey.legs.length < 2) return [];

  const ranked = params.ranked ?? [];
  const hasDirectAlternative = ranked.some((candidate) => {
    if (candidate === params.journey || candidate.id === params.journey.id) return false;
    return isViableDirectAlternative({
      directCandidate: candidate,
      transferCandidate: params.journey,
    });
  });

  return hasDirectAlternative ? [TRANSFER_WHEN_DIRECT_ALTERNATIVE_EXISTS_PENALTY] : [];
}
