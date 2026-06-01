import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { finalWalkMeters, hasAlternativeMatching, includesAny, journeyRouteText } from './_shared';
import { destinationInBox, PALI_TARAS_BOX, PASEO_METROPOLI_BOX } from './geo-boxes';

const TARAS_FEEDER_HINTS = ['CARTAGO - TARAS - SAN NICOLAS'] as const;
const CARTAGO_LA_LIMA_HINTS = ['CARTAGO - LA LIMA'] as const;
const LA_LIMA_HINTS = ['LA LIMA'] as const;
const PARQUE_INDUSTRIAL_HINTS = ['PARQUE INDUSTRIAL'] as const;

const MIN_ACCESS_WALK_METERS = 300;
const MAX_ACCESS_HOP_FINAL_WALK_METERS = 700;
const MAX_MOOVIT_BACKED_LOCAL_ORIGIN_WALK_METERS = 450;
const MAX_MOOVIT_BACKED_LOCAL_FINAL_WALK_METERS = 380;
const MAX_MOOVIT_BACKED_LOCAL_TOTAL_WALK_METERS = 950;
const MIN_TARAS_FAR_DROP_FINAL_WALK_METERS = 700;
const MAX_FEEDER_ORIGIN_WALK_METERS = 180;
const MAX_FEEDER_FINAL_WALK_METERS = 500;
const MAX_FEEDER_TOTAL_WALK_DELTA_METERS = 250;
const MAX_FEEDER_SCORE_DELTA = 22;
const MAX_PARQUE_INDUSTRIAL_ORIGIN_WALK_METERS = 750;
const MAX_PARQUE_INDUSTRIAL_FINAL_WALK_METERS = 350;
const MAX_PARQUE_INDUSTRIAL_TOTAL_WALK_DELTA_METERS = 600;
const MAX_PARQUE_INDUSTRIAL_SCORE_DELTA = 20;

const TARAS_PASEO_FEEDER_PENALTY: JourneyContextPenaltyReason = {
  id: 'raptor-taras-paseo-local-feeder-penalty',
  label: 'Desde Taras hacia Paseo/Walmart hay un alimentador local cercano disponible.',
  penalty: 22,
};

const TARAS_PASEO_LA_LIMA_TRANSFER_SECONDARY: JourneyContextPenaltyReason = {
  id: 'raptor-taras-paseo-la-lima-transfer-secondary',
  label: 'Desde Taras hacia Paseo/Walmart la vuelta por La Lima queda secundaria frente a Parque Industrial.',
  penalty: 4,
};

const TARAS_PASEO_TARAS_FAR_DROP_SECONDARY: JourneyContextPenaltyReason = {
  id: 'raptor-taras-paseo-taras-far-drop-secondary',
  label: 'Desde Taras hacia Paseo/Walmart una bajada lejana en Taras queda secundaria.',
  penalty: 8,
};

function isTarasFeeder(journey: PlannedJourney) {
  return includesAny(journeyRouteText(journey), TARAS_FEEDER_HINTS);
}

function isMoovitBackedLocalLaLimaAccess(journey: PlannedJourney) {
  if (journey.kind !== 'direct') return false;
  if (!includesAny(journeyRouteText(journey), CARTAGO_LA_LIMA_HINTS)) return false;
  if (journey.originWalkMeters > MAX_MOOVIT_BACKED_LOCAL_ORIGIN_WALK_METERS) return false;
  if (finalWalkMeters(journey) > MAX_MOOVIT_BACKED_LOCAL_FINAL_WALK_METERS) return false;
  if (journey.totalWalkMeters > MAX_MOOVIT_BACKED_LOCAL_TOTAL_WALK_METERS) return false;

  return true;
}

function isLaLimaAccessHop(journey: PlannedJourney) {
  if (journey.kind !== 'direct') return false;
  if (isTarasFeeder(journey)) return false;
  if (isMoovitBackedLocalLaLimaAccess(journey)) return false;
  if (!includesAny(journeyRouteText(journey), LA_LIMA_HINTS)) return false;
  if (journey.originWalkMeters < MIN_ACCESS_WALK_METERS) return false;
  if (finalWalkMeters(journey) > MAX_ACCESS_HOP_FINAL_WALK_METERS) return false;

  return true;
}

