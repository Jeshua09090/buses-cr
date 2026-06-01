import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { journeyRouteText } from './_shared';
import { destinationInBox, LA_CAMPINA_BOX } from './geo-boxes';

function isLaCampinaCorridor(routeText: string) {
  return (
    (routeText.includes('GUAYABAL') && routeText.includes('LA CAMPINA')) ||
    routeText.includes('CAMPINA POR ASUNCION')
  );
}

function isLongWalkSanIsidroFallback(journey: PlannedJourney, routeText: string) {
  return (
    journey.totalWalkMeters >= 800 &&
    (routeText.includes('SAN ISIDRO - EL MOLINO') ||
      routeText.includes('SAN ISIDRO-EL MOLINO'))
  );
}

export function buildLaCampinaCorridorReasons(params: {
  journey: PlannedJourney;
  destination: [number, number] | null;
}) {
  const reasons: JourneyContextPenaltyReason[] = [];

  if (!destinationInBox(params.destination, LA_CAMPINA_BOX)) {
    return reasons;
  }

  const routeText = journeyRouteText(params.journey);
  if (isLaCampinaCorridor(routeText)) {
    reasons.push({
      id: 'raptor-la-campina-corridor-bonus',
      label: 'Usa el corredor sembrado de La Campina.',
      penalty: -25,
    });
  }

  if (isLongWalkSanIsidroFallback(params.journey, routeText)) {
    reasons.push({
      id: 'raptor-la-campina-fallback-long-walk',
      label: 'San Isidro/Molino exige caminar mucho hasta La Campina.',
      penalty: 12,
    });
  }

  return reasons;
}
