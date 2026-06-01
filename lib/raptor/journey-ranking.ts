import type { JourneyContextPenaltyReason, PlannedJourney } from '@/lib/journey-planner';

import { haversineMeters } from './geo';
import {
  buildDestinationAwareHintReasons,
  buildMediumInterurbanHintReasons,
} from './ranking/destination-aware-hints';
import { buildDestinationCorridorPreferenceReasons } from './ranking/destination-corridor-preference';
import { buildDirectAlternativeReasons } from './ranking/direct-alternative';
import { buildEastBranchDestinationPreferenceReasons } from './ranking/east-branch-destination';
import { buildEastBranchOriginPreferenceReasons } from './ranking/east-branch-origin';
import { buildElHumoCorridorReasons } from './ranking/el-humo-corridor';
import { buildFarDropAlternativeReasons } from './ranking/far-drop-alternative';
import { buildLaCampinaCorridorReasons } from './ranking/la-campina-corridor';
import { buildLankesterCorridorReasons } from './ranking/lankester-corridor';
import { buildLocalFeederBiasReasons } from './ranking/local-feeder-bias';
import { buildRioLoroCorridorReasons } from './ranking/rio-loro-corridor';
import { buildSanatorioTerminalPreferenceReasons } from './ranking/sanatorio-terminal';
import { buildSjFeederCartagoLocalReasons } from './ranking/sj-feeder-cartago-local';
import { buildTarasEastTerminalTransferReasons } from './ranking/taras-east-terminal-transfer';
import { buildTarasPaseoFeederReasons } from './ranking/taras-paseo-feeder';
import { buildTarasTejarFeederReasons } from './ranking/taras-tejar-feeder';
import { buildWalkDominantAlternativeReasons } from './ranking/walk-dominant-alternative';
import { buildWalkVsWaitReasons } from './ranking/walk-vs-wait';

export type RaptorRankingInput = {
  journeys: PlannedJourney[];
  origin: [number, number] | null;
  destination: [number, number] | null;
  destinationName?: string | null;
  etaWaitMinutesByJourneyId?: Map<string, number>;
};

export type RaptorJourneyDebug = {
  baseScore: number;
  legacyContextPenalty: number;
  raptorPolishPenalty: number;
  totalContextPenalty: number;
  etaPenalty: number;
  displayScore: number;
  reasons: JourneyContextPenaltyReason[];
  raptorPolishReasons: JourneyContextPenaltyReason[];
};

export type RaptorJourneyRanking = {
  ranked: PlannedJourney[];
  debugById: Map<string, RaptorJourneyDebug>;
  preferredJourneyId: string | null;
};

function straightLineDistanceMeters(params: {
  origin: [number, number] | null;
  destination: [number, number] | null;
}) {
  if (!params.origin || !params.destination) return null;

  return haversineMeters(
    { lat: params.origin[1], lng: params.origin[0] },
    { lat: params.destination[1], lng: params.destination[0] },
  );
}

function isLocalOrShortRegionalTrip(params: {
  origin: [number, number] | null;
  destination: [number, number] | null;
}) {
  const distanceMeters = straightLineDistanceMeters(params);
  return distanceMeters !== null && distanceMeters <= 10_000;
}

function computeLegacyContextPenalty(params: {
  journey: PlannedJourney;
  origin: [number, number] | null;
  destination: [number, number] | null;
  destinationName?: string | null;
}): {
  totalPenalty: number;
  reasons: JourneyContextPenaltyReason[];
} {
  const mediumReasons = buildMediumInterurbanHintReasons({
    journey: params.journey,
    destinationName: params.destinationName,
    isLocalOrShortRegionalTrip: isLocalOrShortRegionalTrip(params),
  });

  return {
    totalPenalty: mediumReasons.reduce((total, reason) => total + reason.penalty, 0),
    reasons: mediumReasons,
  };
}

