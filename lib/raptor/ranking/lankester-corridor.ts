import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { includesAny, journeyRouteText } from './_shared';
import { destinationInBox, LANKESTER_BOX } from './geo-boxes';

const LANKESTER_CORRIDOR_HINTS = [
  'LAGUNA DE DONA ANA',
  'OBREROS Y CAMPESINOS',
  'LOS HELECHOS',
] as const;

function isLankesterCorridor(journey: PlannedJourney) {
  return includesAny(journeyRouteText(journey), LANKESTER_CORRIDOR_HINTS);
}

export function buildLankesterCorridorReasons(params: {
  journey: PlannedJourney;
  destination: [number, number] | null;
}) {
  const reasons: JourneyContextPenaltyReason[] = [];
  if (!destinationInBox(params.destination, LANKESTER_BOX)) return reasons;
  if (!isLankesterCorridor(params.journey)) return reasons;

  const metrics = params.journey.geoMetrics;
  const finalWalkStraightMeters = metrics?.finalWalkStraightMeters ?? null;
  const finalWalkNetworkMeters = metrics?.finalWalkNetworkMeters ?? null;
  const walkNetworkPenalty = metrics?.walkNetworkPenalty ?? null;

  if (
    typeof finalWalkStraightMeters !== 'number' ||
    typeof finalWalkNetworkMeters !== 'number' ||
    typeof walkNetworkPenalty !== 'number'
  ) {
    return reasons;
  }

  if (
    finalWalkStraightMeters > 350 ||
    finalWalkNetworkMeters > 1_300 ||
    walkNetworkPenalty <= 320
  ) {
    return reasons;
  }

  reasons.push({
    id: 'raptor-lankester-near-stop-detour-normalization',
    label: 'La parada queda junto a Lankester; el desvio de entrada no debe ocultar el corredor correcto.',
    penalty: -Math.round(walkNetworkPenalty - 260),
  });

  return reasons;
}
