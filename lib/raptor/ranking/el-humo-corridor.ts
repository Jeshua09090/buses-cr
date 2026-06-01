import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { includesAny, journeyRouteText } from './_shared';
import { destinationInBox, EL_HUMO_BOX } from './geo-boxes';

const EL_HUMO_EXPECTED_HINTS = ['EL HUMO', 'TUCURRIQUE'] as const;
const FORBIDDEN_FEEDER_HINTS = ['PARAISO', 'BIRRISITO'] as const;

const DIRECT_CORRIDOR_BONUS: JourneyContextPenaltyReason = {
  id: 'raptor-el-humo-direct-corridor-bonus',
  label: 'Usa el corredor directo Cartago-Tucurrique-El Humo.',
  penalty: -8,
};

const FORBIDDEN_FEEDER_PENALTY: JourneyContextPenaltyReason = {
  id: 'raptor-el-humo-forbidden-feeder-penalty',
  label: 'Usa Paraiso/Birrisito como alimentador aunque existe corredor directo a El Humo.',
  penalty: 35,
};

export function buildElHumoCorridorReasons(params: {
  journey: PlannedJourney;
  destination: [number, number] | null;
}): JourneyContextPenaltyReason[] {
  if (!destinationInBox(params.destination, EL_HUMO_BOX)) return [];

  const text = journeyRouteText(params.journey);
  if (!includesAny(text, EL_HUMO_EXPECTED_HINTS)) return [];

  if (includesAny(text, FORBIDDEN_FEEDER_HINTS)) {
    return [FORBIDDEN_FEEDER_PENALTY];
  }

  return [DIRECT_CORRIDOR_BONUS];
}
