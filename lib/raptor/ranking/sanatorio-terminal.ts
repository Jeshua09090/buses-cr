import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { hasAlternativeMatching, journeyRouteText, normalizeRaptorText } from './_shared';
import { destinationInBox, PRUSIA_WEST_PIN_BOX, SANATORIO_DURAN_BOX } from './geo-boxes';

function finalAlightStopText(journey: PlannedJourney) {
  const finalLeg = journey.legs.at(-1);
  return normalizeRaptorText(finalLeg?.alightStopName ?? journey.dropStopName);
}

function isSanatorioCorridor(journey: PlannedJourney) {
  const routeText = journeyRouteText(journey);
  return routeText.includes('TIERRA BLANCA') && routeText.includes('SANATORIO');
}

function isVolcanIrazuBranch(journey: PlannedJourney) {
  const routeText = journeyRouteText(journey);
  return (
    routeText.includes('SAN JUAN DE CHICUA') ||
    routeText.includes('LA PASTORA') ||
    routeText.includes('VOLCAN IRAZU')
  );
}

function hasSanatorioAlternative(journey: PlannedJourney, ranked: PlannedJourney[]) {
  return hasAlternativeMatching(journey, ranked, isSanatorioCorridor);
}

export function buildSanatorioTerminalPreferenceReasons(params: {
  journey: PlannedJourney;
  destination: [number, number] | null;
  ranked?: PlannedJourney[];
}) {
  const reasons: JourneyContextPenaltyReason[] = [];

  const inSanatorioBox = destinationInBox(params.destination, SANATORIO_DURAN_BOX);
  const inPrusiaWestPinBox = destinationInBox(params.destination, PRUSIA_WEST_PIN_BOX);
  if (!inSanatorioBox && !inPrusiaWestPinBox) {
    return reasons;
  }

  const finalStopText = finalAlightStopText(params.journey);
  if (inSanatorioBox && finalStopText.includes('CRUCE SANATORIO') && !finalStopText.includes('TERMINAL')) {
    reasons.push({
      id: 'raptor-sanatorio-cruce-instead-of-terminal',
      label: 'Baja en Cruce Sanatorio en vez del terminal del Sanatorio.',
      penalty: 22,
    });
  }

  if (isSanatorioCorridor(params.journey)) {
    reasons.push({
      id: 'raptor-sanatorio-terminal-corridor-bonus',
      label: 'Llega al terminal del Sanatorio.',
      penalty: -8,
    });
  }

  if (
    inPrusiaWestPinBox &&
    isVolcanIrazuBranch(params.journey) &&
    hasSanatorioAlternative(params.journey, params.ranked ?? [])
  ) {
    reasons.push({
      id: 'raptor-prusia-west-volcan-branch-penalty',
      label: 'Para el pin oeste de Prusia la caminata real favorece Sanatorio.',
      penalty: 60,
    });
  }

  return reasons;
}
