import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { finalWalkMeters } from './_shared';

const MIN_FINAL_WALK_SAVINGS_METERS = 220;
const MIN_TOTAL_WALK_SAVINGS_METERS = 250;
const NEAR_FINAL_WALK_MAX_METERS = 500;
const MAX_SCORE_DELTA = 8;
const DIRECT_LONG_FINAL_WALK_MIN_METERS = 900;
const DIRECT_LONG_WALK_MIN_TOTAL_SAVINGS_METERS = 600;
const DIRECT_LONG_WALK_MAX_SCORE_DELTA = 10;

const WALK_DOMINANT_ALTERNATIVE_PENALTY: JourneyContextPenaltyReason = {
  id: 'raptor-walk-dominant-alternative-penalty',
  label: 'Prefiere una alternativa que camina bastante menos sin perder mucho tiempo.',
  penalty: 10,
};

function isWalkDominantAlternative(params: {
  journey: PlannedJourney;
  candidate: PlannedJourney;
}) {
  if (params.journey.legs.length === 1) {
    if (params.candidate.legs.length > 2) return false;
    if (finalWalkMeters(params.journey) < DIRECT_LONG_FINAL_WALK_MIN_METERS) return false;
    if (finalWalkMeters(params.candidate) > NEAR_FINAL_WALK_MAX_METERS) return false;
    if (
      params.candidate.totalWalkMeters >
      params.journey.totalWalkMeters - DIRECT_LONG_WALK_MIN_TOTAL_SAVINGS_METERS
    ) {
      return false;
    }
    if (params.candidate.score > params.journey.score + DIRECT_LONG_WALK_MAX_SCORE_DELTA) {
      return false;
    }

    return true;
  }

  if (params.journey.legs.length < 2 || params.candidate.legs.length < 2) return false;
  if (params.candidate.legs.length > params.journey.legs.length) return false;
  if (finalWalkMeters(params.candidate) > NEAR_FINAL_WALK_MAX_METERS) return false;
  if (
    finalWalkMeters(params.candidate) >
    finalWalkMeters(params.journey) - MIN_FINAL_WALK_SAVINGS_METERS
  ) {
    return false;
  }
  if (
    params.candidate.totalWalkMeters >
    params.journey.totalWalkMeters - MIN_TOTAL_WALK_SAVINGS_METERS
  ) {
    return false;
  }
  if (params.candidate.score > params.journey.score + MAX_SCORE_DELTA) return false;

  return true;
}

export function buildWalkDominantAlternativeReasons(params: {
  journey: PlannedJourney;
  ranked?: PlannedJourney[];
}): JourneyContextPenaltyReason[] {
  const ranked = params.ranked ?? [];
  const hasWalkDominantAlternative = ranked.some((candidate) => {
    if (candidate === params.journey || candidate.id === params.journey.id) return false;
    return isWalkDominantAlternative({
      journey: params.journey,
      candidate,
    });
  });

  return hasWalkDominantAlternative ? [WALK_DOMINANT_ALTERNATIVE_PENALTY] : [];
}
