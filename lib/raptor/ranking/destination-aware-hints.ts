import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { journeyRouteText, normalizeRaptorText } from './_shared';
import {
  destinationInBox,
  OROSI_CENTRO_BOX,
  PARAISO_CENTRO_BOX,
  SANATORIO_DURAN_BOX,
  TAPANTI_BOX,
} from './geo-boxes';

const MEDIUM_DESTINATION_HINT_IDS = [
  'OROSI',
  'RIO MACHO',
  'PARAISO',
  'SANATORIO',
  'TIERRA BLANCA',
] as const;

function legacyHintFromReason(reason: JourneyContextPenaltyReason) {
  const match = reason.id.match(/^medium-interurban-(.+)$/);
  return match?.[1] ?? null;
}

function destinationAcceptsHint(params: {
  destination: [number, number] | null;
  hint: string;
}) {
  const { destination, hint } = params;
  if (
    (hint === 'OROSI' || hint === 'RIO MACHO') &&
    (destinationInBox(destination, OROSI_CENTRO_BOX) || destinationInBox(destination, TAPANTI_BOX))
  ) {
    return true;
  }

  if (hint === 'PARAISO' && destinationInBox(destination, PARAISO_CENTRO_BOX)) {
    return true;
  }

  if (
    (hint === 'SANATORIO' || hint === 'TIERRA BLANCA') &&
    destinationInBox(destination, SANATORIO_DURAN_BOX)
  ) {
    return true;
  }

  return false;
}

export function buildDestinationAwareHintReasons(params: {
  journey: PlannedJourney;
  destination: [number, number] | null;
  legacyReasons: JourneyContextPenaltyReason[];
}) {
  const reasons: JourneyContextPenaltyReason[] = [];

  for (const legacyReason of params.legacyReasons) {
    const hint = legacyHintFromReason(legacyReason);
    if (!hint || !destinationAcceptsHint({ destination: params.destination, hint })) {
      continue;
    }

    reasons.push({
      id: `raptor-cancel-${legacyReason.id}`,
      label: `El destino esta en ${hint}, el desvio es esperado.`,
      penalty: -legacyReason.penalty,
    });
  }

  if (
    destinationInBox(params.destination, PARAISO_CENTRO_BOX) &&
    journeyRouteText(params.journey).includes('CARTAGO - PARAISO')
  ) {
    reasons.push({
      id: 'raptor-paraiso-trunk-name-match',
      label: 'La ruta termina en el destino solicitado.',
      penalty: -3,
    });
  }

  return reasons;
}

export function buildMediumInterurbanHintReasons(params: {
  journey: PlannedJourney;
  destinationName?: string | null;
  isLocalOrShortRegionalTrip: boolean;
}) {
  const routeText = journeyRouteText(params.journey);
  const normalizedDestination = normalizeRaptorText(params.destinationName);
  const reasons: JourneyContextPenaltyReason[] = [];

  for (const hint of MEDIUM_DESTINATION_HINT_IDS) {
    if (!routeText.includes(hint) || normalizedDestination.includes(hint)) continue;

    reasons.push({
      id: `medium-interurban-${hint}`,
      label: `La ruta se desvia hacia ${hint} sin que el destino lo pida.`,
      penalty: params.isLocalOrShortRegionalTrip ? 3 : 1.5,
    });
  }

  return reasons;
}
