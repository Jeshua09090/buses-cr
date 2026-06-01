import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { includesAny, legRouteText, normalizeRaptorText } from './_shared';

export { normalizeRaptorText };

export const STRONG_INTERURBAN_HINTS = [
  'SAN JOSE',
  'PASO CANOAS',
  'LIMON',
  'PUNTARENAS',
  'ALAJUELA',
  'HEREDIA',
  'TURRIALBA',
  'NICOYA',
  'LIBERIA',
  'UPALA',
] as const;

const CARTAGO_EAST_REGIONAL_HINTS = [
  'CACHI',
  'TUCURRIQUE',
  'OROSI',
  'RIO MACHO',
  'PALOMO',
  'LA ALEGRIA',
  'PURISIL',
  'PENAS BLANCAS',
  'LOAIZA',
  'PIEDRA AZUL',
  'SANATORIO',
  'VOLCAN IRAZU',
  'TIERRA BLANCA',
] as const;

const LOCAL_CARTAGO_FEEDER_HINTS = [
  'CARTAGO - TARAS - SAN NICOLAS',
  'CARTAGO - TABLON',
  'CARTAGO - GUADALUPE',
  'CARTAGO - SAN BLAS',
  'CARTAGO - QUEBRADILLAS',
] as const;

function eastRegionalHintsInText(text: string) {
  return CARTAGO_EAST_REGIONAL_HINTS.filter((hint) => text.includes(hint));
}

function nationalFeederEastHints(journey: PlannedJourney) {
  if (journey.kind !== 'transfer' || journey.legs.length < 2) return [];

  const firstLegText = legRouteText(journey, 0);
  const secondLegText = legRouteText(journey, 1);
  if (!includesAny(firstLegText, STRONG_INTERURBAN_HINTS)) return [];

  return eastRegionalHintsInText(secondLegText);
}

function localFeederEastHints(journey: PlannedJourney) {
  if (journey.kind !== 'transfer' || journey.legs.length < 2) return [];

  const firstLegText = legRouteText(journey, 0);
  const secondLegText = legRouteText(journey, 1);
  if (!includesAny(firstLegText, LOCAL_CARTAGO_FEEDER_HINTS)) return [];

  return eastRegionalHintsInText(secondLegText);
}

function hasLocalFeederForEastHints(journeys: PlannedJourney[], eastHints: readonly string[]) {
  if (!eastHints.length) return false;

  return journeys.some((candidate) => {
    const candidateHints = localFeederEastHints(candidate);
    return candidateHints.some((hint) => eastHints.includes(hint));
  });
}

export function buildLocalFeederBiasReasons(params: {
  journey: PlannedJourney;
  ranked?: PlannedJourney[];
}) {
  const reasons: JourneyContextPenaltyReason[] = [];
  const candidates = params.ranked ?? [];
  const eastHints = nationalFeederEastHints(params.journey);

  if (!hasLocalFeederForEastHints(candidates, eastHints)) {
    return reasons;
  }

  reasons.push({
    id: 'raptor-national-feeder-when-local-available',
    label: 'Hay un alimentador local de Cartago para esta ruta regional.',
    penalty: 60,
  });

  return reasons;
}
