import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { finalWalkMeters, normalizeRaptorText } from './_shared';

const FAR_DROP_MIN_WALK_METERS = 1_000;
const NEAR_ALTERNATIVE_MAX_WALK_METERS = 600;
const MIN_FINAL_WALK_SAVINGS_METERS = 800;
const MIN_TOTAL_WALK_SAVINGS_METERS = 250;
const MAX_ALTERNATIVE_SCORE_DELTA = 35;

const FAR_DROP_WHEN_NEAR_ALTERNATIVE_EXISTS_PENALTY: JourneyContextPenaltyReason = {
  id: 'raptor-far-drop-near-alternative-penalty',
  label: 'Prefiere una bajada cercana del mismo corredor sobre una caminata final larga.',
  penalty: 35,
};

function routeTexts(journey: PlannedJourney) {
  return journey.legs
    .map((leg) => normalizeRaptorText(leg.routeName || leg.routeCode))
    .filter(Boolean);
}

function sharesRouteLeg(params: { journey: PlannedJourney; candidate: PlannedJourney }) {
  const journeyRoutes = new Set(routeTexts(params.journey));
  if (!journeyRoutes.size) return false;

  return routeTexts(params.candidate).some((routeText) => journeyRoutes.has(routeText));
}

function isNearSameCorridorAlternative(params: {
  farDropJourney: PlannedJourney;
  candidate: PlannedJourney;
}) {
  if (!sharesRouteLeg({ journey: params.farDropJourney, candidate: params.candidate })) {
    return false;
  }

  const farFinalWalk = finalWalkMeters(params.farDropJourney);
  const candidateFinalWalk = finalWalkMeters(params.candidate);
  if (candidateFinalWalk > NEAR_ALTERNATIVE_MAX_WALK_METERS) return false;
  if (candidateFinalWalk > farFinalWalk - MIN_FINAL_WALK_SAVINGS_METERS) return false;
  if (
    params.candidate.totalWalkMeters >
    params.farDropJourney.totalWalkMeters - MIN_TOTAL_WALK_SAVINGS_METERS
  ) {
    return false;
  }
  if (params.candidate.score > params.farDropJourney.score + MAX_ALTERNATIVE_SCORE_DELTA) {
    return false;
  }

  return true;
}

export function buildFarDropAlternativeReasons(params: {
  journey: PlannedJourney;
  ranked?: PlannedJourney[];
}): JourneyContextPenaltyReason[] {
  if (params.journey.legs.length !== 1) return [];
  if (finalWalkMeters(params.journey) < FAR_DROP_MIN_WALK_METERS) return [];

  const ranked = params.ranked ?? [];
  const hasNearAlternative = ranked.some((candidate) => {
    if (candidate === params.journey || candidate.id === params.journey.id) return false;
    return isNearSameCorridorAlternative({
      farDropJourney: params.journey,
      candidate,
    });
  });

  return hasNearAlternative ? [FAR_DROP_WHEN_NEAR_ALTERNATIVE_EXISTS_PENALTY] : [];
}
