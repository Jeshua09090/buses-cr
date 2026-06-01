import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { finalWalkMeters, hasAlternativeMatching, includesAny, journeyRouteText } from './_shared';
import { destinationInBox, PALI_TARAS_BOX, TEJAR_EAST_BOX } from './geo-boxes';

const TARAS_FEEDER_HINTS = ['CARTAGO - TARAS - SAN NICOLAS'] as const;
const TEJAR_ADJACENT_BRANCH_HINTS = [
  'SAN RAFAEL DE OREAMUNO',
  'PARQUE INDUSTRIAL',
  'SANTA ELENA ABAJO',
  'LA CAMPINA',
  'TIERRA BLANCA',
  'COT',
] as const;

const MAX_FEEDER_ORIGIN_WALK_METERS = 400;
const MAX_FEEDER_FINAL_WALK_METERS = 700;
const MAX_FEEDER_TOTAL_WALK_DELTA_METERS = 500;
const MAX_FEEDER_SCORE_DELTA = 80;

const ADJACENT_BRANCH_WHEN_TARAS_FEEDER_EXISTS_PENALTY: JourneyContextPenaltyReason = {
  id: 'raptor-taras-tejar-adjacent-branch-penalty',
  label: 'Desde Taras hacia Tejar este hay un alimentador local cercano disponible.',
  penalty: 60,
};

function isTarasFeeder(journey: PlannedJourney) {
  return includesAny(journeyRouteText(journey), TARAS_FEEDER_HINTS);
}

function isAdjacentTejarBranch(journey: PlannedJourney) {
  return includesAny(journeyRouteText(journey), TEJAR_ADJACENT_BRANCH_HINTS);
}

function hasViableTarasFeederAlternative(params: {
  journey: PlannedJourney;
  ranked: PlannedJourney[];
}) {
  return hasAlternativeMatching(params.journey, params.ranked, (candidate) => {
    if (!isTarasFeeder(candidate)) return false;
    if (candidate.originWalkMeters > MAX_FEEDER_ORIGIN_WALK_METERS) return false;
    if (finalWalkMeters(candidate) > MAX_FEEDER_FINAL_WALK_METERS) return false;
    if (candidate.score > params.journey.score + MAX_FEEDER_SCORE_DELTA) return false;
    if (candidate.totalWalkMeters > params.journey.totalWalkMeters + MAX_FEEDER_TOTAL_WALK_DELTA_METERS) {
      return false;
    }

    return true;
  });
}

export function buildTarasTejarFeederReasons(params: {
  journey: PlannedJourney;
  origin: [number, number] | null;
  destination: [number, number] | null;
  ranked?: PlannedJourney[];
}): JourneyContextPenaltyReason[] {
  if (!destinationInBox(params.origin, PALI_TARAS_BOX)) return [];
  if (!destinationInBox(params.destination, TEJAR_EAST_BOX)) return [];
  if (isTarasFeeder(params.journey)) return [];
  if (!isAdjacentTejarBranch(params.journey)) return [];
  if (!hasViableTarasFeederAlternative({ journey: params.journey, ranked: params.ranked ?? [] })) {
    return [];
  }

  return [ADJACENT_BRANCH_WHEN_TARAS_FEEDER_EXISTS_PENALTY];
}