function isLaLimaTransfer(journey: PlannedJourney) {
  if (journey.kind !== 'transfer') return false;
  if (!isTarasFeeder(journey)) return false;
  if (!includesAny(journeyRouteText(journey), LA_LIMA_HINTS)) return false;

  return true;
}

function isTarasFarDrop(journey: PlannedJourney) {
  if (journey.kind !== 'direct') return false;
  if (!isTarasFeeder(journey)) return false;

  return finalWalkMeters(journey) > MIN_TARAS_FAR_DROP_FINAL_WALK_METERS;
}

function hasViableTarasFeederAlternative(params: {
  journey: PlannedJourney;
  ranked: PlannedJourney[];
}) {
  return hasAlternativeMatching(params.journey, params.ranked, (candidate) => {
    if (!isTarasFeeder(candidate)) return false;
    if (!includesAny(journeyRouteText(candidate), LA_LIMA_HINTS)) return false;
    if (candidate.originWalkMeters > MAX_FEEDER_ORIGIN_WALK_METERS) return false;
    if (finalWalkMeters(candidate) > MAX_FEEDER_FINAL_WALK_METERS) return false;
    if (candidate.score > params.journey.score + MAX_FEEDER_SCORE_DELTA) return false;
    if (candidate.totalWalkMeters > params.journey.totalWalkMeters + MAX_FEEDER_TOTAL_WALK_DELTA_METERS) {
      return false;
    }

    return true;
  });
}

function hasViableParqueIndustrialDirectAlternative(params: {
  journey: PlannedJourney;
  ranked: PlannedJourney[];
}) {
  return hasAlternativeMatching(params.journey, params.ranked, (candidate) => {
    if (candidate.kind !== 'direct') return false;
    if (!includesAny(journeyRouteText(candidate), PARQUE_INDUSTRIAL_HINTS)) return false;
    if (candidate.originWalkMeters > MAX_PARQUE_INDUSTRIAL_ORIGIN_WALK_METERS) return false;
    if (finalWalkMeters(candidate) > MAX_PARQUE_INDUSTRIAL_FINAL_WALK_METERS) return false;
    if (candidate.score > params.journey.score + MAX_PARQUE_INDUSTRIAL_SCORE_DELTA) return false;
    if (
      candidate.totalWalkMeters >
      params.journey.totalWalkMeters + MAX_PARQUE_INDUSTRIAL_TOTAL_WALK_DELTA_METERS
    ) {
      return false;
    }

    return true;
  });
}

export function buildTarasPaseoFeederReasons(params: {
  journey: PlannedJourney;
  origin: [number, number] | null;
  destination: [number, number] | null;
  ranked?: PlannedJourney[];
}): JourneyContextPenaltyReason[] {
  if (!destinationInBox(params.origin, PALI_TARAS_BOX)) return [];
  if (!destinationInBox(params.destination, PASEO_METROPOLI_BOX)) return [];
  const ranked = params.ranked ?? [];
  const reasons: JourneyContextPenaltyReason[] = [];

  if (
    isLaLimaAccessHop(params.journey) &&
    (hasViableTarasFeederAlternative({ journey: params.journey, ranked }) ||
      hasViableParqueIndustrialDirectAlternative({ journey: params.journey, ranked }))
  ) {
    reasons.push(TARAS_PASEO_FEEDER_PENALTY);
  }

  if (
    isLaLimaTransfer(params.journey) &&
    hasViableParqueIndustrialDirectAlternative({ journey: params.journey, ranked })
  ) {
    reasons.push(TARAS_PASEO_LA_LIMA_TRANSFER_SECONDARY);
  }

  if (
    isTarasFarDrop(params.journey) &&
    hasViableParqueIndustrialDirectAlternative({ journey: params.journey, ranked })
  ) {
    reasons.push(TARAS_PASEO_TARAS_FAR_DROP_SECONDARY);
  }

  return reasons;
}
