import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { hasAlternativeMatching, journeyRouteText } from './_shared';
import { destinationInBox, OCHOMOGO_BOX, RIO_LORO_BOX } from './geo-boxes';

function looksLikeTurrialbaExpressLocalHop(journey: PlannedJourney) {
  const routeText = journeyRouteText(journey);
  return routeText.includes('TURRIALBA') && routeText.includes('EXPRESO');
}

function looksLikeRioLoroMoovitCorridor(journey: PlannedJourney) {
  const routeText = journeyRouteText(journey);
  if (routeText.includes('TURRIALBA')) return false;
  if (routeText.includes('CARTAGO - TRES RIOS')) return true;

  return (
    routeText.includes('SAN JOSE') &&
    routeText.includes('CARTAGO') &&
    (routeText.includes('TARAS') ||
      routeText.includes('LA LIMA') ||
      routeText.includes('TRES RIOS') ||
      routeText.includes('SAN PEDRO') ||
      routeText.includes('ZAPOTE'))
  );
}

function hasComparableMoovitCorridorAlternative(params: {
  journey: PlannedJourney;
  ranked?: PlannedJourney[];
}) {
  return hasAlternativeMatching(params.journey, params.ranked ?? [], (candidate) => {
    if (!looksLikeRioLoroMoovitCorridor(candidate)) return false;
    if (candidate.score > params.journey.score + 24) return false;
    if (candidate.totalWalkMeters > params.journey.totalWalkMeters + 500) return false;
    if (candidate.destinationWalkMeters > params.journey.destinationWalkMeters + 300) {
      return false;
    }

    return true;
  });
}

export function buildRioLoroCorridorReasons(params: {
  journey: PlannedJourney;
  destination: [number, number] | null;
  ranked?: PlannedJourney[];
}) {
  const reasons: JourneyContextPenaltyReason[] = [];
  if (
    !destinationInBox(params.destination, RIO_LORO_BOX) &&
    !destinationInBox(params.destination, OCHOMOGO_BOX)
  ) {
    return reasons;
  }
  if (!looksLikeTurrialbaExpressLocalHop(params.journey)) return reasons;
  if (!hasComparableMoovitCorridorAlternative(params)) return reasons;

  reasons.push({
    id: 'raptor-rio-loro-turrialba-express-local-hop',
    label: 'Para Ochomogo/Rio Loro hay corredor Cartago/Taras mas natural que usar Turrialba expreso como tramo local.',
    penalty: 14,
  });

  return reasons;
}
