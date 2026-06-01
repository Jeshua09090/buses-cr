import type { PlannedJourney } from '@/lib/journey-planner';

export function normalizeRaptorText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function journeyRouteText(journey: PlannedJourney) {
  return normalizeRaptorText(
    [
      journey.routeName,
      journey.routeCode,
      ...journey.legs.flatMap((leg) => [leg.routeName, leg.routeCode]),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

export function legRouteText(journey: PlannedJourney, legIndex: number) {
  const leg = journey.legs[legIndex];
  return normalizeRaptorText([leg?.routeName, leg?.routeCode].filter(Boolean).join(' '));
}

export function finalWalkMeters(journey: PlannedJourney) {
  const geoFinalWalk = journey.geoMetrics?.finalWalkNetworkMeters ?? journey.geoMetrics?.finalWalkMeters;
  if (typeof geoFinalWalk === 'number' && Number.isFinite(geoFinalWalk)) {
    return geoFinalWalk;
  }

  return journey.destinationWalkMeters;
}

export function includesAny(text: string, hints: readonly string[]) {
  return hints.some((hint) => text.includes(hint));
}

export function hasAlternativeMatching(
  journey: PlannedJourney,
  candidates: PlannedJourney[],
  predicate: (candidate: PlannedJourney) => boolean,
) {
  return candidates.some((candidate) => {
    if (candidate === journey || candidate.id === journey.id) return false;
    return predicate(candidate);
  });
}
