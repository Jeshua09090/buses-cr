import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import {
  finalWalkMeters,
  hasAlternativeMatching,
  includesAny,
  journeyRouteText,
  legRouteText,
  normalizeRaptorText,
} from './_shared';
import {
  destinationInBox,
  LLANOS_SANTA_LUCIA_BOX,
  PALI_TARAS_BOX,
  PARAISO_CENTRO_BOX,
} from './geo-boxes';

const TARAS_FEEDER_HINTS = ['CARTAGO - TARAS - SAN NICOLAS'] as const;
const EAST_TERMINAL_BRANCH_HINTS = [
  'CARTAGO - PARAISO',
  'CARTAGO - CACHI',
  'CARTAGO - PENAS BLANCAS',
  'BAJO CERVANTES',
  'BIRRISITO',
  'LLANOS DE SANTA LUCIA',
] as const;
const PARAISO_TERMINAL_BRANCH_HINTS = [
  'CARTAGO - PARAISO',
  'PARAISO',
  'BIRRISITO',
  'BAJO CERVANTES',
  'SANTIAGO',
  'SAN FRANCISCO',
] as const;
const LLANOS_TERMINAL_BRANCH_HINTS = [
  'LLANOS DE SANTA LUCIA',
  'CARTAGO - PARAISO',
  'PARAISO',
  'BIRRISITO',
  'BAJO CERVANTES',
  'SANTIAGO',
  'SAN FRANCISCO',
] as const;

const MAX_TERMINAL_ORIGIN_WALK_METERS = 180;
const MAX_TERMINAL_TRANSFER_WALK_METERS = 700;
const MAX_TERMINAL_FINAL_WALK_DELTA_METERS = 160;
const MAX_TERMINAL_TOTAL_WALK_DELTA_METERS = 550;
const MAX_TERMINAL_SCORE_DELTA = 18;

const CEMENTERIO_TRANSFER_SECONDARY: JourneyContextPenaltyReason = {
  id: 'raptor-taras-east-cementerio-transfer-secondary',
  label: 'Desde Taras hacia Paraiso/Llanos hay transbordo terminal por Plaza Iglesias/Capuchinos.',
  penalty: 8,
};

function destinationIsEastTerminalCorridor(destination: [number, number] | null) {
  return (
    destinationInBox(destination, PARAISO_CENTRO_BOX) ||
    destinationInBox(destination, LLANOS_SANTA_LUCIA_BOX)
  );
}

function terminalBranchHintsForDestination(destination: [number, number] | null) {
  if (destinationInBox(destination, LLANOS_SANTA_LUCIA_BOX)) {
    return LLANOS_TERMINAL_BRANCH_HINTS;
  }
  if (destinationInBox(destination, PARAISO_CENTRO_BOX)) {
    return PARAISO_TERMINAL_BRANCH_HINTS;
  }

  return EAST_TERMINAL_BRANCH_HINTS;
}

function firstLegIsTarasFeeder(journey: PlannedJourney) {
  return includesAny(legRouteText(journey, 0), TARAS_FEEDER_HINTS);
}

function hasCementerioTransfer(journey: PlannedJourney) {
  const legText = journey.legs
    .flatMap((leg) => [leg.boardStopName, leg.alightStopName])
    .map((value) => normalizeRaptorText(value))
    .join(' ');

  return legText.includes('CEMENTERIO');
}

function usesPlazaIglesiasTerminalTransfer(
  journey: PlannedJourney,
  branchHints: readonly string[],
) {
  if (!firstLegIsTarasFeeder(journey)) return false;
  if (!normalizeRaptorText(journey.legs[0]?.alightStopName).includes('PLAZA IGLESIAS')) {
    return false;
  }
  if (!includesAny(journeyRouteText(journey), branchHints)) return false;
  if (journey.originWalkMeters > MAX_TERMINAL_ORIGIN_WALK_METERS) return false;
  if (journey.transferWalkMeters > MAX_TERMINAL_TRANSFER_WALK_METERS) return false;

  return true;
}

function hasViableTerminalAlternative(params: {
  journey: PlannedJourney;
  branchHints: readonly string[];
  ranked: PlannedJourney[];
}) {
  return hasAlternativeMatching(params.journey, params.ranked, (candidate) => {
    if (!usesPlazaIglesiasTerminalTransfer(candidate, params.branchHints)) return false;
    if (candidate.score > params.journey.score + MAX_TERMINAL_SCORE_DELTA) return false;
    if (finalWalkMeters(candidate) > finalWalkMeters(params.journey) + MAX_TERMINAL_FINAL_WALK_DELTA_METERS) {
      return false;
    }
    if (candidate.totalWalkMeters > params.journey.totalWalkMeters + MAX_TERMINAL_TOTAL_WALK_DELTA_METERS) {
      return false;
    }

    return true;
  });
}

export function buildTarasEastTerminalTransferReasons(params: {
  journey: PlannedJourney;
  origin: [number, number] | null;
  destination: [number, number] | null;
  ranked?: PlannedJourney[];
}): JourneyContextPenaltyReason[] {
  if (!destinationInBox(params.origin, PALI_TARAS_BOX)) return [];
  if (!destinationIsEastTerminalCorridor(params.destination)) return [];
  if (!firstLegIsTarasFeeder(params.journey)) return [];
  if (!hasCementerioTransfer(params.journey)) return [];
  if (
    !hasViableTerminalAlternative({
      journey: params.journey,
      branchHints: terminalBranchHintsForDestination(params.destination),
      ranked: params.ranked ?? [],
    })
  ) {
    return [];
  }

  return [CEMENTERIO_TRANSFER_SECONDARY];
}
