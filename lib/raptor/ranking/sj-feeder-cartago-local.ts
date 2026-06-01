import type { JourneyContextPenaltyReason, JourneyLeg, PlannedJourney } from '@/lib/journey-planner';

import { haversineMeters } from '../geo';
import { includesAny, legRouteText, hasAlternativeMatching } from './_shared';
import { destinationInAnyCartagoLocalBox } from './geo-boxes';
import { STRONG_INTERURBAN_HINTS } from './local-feeder-bias';

const SHORT_FEEDER_MAX_DISTANCE_METERS = 4000;
const PENALTY_REASON: JourneyContextPenaltyReason = {
  id: 'raptor-sj-feeder-when-local-available-for-cartago-dest',
  label: 'Usa un bus de San Jose como alimentador corto cuando el destino es local en Cartago.',
  penalty: 50,
};
const NO_ALTERNATIVE_PENALTY_REASON: JourneyContextPenaltyReason = {
  id: 'raptor-sj-feeder-cartago-dest-no-alternative',
  label: 'Usa un bus de San Jose como alimentador corto hacia un destino local en Cartago.',
  penalty: 30,
};

function isInterurbanFirstLeg(journey: PlannedJourney) {
  const firstLegText = legRouteText(journey, 0);
  return firstLegText.length > 0 && includesAny(firstLegText, STRONG_INTERURBAN_HINTS);
}

function validStopPoint(stop: JourneyLeg['boardStop']) {
  if (!stop) return null;
  if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return null;
  return { lat: stop.lat, lng: stop.lng };
}

function firstLegRideDistanceMeters(journey: PlannedJourney) {
  const firstLeg = journey.legs[0];
  if (!firstLeg) return null;

  const boardStop = validStopPoint(firstLeg.boardStop);
  const alightStop = validStopPoint(firstLeg.alightStop);
  if (!boardStop || !alightStop) return null;

  return haversineMeters(boardStop, alightStop);
}

function hasNonInterurbanAlternative(journey: PlannedJourney, candidates: PlannedJourney[]) {
  return hasAlternativeMatching(journey, candidates, (candidate) => {
    const firstLegText = legRouteText(candidate, 0);
    return firstLegText.length > 0 && !includesAny(firstLegText, STRONG_INTERURBAN_HINTS);
  });
}

export function buildSjFeederCartagoLocalReasons(params: {
  journey: PlannedJourney;
  destination: [number, number] | null;
  ranked?: PlannedJourney[];
}): JourneyContextPenaltyReason[] {
  if (!destinationInAnyCartagoLocalBox(params.destination)) return [];
  if (!isInterurbanFirstLeg(params.journey)) return [];

  const rideDistanceMeters = firstLegRideDistanceMeters(params.journey);
  if (rideDistanceMeters === null || rideDistanceMeters >= SHORT_FEEDER_MAX_DISTANCE_METERS) {
    return [];
  }

  const hasAlternative = hasNonInterurbanAlternative(params.journey, params.ranked ?? []);
  return [hasAlternative ? PENALTY_REASON : NO_ALTERNATIVE_PENALTY_REASON];
}
