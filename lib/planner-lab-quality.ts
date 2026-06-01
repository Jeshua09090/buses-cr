import { getRouteDisplayNote } from './route-display';

export type JourneyDisplayAdvice = {
  id: 'walk-competitive-short-hop' | 'walk-network-detour-watch' | 'itcr-route-source';
  icon: 'walk-outline' | 'warning-outline' | 'information-circle-outline';
  label: string;
  tone: 'neutral' | 'warning';
};

type AlternativeLike = {
  id: string;
  routeName?: string | null;
  dropStopName?: string | null;
  originWalkMeters: number;
  destinationWalkMeters: number;
  totalWalkMeters: number;
};

const SAME_ROUTE_DUPLICATE_ORIGIN_WALK_DELTA_METERS = 180;
const SAME_ROUTE_DUPLICATE_SCORE_TOLERANCE = 2;

function normalizeComparableText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('es-CR');
}

function duplicateKey(journey: AlternativeLike) {
  const routeName = normalizeComparableText(journey.routeName);
  const dropStopName = normalizeComparableText(journey.dropStopName);
  if (!routeName || !dropStopName) return null;
  return `${routeName}@@${dropStopName}`;
}

export function findInferiorSameRouteBoardingAlternatives(params: {
  journeys: AlternativeLike[];
  displayScoreByJourneyId?: Map<string, number>;
}) {
  const inferiorIds = new Set<string>();

  for (const candidate of params.journeys) {
    const key = duplicateKey(candidate);
    if (!key) continue;

    const candidateScore = params.displayScoreByJourneyId?.get(candidate.id) ?? 0;
    const hasBetterBoarding = params.journeys.some((alternative) => {
      if (alternative.id === candidate.id) return false;
      if (duplicateKey(alternative) !== key) return false;
      if (
        alternative.originWalkMeters + SAME_ROUTE_DUPLICATE_ORIGIN_WALK_DELTA_METERS >
        candidate.originWalkMeters
      ) {
        return false;
      }
      if (alternative.totalWalkMeters >= candidate.totalWalkMeters) return false;

      const alternativeScore = params.displayScoreByJourneyId?.get(alternative.id) ?? 0;
      return candidateScore >= alternativeScore - SAME_ROUTE_DUPLICATE_SCORE_TOLERANCE;
    });

    if (hasBetterBoarding) inferiorIds.add(candidate.id);
  }

  return inferiorIds;
}

export function buildJourneyDisplayAdvice(params: {
  destinationName?: string | null;
  routeName?: string | null;
  networkWalkDeltaMeters?: number | null;
  totalBusMeters?: number | null;
  totalWalkMeters: number | null;
  tripDistanceMeters?: number | null;
}) {
  const advice: JourneyDisplayAdvice[] = [];
  const totalBusMeters = params.totalBusMeters ?? null;
  const totalWalkMeters = params.totalWalkMeters ?? null;
  const tripDistanceMeters = params.tripDistanceMeters ?? null;
  const networkWalkDeltaMeters = params.networkWalkDeltaMeters ?? null;

  const walkingMayBeClearer =
    typeof tripDistanceMeters === 'number' &&
    typeof totalBusMeters === 'number' &&
    typeof totalWalkMeters === 'number' &&
    tripDistanceMeters <= 1_700 &&
    totalWalkMeters >= 350 &&
    totalBusMeters <= 3_500;

  if (walkingMayBeClearer) {
    advice.push({
      id: 'walk-competitive-short-hop',
      icon: 'walk-outline',
      label: 'Este viaje es corto: caminar puede ser mas claro si no queres esperar bus.',
      tone: 'warning',
    });
  }

  if (typeof networkWalkDeltaMeters === 'number' && networkWalkDeltaMeters >= 350) {
    advice.push({
      id: 'walk-network-detour-watch',
      icon: 'warning-outline',
      label: 'La caminata real por calles sube bastante frente a la linea recta; revisa si esa subida te sirve.',
      tone: 'warning',
    });
  }

  const routeNote = getRouteDisplayNote(params.routeName);
  if (routeNote) {
    advice.push({
      id: 'itcr-route-source',
      icon: 'information-circle-outline',
      label: routeNote,
      tone: 'neutral',
    });
  }

  return advice;
}