export function computeRaptorContextPenalty(input: {
  journey: PlannedJourney;
  origin: [number, number] | null;
  destination: [number, number] | null;
  destinationName?: string | null;
  ranked?: PlannedJourney[];
}): {
  totalPenalty: number;
  reasons: JourneyContextPenaltyReason[];
} {
  if (!input.journey.legs.length || !input.origin || !input.destination) {
    return { totalPenalty: 0, reasons: [] };
  }

  const legacyReasons = buildMediumInterurbanHintReasons({
    journey: input.journey,
    destinationName: input.destinationName,
    isLocalOrShortRegionalTrip: isLocalOrShortRegionalTrip(input),
  });
  const reasons = buildDestinationAwareHintReasons({
    journey: input.journey,
    destination: input.destination,
    legacyReasons,
  }).concat(
    buildSanatorioTerminalPreferenceReasons({
      journey: input.journey,
      destination: input.destination,
      ranked: input.ranked,
    }),
    buildLaCampinaCorridorReasons({
      journey: input.journey,
      destination: input.destination,
    }),
    buildLankesterCorridorReasons({
      journey: input.journey,
      destination: input.destination,
    }),
    buildRioLoroCorridorReasons({
      journey: input.journey,
      destination: input.destination,
      ranked: input.ranked,
    }),
    buildDestinationCorridorPreferenceReasons({
      journey: input.journey,
      destination: input.destination,
      ranked: input.ranked,
    }),
    buildTarasEastTerminalTransferReasons({
      journey: input.journey,
      origin: input.origin,
      destination: input.destination,
      ranked: input.ranked,
    }),
    buildTarasTejarFeederReasons({
      journey: input.journey,
      origin: input.origin,
      destination: input.destination,
      ranked: input.ranked,
    }),
    buildTarasPaseoFeederReasons({
      journey: input.journey,
      origin: input.origin,
      destination: input.destination,
      ranked: input.ranked,
    }),
    buildElHumoCorridorReasons({
      journey: input.journey,
      destination: input.destination,
    }),
    buildDirectAlternativeReasons({
      journey: input.journey,
      ranked: input.ranked,
    }),
    buildFarDropAlternativeReasons({
      journey: input.journey,
      ranked: input.ranked,
    }),
    buildWalkDominantAlternativeReasons({
      journey: input.journey,
      ranked: input.ranked,
    }),
    buildWalkVsWaitReasons({
      journey: input.journey,
      origin: input.origin,
      destination: input.destination,
    }),
    buildEastBranchDestinationPreferenceReasons({
      journey: input.journey,
      destination: input.destination,
      ranked: input.ranked,
    }),
    buildEastBranchOriginPreferenceReasons({
      journey: input.journey,
      origin: input.origin,
      ranked: input.ranked,
    }),
    buildLocalFeederBiasReasons({
      journey: input.journey,
      ranked: input.ranked,
    }),
    buildSjFeederCartagoLocalReasons({
      journey: input.journey,
      destination: input.destination,
      ranked: input.ranked,
    }),
  );

  return {
    totalPenalty: reasons.reduce((total, reason) => total + reason.penalty, 0),
    reasons,
  };
}

function dedupeReasons(reasons: JourneyContextPenaltyReason[]) {
  const output: JourneyContextPenaltyReason[] = [];
  const seen = new Set<string>();

  for (const reason of reasons) {
    if (seen.has(reason.id)) continue;
    seen.add(reason.id);
    output.push(reason);
  }

  return output;
}

function mergeVisibleReasons(params: {
  legacyReasons: JourneyContextPenaltyReason[];
  raptorPolishReasons: JourneyContextPenaltyReason[];
}) {
  const reasons = dedupeReasons([...params.legacyReasons, ...params.raptorPolishReasons]);
  const cancelledIds = new Set<string>();

  for (const reason of reasons) {
    if (!reason.id.startsWith('raptor-cancel-')) continue;
    const cancelledId = reason.id.replace(/^raptor-cancel-/, '');
    const cancelledReason = reasons.find((candidate) => candidate.id === cancelledId);
    if (cancelledReason && cancelledReason.penalty + reason.penalty === 0) {
      cancelledIds.add(reason.id);
      cancelledIds.add(cancelledId);
    }
  }

  return reasons.filter((reason) => !cancelledIds.has(reason.id));
}

export function rankRaptorJourneys(input: RaptorRankingInput): RaptorJourneyRanking {
  const debugById = new Map<string, RaptorJourneyDebug>();

  const rankedWithScores = input.journeys.map((journey) => {
    const etaPenalty = input.etaWaitMinutesByJourneyId?.get(journey.id) ?? 0;
    const legacyBreakdown = computeLegacyContextPenalty({
      journey,
      origin: input.origin,
      destination: input.destination,
      destinationName: input.destinationName,
    });
    const raptorPolishBreakdown = computeRaptorContextPenalty({
      journey,
      origin: input.origin,
      destination: input.destination,
      destinationName: input.destinationName,
      ranked: input.journeys,
    });
    const totalContextPenalty =
      legacyBreakdown.totalPenalty + raptorPolishBreakdown.totalPenalty;
    const displayScore = journey.score + etaPenalty * 1.4 + totalContextPenalty;
    const debug: RaptorJourneyDebug = {
      baseScore: journey.score,
      legacyContextPenalty: legacyBreakdown.totalPenalty,
      raptorPolishPenalty: raptorPolishBreakdown.totalPenalty,
      totalContextPenalty,
      etaPenalty,
      displayScore,
      reasons: mergeVisibleReasons({
        legacyReasons: legacyBreakdown.reasons,
        raptorPolishReasons: raptorPolishBreakdown.reasons,
      }),
      raptorPolishReasons: raptorPolishBreakdown.reasons,
    };

    debugById.set(journey.id, debug);
    return { debug, journey };
  });

  const ranked = rankedWithScores
    .sort((a, b) => {
      return (
        a.debug.displayScore - b.debug.displayScore ||
        a.journey.totalWalkMeters - b.journey.totalWalkMeters ||
        a.journey.legs.length - b.journey.legs.length
      );
    })
    .map(({ journey }) => journey);

  return {
    ranked,
    debugById,
    preferredJourneyId: ranked[0]?.id ?? null,
  };
}
