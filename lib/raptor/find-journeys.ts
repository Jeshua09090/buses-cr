import { findNearestStops } from './nearest-stops';
import { buildJourneyQuery, buildJourneyRangeQuery } from './query-builder';
import { haversineMeters } from './geo';
import {
  destinationInBox,
  EL_CARMEN_QUIRCOT_BOX,
  GUADALUPE_BOX,
  LLANOS_SANTA_LUCIA_BOX,
  PALI_TARAS_BOX,
  PARAISO_CENTRO_BOX,
  PEDREGAL_BOX,
  QUIRCOT_BOX,
  TAPANTI_BOX,
} from './ranking/geo-boxes';
import {
  mapRaptorRouteToJourney,
  mapRaptorResultToJourney,
  plannedJourneySignature,
} from './result-mapper';
import { getRouteNamesByStopId, getRouter, getSnapshot, getTimetable } from './snapshot-cache';
import { diaTipoForDate, minutesSinceMidnightCostaRica } from './dia-tipo';
import type { PlannedJourney } from '@/lib/journey-planner';
import type { FindJourneysInput, FindJourneysResult, NearbyStopCandidate, RouteNamesByStopId } from './types';
import type { Stop } from 'minotor';

const DEFAULT_ORIGIN_WALK_RADIUS_METERS = 1200;
const DEFAULT_DESTINATION_WALK_RADIUS_METERS = 2500;
const RURAL_TOURIST_DESTINATION_WALK_RADIUS_METERS = 4500;
const DEFAULT_STOP_CANDIDATES = 24;
const DEFAULT_MAX_TRANSFERS = 1;
const DEFAULT_MAX_INITIAL_WAIT_MINUTES = 90;
const MAX_COMBINED_ACCESS_WALK_METERS = 4000;
// Wave 2 polish: keep enough raw RAPTOR options for the ranking layer and diversity selector
// to surface local alternatives that the base RAPTOR score can otherwise bury behind interurban feeders.
const MAX_RETURNED_JOURNEYS = 24;
const MAX_JOURNEYS_PER_ROUTE_SEQUENCE = 3;
const NEAR_DESTINATION_RESERVE_MAX_WALK_METERS = 250;
const NEAR_DESTINATION_RESERVE_ROUTE_SEQUENCE_LIMIT = 6;
const FAR_DROP_REPLACEMENT_MIN_WALK_METERS = 800;
const DEFAULT_ROUTED_CANDIDATE_PAIR_BUDGET = 64;
const LLANOS_ROUTED_CANDIDATE_PAIR_BUDGET = 32;
const PARAISO_ROUTED_CANDIDATE_PAIR_BUDGET = 32;
const SHORT_URBAN_ROUTED_CANDIDATE_PAIR_BUDGET = 240;
const SHORT_URBAN_TRIP_DISTANCE_METERS = 1000;
const RURAL_TOURIST_ROUTED_CANDIDATE_PAIR_BUDGET = 160;
const NEAR_ROUTED_CANDIDATE_PAIR_FLOOR = 32;
const CANDIDATE_COVERAGE_ROUNDS = 2;
const SHORT_URBAN_RANGE_CANDIDATE_PAIR_LIMIT = 6;
const SHORT_URBAN_RANGE_WINDOW_MINUTES = 30;
const SHORT_URBAN_RANGE_ROUTES_PER_PAIR_LIMIT = 4;
const SHORT_URBAN_RANGE_MAX_ORIGIN_WALK_METERS = 350;
const SHORT_URBAN_RANGE_MAX_DESTINATION_WALK_METERS = 250;
const SHORT_URBAN_RANGE_MAX_COMBINED_WALK_METERS = 700;
const LLANOS_RANGE_CANDIDATE_PAIR_LIMIT = 4;
const LLANOS_RANGE_WINDOW_MINUTES = 90;
const LLANOS_RANGE_ROUTES_PER_PAIR_LIMIT = 12;
const LLANOS_RANGE_MAX_ORIGIN_WALK_METERS = 450;
const LLANOS_RANGE_MAX_DESTINATION_WALK_METERS = 450;
const LLANOS_RANGE_MAX_COMBINED_WALK_METERS = 900;
const NORTH_LOCAL_LOOP_ROUTED_CANDIDATE_PAIR_BUDGET = 40;
const EL_CARMEN_LOCAL_LOOP_ROUTED_CANDIDATE_PAIR_BUDGET = 68;
const GUADALUPE_DESTINATION_ROUTED_CANDIDATE_PAIR_BUDGET = 80;
const NORTH_LOCAL_LOOP_RANGE_CANDIDATE_PAIR_LIMIT = 4;
const EL_CARMEN_LOCAL_LOOP_RANGE_CANDIDATE_PAIR_LIMIT = 5;
const NORTH_LOCAL_LOOP_RANGE_WINDOW_MINUTES = 120;
const NORTH_LOCAL_LOOP_RANGE_ROUTES_PER_PAIR_LIMIT = 24;
const NORTH_LOCAL_LOOP_RANGE_MAX_ORIGIN_WALK_METERS = 900;
const NORTH_LOCAL_LOOP_RANGE_MAX_DESTINATION_WALK_METERS = 350;
const NORTH_LOCAL_LOOP_RANGE_MAX_COMBINED_WALK_METERS = 1200;
const EAST_TERMINAL_BRANCH_DESTINATION_CANDIDATE_LIMIT = 2;
const EAST_TERMINAL_BRANCH_FALLBACK_CANDIDATE_LIMIT = 4;
const TARAS_FEEDER_ROUTE_HINT = 'CARTAGO - TARAS - SAN NICOLAS';
const PLAZA_IGLESIAS_STOP_HINT = 'PLAZA IGLESIAS';
const CARTAGO_PARAISO_ROUTE_HINT = 'CARTAGO - PARAISO';
const CARTAGO_LLANOS_ROUTE_HINT = 'CARTAGO - LLANOS DE SANTA LUCIA';
const EAST_TERMINAL_STOP_SOURCE_IDS = new Set(['99', '138', '-200012602']);

type PerfTimings = NonNullable<NonNullable<FindJourneysResult['diagnostics']>['perfTimingsMs']>;

type PerfStats = {
  startedAt: number;
  timings: PerfTimings;
  routeCallDurations: number[];
  directRouteCallDurations: number[];
};

type RoutingCandidatePair = {
  fromCandidate: NearbyStopCandidate;
  toCandidate: NearbyStopCandidate;
  combinedAccessWalkMeters: number;
  sharedRouteNames: readonly string[];
};

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function shouldCollectPerfDiagnostics(input: FindJourneysInput) {
  return input.perfDiagnostics === true || process.env.EXPO_PUBLIC_RAPTOR_PERF_DIAGNOSTICS === '1';
}

function createPerfStats(input: FindJourneysInput): PerfStats | null {
  if (!shouldCollectPerfDiagnostics(input)) return null;

  return {
    startedAt: nowMs(),
    timings: {},
    routeCallDurations: [],
    directRouteCallDurations: [],
  };
}

function addPerfTiming(perf: PerfStats | null, key: keyof PerfTimings, elapsedMs: number) {
  if (!perf) return;
  perf.timings[key] = (perf.timings[key] ?? 0) + elapsedMs;
}

function elapsedSince(startedAt: number) {
  return nowMs() - startedAt;
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
}

function summarizeDurations(values: number[]) {
  if (values.length === 0) return undefined;

  const sortedValues = [...values].sort((a, b) => a - b);
  return {
    count: sortedValues.length,
    p50: percentile(sortedValues, 50),
    p95: percentile(sortedValues, 95),
    max: sortedValues[sortedValues.length - 1] ?? 0,
    total: values.reduce((sum, value) => sum + value, 0),
  };
}

function finishPerfTimings(perf: PerfStats | null) {
  if (!perf) return undefined;
  perf.timings.total = elapsedSince(perf.startedAt);
  return perf.timings;
}

function routeCallDurationStats(perf: PerfStats | null) {
  if (!perf) return undefined;
  return summarizeDurations(perf.routeCallDurations);
}

function directRouteCallDurationStats(perf: PerfStats | null) {
  if (!perf) return undefined;
  return summarizeDurations(perf.directRouteCallDurations);
}

function finishPerfDiagnostics(perf: PerfStats | null) {
  if (!perf) return {};

  const routeStats = routeCallDurationStats(perf);
  const directRouteStats = directRouteCallDurationStats(perf);

  return {
    perfTimingsMs: finishPerfTimings(perf),
    ...(routeStats ? { routeCallDurationStatsMs: routeStats } : {}),
    ...(directRouteStats ? { directRouteCallDurationStatsMs: directRouteStats } : {}),
  };
}

function sortJourneys(a: PlannedJourney, b: PlannedJourney) {
  return a.score - b.score || a.totalWalkMeters - b.totalWalkMeters || a.routeIds.length - b.routeIds.length;
}

function dedupeJourneys(journeys: PlannedJourney[]) {
  const seen = new Set<string>();
  const output: PlannedJourney[] = [];

  for (const journey of journeys.sort(sortJourneys)) {
    const signature = plannedJourneySignature(journey);
    if (seen.has(signature)) continue;
    seen.add(signature);
    output.push(journey);
  }

  return output;
}

function normalizeRouteSequencePart(value?: string | number | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function routeTextIncludes(value: string | null | undefined, hint: string) {
  return normalizeRouteSequencePart(value).includes(hint);
}

function routeTextEquals(value: string | null | undefined, hint: string) {
  return normalizeRouteSequencePart(value) === hint;
}

function firstTarasPlazaTerminalJourney(journeys: PlannedJourney[]) {
  return [...journeys].sort(sortJourneys).find((journey) => {
    const firstLeg = journey.legs[0];
    if (!firstLeg) return false;
    if (!routeTextIncludes(firstLeg.routeName, TARAS_FEEDER_ROUTE_HINT)) return false;
    if (!routeTextIncludes(firstLeg.alightStopName, PLAZA_IGLESIAS_STOP_HINT)) return false;

    return true;
  });
}

function firstMatchingBranchLeg(journeys: PlannedJourney[], routeHints: readonly string[]) {
  for (const routeHint of routeHints) {
    const matches: Array<{ journey: PlannedJourney; leg: NonNullable<PlannedJourney['legs']>[number] }> = [];

    for (const journey of journeys) {
      const leg = journey.legs.find((candidate) => routeTextEquals(candidate.routeName, routeHint));

      if (leg) matches.push({ journey, leg });
    }

    matches.sort(
      (a, b) =>
        a.journey.destinationWalkMeters - b.journey.destinationWalkMeters ||
        a.journey.transferWalkMeters - b.journey.transferWalkMeters ||
        a.journey.score - b.journey.score,
    );
    const match = matches[0];
    if (match) return match;
  }

  return null;
}

function terminalSynthesisRouteHintsForDestination(destination: [number, number]) {
  if (destinationInBox(destination, LLANOS_SANTA_LUCIA_BOX)) {
    return [CARTAGO_LLANOS_ROUTE_HINT, CARTAGO_PARAISO_ROUTE_HINT] as const;
  }

  if (destinationInBox(destination, PARAISO_CENTRO_BOX)) {
    return [CARTAGO_PARAISO_ROUTE_HINT] as const;
  }

  return null;
}

function uniqueNumbers(values: Array<number | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is number => typeof value === 'number' && value > 0)));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function synthesizeTarasParaisoTerminalTransfer(
  journeys: PlannedJourney[],
  input: FindJourneysInput,
  branchCandidateJourneys: PlannedJourney[] = [],
) {
  if (!destinationInBox([input.origin.lng, input.origin.lat], PALI_TARAS_BOX)) return journeys;
  const routeHints = terminalSynthesisRouteHintsForDestination([input.destination.lng, input.destination.lat]);
  if (!routeHints) return journeys;

  const terminalJourney = firstTarasPlazaTerminalJourney(journeys);
  const paraisoMatch = firstMatchingBranchLeg([...branchCandidateJourneys, ...journeys], routeHints);
  const firstLeg = terminalJourney?.legs[0];
  if (!terminalJourney || !paraisoMatch || !firstLeg) return journeys;

  const secondLeg = paraisoMatch.leg;
  const legs = [{ ...firstLeg }, { ...secondLeg }];
  const routeIds = uniqueNumbers(legs.map((leg) => leg.routeId));
  const routeCodes = uniqueStrings(legs.map((leg) => leg.routeCode));
  const routeNames = uniqueStrings(legs.map((leg) => leg.routeName));
  const originWalkMeters = terminalJourney.originWalkMeters;
  const transferWalkMeters = terminalJourney.transferWalkMeters;
  const destinationWalkMeters = paraisoMatch.journey.destinationWalkMeters;
  const totalWalkMeters = originWalkMeters + transferWalkMeters + destinationWalkMeters;
  const baseGeoMetrics = paraisoMatch.journey.geoMetrics ?? terminalJourney.geoMetrics ?? null;

  const syntheticJourney: PlannedJourney = {
    id: `raptor-synth:taras-plaza-east:${terminalJourney.id}:${secondLeg.routeId}:${secondLeg.alightStopId ?? 'drop'}`,
    kind: 'transfer',
    routeId: routeIds[0] ?? firstLeg.routeId,
    routeName: routeNames.join(' luego '),
    routeCode: routeCodes.length > 0 ? routeCodes.join(' + ') : null,
    operatorLabel: 'RAPTOR local',
    routeIds,
    routeCodes,
    legs,
    originWalkMeters,
    destinationWalkMeters,
    transferWalkMeters,
    totalWalkMeters,
    totalFare: null,
    score: Math.min(terminalJourney.score, paraisoMatch.journey.score),
    boardStopName: firstLeg.boardStopName ?? terminalJourney.boardStopName,
    dropStopName: secondLeg.alightStopName ?? paraisoMatch.journey.dropStopName,
    transferLabel: `Transbordo en ${firstLeg.alightStopName ?? secondLeg.boardStopName ?? 'Plaza Iglesias'}`,
    geoMetrics: baseGeoMetrics
      ? {
          ...baseGeoMetrics,
          originWalkMeters,
          transferWalkMeters,
          finalWalkMeters: destinationWalkMeters,
          totalWalkMeters,
          finalStopDestinationDistanceMeters: destinationWalkMeters,
          finalWalkStraightMeters: destinationWalkMeters,
        }
      : null,
  };

  return [...journeys, syntheticJourney];
}

function paradaIdForStop(stop: Stop) {
  const parsed = Number(stop.sourceStopId);
  return Number.isFinite(parsed) ? parsed : null;
}

function stopToNearbyCandidate(stop: Stop, distanceMeters: number): NearbyStopCandidate {
  return {
    stopId: stop.id,
    sourceStopId: stop.sourceStopId ?? null,
    paradaId: paradaIdForStop(stop),
    name: stop.name,
    lat: typeof stop.lat === 'number' ? stop.lat : 0,
    lng: typeof stop.lon === 'number' ? stop.lon : 0,
    distanceMeters,
  };
}

function routeNamesForDirectoryEntry(entryRouteName: string | null, patternName: string | null, serviceRouteKey: string) {
  return [entryRouteName, patternName, serviceRouteKey].filter((value): value is string => Boolean(value));
}

function routeStartParadaIdsForDestinationRoutes(params: {
  destinationRouteNames: ReadonlySet<string>;
  metadata: Awaited<ReturnType<typeof getSnapshot>>['metadata'];
}) {
  const paradaIds = new Set<number>();

  for (const entry of Object.values(params.metadata.service_route_directory)) {
    const entryNames = routeNamesForDirectoryEntry(entry.route_name, entry.pattern_name, entry.service_route_key);
    if (!entryNames.some((name) => params.destinationRouteNames.has(name))) continue;

    for (const subArc of entry.sub_arcs) {
      const firstParadaId = subArc.parada_ids?.[0];
      if (typeof firstParadaId === 'number') {
        paradaIds.add(firstParadaId);
      }
    }
  }

  return paradaIds;
}

function routeStartCandidatesForDestinationRoutes(params: {
  destinationRouteNames: ReadonlySet<string>;
  origin: FindJourneysInput['origin'];
  originRadiusMeters: number;
  snapshot: Awaited<ReturnType<typeof getSnapshot>>;
}) {
  const routeStartParadaIds = routeStartParadaIdsForDestinationRoutes({
    destinationRouteNames: params.destinationRouteNames,
    metadata: params.snapshot.metadata,
  });
  const candidates: NearbyStopCandidate[] = [];

  if (routeStartParadaIds.size === 0) return candidates;

  for (const stop of params.snapshot.stopsIndex) {
    const paradaId = paradaIdForStop(stop);
    if (paradaId === null || !routeStartParadaIds.has(paradaId)) continue;
    if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') continue;

    const distanceMeters = haversineMeters(params.origin, { lat: stop.lat, lng: stop.lon });
    if (distanceMeters > params.originRadiusMeters) continue;

    candidates.push(stopToNearbyCandidate(stop, distanceMeters));
  }

  return candidates.sort(sortCandidatesByDistance);
}

function mergeCandidates(
  selectedCandidates: readonly NearbyStopCandidate[],
  extraCandidates: readonly NearbyStopCandidate[],
) {
  const seenStopIds = new Set(selectedCandidates.map((candidate) => candidate.stopId));
  const merged = [...selectedCandidates];

  for (const candidate of extraCandidates) {
    if (seenStopIds.has(candidate.stopId)) continue;
    seenStopIds.add(candidate.stopId);
    merged.push(candidate);
  }

  return merged.sort(sortCandidatesByDistance);
}

function eastTerminalCandidates(stopsIndex: Iterable<Stop>) {
  const candidates: NearbyStopCandidate[] = [];

  for (const stop of stopsIndex) {
    if (!EAST_TERMINAL_STOP_SOURCE_IDS.has(String(stop.sourceStopId))) continue;
    candidates.push(stopToNearbyCandidate(stop, 0));
  }

  return candidates.sort((a, b) => a.stopId - b.stopId);
}

function shouldSearchEastTerminalBranchCandidates(input: FindJourneysInput) {
  if (!destinationInBox([input.origin.lng, input.origin.lat], PALI_TARAS_BOX)) return false;
  return terminalSynthesisRouteHintsForDestination([input.destination.lng, input.destination.lat]) !== null;
}

function candidateMatchesAnyRouteHint(params: {
  candidate: NearbyStopCandidate;
  routeHints: readonly string[];
  routeNamesByStopId: RouteNamesByStopId;
}) {
  const routeNames = params.routeNamesByStopId.get(params.candidate.stopId);
  if (!routeNames?.size) return false;

  for (const routeName of routeNames) {
    if (params.routeHints.some((routeHint) => routeTextEquals(routeName, routeHint))) {
      return true;
    }
  }

  return false;
}

function selectEastTerminalBranchDestinationCandidates(params: {
  routeHints: readonly string[];
  routeNamesByStopId: RouteNamesByStopId;
  toCandidates: readonly NearbyStopCandidate[];
}) {
  const sortedCandidates = [...params.toCandidates].sort(sortCandidatesByDistance);
  const compatibleCandidates = sortedCandidates.filter((candidate) =>
    candidateMatchesAnyRouteHint({
      candidate,
      routeHints: params.routeHints,
      routeNamesByStopId: params.routeNamesByStopId,
    }),
  );

  if (compatibleCandidates.length > 0) {
    return compatibleCandidates.slice(0, EAST_TERMINAL_BRANCH_DESTINATION_CANDIDATE_LIMIT);
  }

  return sortedCandidates.slice(0, EAST_TERMINAL_BRANCH_FALLBACK_CANDIDATE_LIMIT);
}

function routeMatchesAnyHint(journey: PlannedJourney, routeHints: readonly string[]) {
  return journey.legs.some((leg) =>
    routeHints.some((routeHint) => routeTextEquals(leg.routeName, routeHint)),
  );
}

function routeSequenceKey(journey: PlannedJourney) {
  const legParts = journey.legs
    .map((leg) => normalizeRouteSequencePart(leg.routeName ?? leg.routeCode ?? leg.routeId))
    .filter(Boolean);

  if (legParts.length > 0) {
    return legParts.join('>');
  }

  const routeName = normalizeRouteSequencePart(journey.routeName ?? journey.routeCode ?? null);
  if (routeName) return routeName;

  return journey.routeIds.map((routeId) => normalizeRouteSequencePart(routeId)).join('>');
}

function finalWalkMetersForSelection(journey: PlannedJourney) {
  const geoFinalWalk = journey.geoMetrics?.finalWalkNetworkMeters ?? journey.geoMetrics?.finalWalkMeters;
  if (typeof geoFinalWalk === 'number' && Number.isFinite(geoFinalWalk)) {
    return geoFinalWalk;
  }

  return journey.destinationWalkMeters;
}

function findFarDropReplacementIndex(selected: PlannedJourney[]) {
  let replacementIndex = -1;

  for (const [index, journey] of selected.entries()) {
    if (finalWalkMetersForSelection(journey) < FAR_DROP_REPLACEMENT_MIN_WALK_METERS) continue;
    if (replacementIndex === -1) {
      replacementIndex = index;
      continue;
    }

    const current = selected[replacementIndex];
    const currentFinalWalk = finalWalkMetersForSelection(current);
    const journeyFinalWalk = finalWalkMetersForSelection(journey);
    if (
      journeyFinalWalk > currentFinalWalk ||
      (journeyFinalWalk === currentFinalWalk && journey.score > current.score)
    ) {
      replacementIndex = index;
    }
  }

  return replacementIndex;
}

function preserveNearDestinationRouteSequences(params: {
  dedupedJourneys: PlannedJourney[];
  limit: number;
  selected: PlannedJourney[];
  selectedSignatures: Set<string>;
}) {
  const selectedNearDestinationRouteKeys = new Set<string>();

  for (const journey of params.selected) {
    if (finalWalkMetersForSelection(journey) <= NEAR_DESTINATION_RESERVE_MAX_WALK_METERS) {
      selectedNearDestinationRouteKeys.add(routeSequenceKey(journey));
    }
  }

  let injected = 0;
  for (const journey of params.dedupedJourneys) {
    if (injected >= NEAR_DESTINATION_RESERVE_ROUTE_SEQUENCE_LIMIT) break;
    if (finalWalkMetersForSelection(journey) > NEAR_DESTINATION_RESERVE_MAX_WALK_METERS) continue;

    const routeKey = routeSequenceKey(journey);
    if (selectedNearDestinationRouteKeys.has(routeKey)) continue;

    selectedNearDestinationRouteKeys.add(routeKey);
    const signature = plannedJourneySignature(journey);
    if (params.selectedSignatures.has(signature)) continue;

    if (params.selected.length < params.limit) {
      params.selected.push(journey);
      params.selectedSignatures.add(signature);
      injected += 1;
      continue;
    }

    const replacementIndex = findFarDropReplacementIndex(params.selected);
    if (replacementIndex === -1) continue;

    params.selectedSignatures.delete(plannedJourneySignature(params.selected[replacementIndex]));
    params.selected[replacementIndex] = journey;
    params.selectedSignatures.add(signature);
    injected += 1;
  }
}

export function selectJourneyCandidatesForRanking(
  journeys: PlannedJourney[],
  options: { limit?: number; perRouteSequenceLimit?: number } = {},
) {
  const limit = options.limit ?? MAX_RETURNED_JOURNEYS;
  const perRouteSequenceLimit = options.perRouteSequenceLimit ?? MAX_JOURNEYS_PER_ROUTE_SEQUENCE;
  const dedupedJourneys = dedupeJourneys(journeys);
  const selected: PlannedJourney[] = [];
  const selectedSignatures = new Set<string>();
  const routeSequenceCounts = new Map<string, number>();

  for (const journey of dedupedJourneys) {
    if (selected.length >= limit) break;

    const routeKey = routeSequenceKey(journey);
    const currentCount = routeSequenceCounts.get(routeKey) ?? 0;
    if (currentCount >= perRouteSequenceLimit) continue;

    selected.push(journey);
    selectedSignatures.add(plannedJourneySignature(journey));
    routeSequenceCounts.set(routeKey, currentCount + 1);
  }

  for (const journey of dedupedJourneys) {
    if (selected.length >= limit) break;

    const signature = plannedJourneySignature(journey);
    if (selectedSignatures.has(signature)) continue;

    selected.push(journey);
    selectedSignatures.add(signature);
  }

  preserveNearDestinationRouteSequences({
    dedupedJourneys,
    limit,
    selected,
    selectedSignatures,
  });

  return selected;
}

function estimateAccessWalkMinutes(distanceMeters: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 0;
  return Math.max(1, Math.round(distanceMeters / 80));
}

function configuredRoutedPairBudget() {
  const value = Number(process.env.EXPO_PUBLIC_RAPTOR_ROUTED_PAIR_BUDGET);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function candidatePairKey(pair: RoutingCandidatePair) {
  return `${pair.fromCandidate.stopId}:${pair.toCandidate.stopId}`;
}

function sortCandidatePairs(a: RoutingCandidatePair, b: RoutingCandidatePair) {
  return (
    a.combinedAccessWalkMeters - b.combinedAccessWalkMeters ||
    a.fromCandidate.distanceMeters - b.fromCandidate.distanceMeters ||
    a.toCandidate.distanceMeters - b.toCandidate.distanceMeters ||
    a.fromCandidate.stopId - b.fromCandidate.stopId ||
    a.toCandidate.stopId - b.toCandidate.stopId
  );
}

function sortCandidatesByDistance(a: NearbyStopCandidate, b: NearbyStopCandidate) {
  return a.distanceMeters - b.distanceMeters || a.stopId - b.stopId;
}

function sharedRouteNamesForPair(params: {
  fromCandidate: NearbyStopCandidate;
  routeNamesByStopId?: RouteNamesByStopId;
  toCandidate: NearbyStopCandidate;
}) {
  const fromRouteNames = params.routeNamesByStopId?.get(params.fromCandidate.stopId);
  const toRouteNames = params.routeNamesByStopId?.get(params.toCandidate.stopId);
  if (!fromRouteNames?.size || !toRouteNames?.size) return [];

  const sharedRouteNames: string[] = [];
  for (const routeName of fromRouteNames) {
    if (toRouteNames.has(routeName)) {
      sharedRouteNames.push(routeName);
    }
  }

  return sharedRouteNames.sort();
}

function mapPairsByStopId(
  pairs: readonly RoutingCandidatePair[],
  key: 'fromCandidate' | 'toCandidate',
) {
  const pairsByStopId = new Map<number, RoutingCandidatePair[]>();

  for (const pair of pairs) {
    const stopId = pair[key].stopId;
    const existing = pairsByStopId.get(stopId);
    if (existing) {
      existing.push(pair);
    } else {
      pairsByStopId.set(stopId, [pair]);
    }
  }

  for (const stopPairs of pairsByStopId.values()) {
    stopPairs.sort(sortCandidatePairs);
  }

  return pairsByStopId;
}

export function selectCandidatePairsForRouting(params: {
  budget: number;
  fromCandidates: readonly NearbyStopCandidate[];
  maxCombinedAccessWalkMeters: number;
  routeNamesByStopId?: RouteNamesByStopId;
  toCandidates: readonly NearbyStopCandidate[];
}) {
  const eligiblePairs: RoutingCandidatePair[] = [];
  let candidatePairs = 0;
  let candidatePairsSkippedSameStop = 0;
  let candidatePairsSkippedAccessWalk = 0;

  for (const fromCandidate of params.fromCandidates) {
    for (const toCandidate of params.toCandidates) {
      candidatePairs += 1;
      if (fromCandidate.stopId === toCandidate.stopId) {
        candidatePairsSkippedSameStop += 1;
        continue;
      }

      const combinedAccessWalkMeters = fromCandidate.distanceMeters + toCandidate.distanceMeters;
      if (combinedAccessWalkMeters > params.maxCombinedAccessWalkMeters) {
        candidatePairsSkippedAccessWalk += 1;
        continue;
      }

      eligiblePairs.push({
        fromCandidate,
        toCandidate,
        combinedAccessWalkMeters,
        sharedRouteNames: sharedRouteNamesForPair({
          fromCandidate,
          routeNamesByStopId: params.routeNamesByStopId,
          toCandidate,
        }),
      });
    }
  }

  const sortedPairs = [...eligiblePairs].sort(sortCandidatePairs);
  const budget = Math.max(0, Math.floor(params.budget));
  if (sortedPairs.length <= budget) {
    return {
      candidatePairs,
      candidatePairsSkippedAccessWalk,
      candidatePairsSkippedSameStop,
      pairs: sortedPairs,
    };
  }

  const selectedPairs: RoutingCandidatePair[] = [];
  const selectedPairKeys = new Set<string>();
  const addPair = (pair: RoutingCandidatePair) => {
    if (selectedPairs.length >= budget) return;
    const key = candidatePairKey(pair);
    if (selectedPairKeys.has(key)) return;

    selectedPairKeys.add(key);
    selectedPairs.push(pair);
  };

  for (const pair of sortedPairs.slice(0, Math.min(NEAR_ROUTED_CANDIDATE_PAIR_FLOOR, budget))) {
    addPair(pair);
  }

  const representedSharedRouteNames = new Set<string>();
  const sharedPairs = sortedPairs.filter((pair) => pair.sharedRouteNames.length > 0);
  for (const pair of sortedPairs) {
    if (selectedPairs.length >= budget) break;
    if (pair.sharedRouteNames.length === 0) continue;

    const routeNameToRepresent = pair.sharedRouteNames.find((routeName) => !representedSharedRouteNames.has(routeName));
    if (!routeNameToRepresent) continue;

    addPair(pair);
    for (const routeName of pair.sharedRouteNames) {
      representedSharedRouteNames.add(routeName);
    }
  }

  const sharedPairsByFromStopId = mapPairsByStopId(sharedPairs, 'fromCandidate');
  const sharedPairsByToStopId = mapPairsByStopId(sharedPairs, 'toCandidate');
  const sortedFromCandidates = [...params.fromCandidates].sort(sortCandidatesByDistance);
  const sortedToCandidates = [...params.toCandidates].sort(sortCandidatesByDistance);

  for (const fromCandidate of sortedFromCandidates) {
    if (selectedPairs.length >= budget) break;
    const pair = sharedPairsByFromStopId.get(fromCandidate.stopId)?.[0];
    if (pair) addPair(pair);
  }

  for (const toCandidate of sortedToCandidates) {
    if (selectedPairs.length >= budget) break;
    const pair = sharedPairsByToStopId.get(toCandidate.stopId)?.[0];
    if (pair) addPair(pair);
  }

  const pairsByFromStopId = mapPairsByStopId(sortedPairs, 'fromCandidate');
  const pairsByToStopId = mapPairsByStopId(sortedPairs, 'toCandidate');

  for (let coverageIndex = 0; coverageIndex < CANDIDATE_COVERAGE_ROUNDS; coverageIndex += 1) {
    for (const fromCandidate of sortedFromCandidates) {
      if (selectedPairs.length >= budget) break;
      const pair = pairsByFromStopId.get(fromCandidate.stopId)?.[coverageIndex];
      if (pair) addPair(pair);
    }

    for (const toCandidate of sortedToCandidates) {
      if (selectedPairs.length >= budget) break;
      const pair = pairsByToStopId.get(toCandidate.stopId)?.[coverageIndex];
      if (pair) addPair(pair);
    }
  }

  for (const pair of sortedPairs) {
    if (selectedPairs.length >= budget) break;
    addPair(pair);
  }

  return {
    candidatePairs,
    candidatePairsSkippedAccessWalk,
    candidatePairsSkippedSameStop,
    pairs: selectedPairs.sort(sortCandidatePairs),
  };
}

function shouldSearchShortUrbanRangeAlternatives(input: FindJourneysInput) {
  return haversineMeters(input.origin, input.destination) <= SHORT_URBAN_TRIP_DISTANCE_METERS;
}

function selectRangeCandidatePairs(params: {
  maxCombinedWalkMeters: number;
  maxDestinationWalkMeters: number;
  maxOriginWalkMeters: number;
  pairs: readonly RoutingCandidatePair[];
  requireSharedRouteNames?: boolean;
  limit: number;
}) {
  return params.pairs
    .filter((pair) => {
      if (params.requireSharedRouteNames && pair.sharedRouteNames.length === 0) return false;
      if (pair.fromCandidate.distanceMeters > params.maxOriginWalkMeters) return false;
      if (pair.toCandidate.distanceMeters > params.maxDestinationWalkMeters) return false;
      if (pair.combinedAccessWalkMeters > params.maxCombinedWalkMeters) return false;

      return true;
    })
    .slice(0, params.limit);
}

function selectShortUrbanRangeCandidatePairs(pairs: readonly RoutingCandidatePair[]) {
  return selectRangeCandidatePairs({
    pairs,
    limit: SHORT_URBAN_RANGE_CANDIDATE_PAIR_LIMIT,
    maxOriginWalkMeters: SHORT_URBAN_RANGE_MAX_ORIGIN_WALK_METERS,
    maxDestinationWalkMeters: SHORT_URBAN_RANGE_MAX_DESTINATION_WALK_METERS,
    maxCombinedWalkMeters: SHORT_URBAN_RANGE_MAX_COMBINED_WALK_METERS,
    requireSharedRouteNames: true,
  });
}

function selectLlanosRangeCandidatePairs(pairs: readonly RoutingCandidatePair[]) {
  return selectRangeCandidatePairs({
    pairs,
    limit: LLANOS_RANGE_CANDIDATE_PAIR_LIMIT,
    maxOriginWalkMeters: LLANOS_RANGE_MAX_ORIGIN_WALK_METERS,
    maxDestinationWalkMeters: LLANOS_RANGE_MAX_DESTINATION_WALK_METERS,
    maxCombinedWalkMeters: LLANOS_RANGE_MAX_COMBINED_WALK_METERS,
  });
}

function shouldSearchLlanosRangeAlternatives(input: FindJourneysInput) {
  return destinationInBox([input.destination.lng, input.destination.lat], LLANOS_SANTA_LUCIA_BOX);
}

function shouldSearchParaisoRangeAlternatives(input: FindJourneysInput) {
  return destinationInBox([input.destination.lng, input.destination.lat], PARAISO_CENTRO_BOX);
}

function isNorthLocalLoopDestination(input: FindJourneysInput) {
  const destination: [number, number] = [input.destination.lng, input.destination.lat];
  return (
    destinationInBox(destination, QUIRCOT_BOX) ||
    destinationInBox(destination, PEDREGAL_BOX) ||
    destinationInBox(destination, EL_CARMEN_QUIRCOT_BOX)
  );
}

function isElCarmenLocalLoopDestination(input: FindJourneysInput) {
  return destinationInBox([input.destination.lng, input.destination.lat], EL_CARMEN_QUIRCOT_BOX);
}

function selectNorthLocalLoopRangeCandidatePairs(input: FindJourneysInput, pairs: readonly RoutingCandidatePair[]) {
  return selectRangeCandidatePairs({
    pairs,
    limit: isElCarmenLocalLoopDestination(input)
      ? EL_CARMEN_LOCAL_LOOP_RANGE_CANDIDATE_PAIR_LIMIT
      : NORTH_LOCAL_LOOP_RANGE_CANDIDATE_PAIR_LIMIT,
    maxOriginWalkMeters: NORTH_LOCAL_LOOP_RANGE_MAX_ORIGIN_WALK_METERS,
    maxDestinationWalkMeters: NORTH_LOCAL_LOOP_RANGE_MAX_DESTINATION_WALK_METERS,
    maxCombinedWalkMeters: NORTH_LOCAL_LOOP_RANGE_MAX_COMBINED_WALK_METERS,
    requireSharedRouteNames: true,
  });
}

function isRuralTouristDestination(input: FindJourneysInput) {
  return destinationInBox([input.destination.lng, input.destination.lat], TAPANTI_BOX);
}

function defaultRoutedPairBudgetForInput(input: FindJourneysInput) {
  if (isRuralTouristDestination(input)) {
    return RURAL_TOURIST_ROUTED_CANDIDATE_PAIR_BUDGET;
  }

  if (destinationInBox([input.destination.lng, input.destination.lat], LLANOS_SANTA_LUCIA_BOX)) {
    return LLANOS_ROUTED_CANDIDATE_PAIR_BUDGET;
  }

  if (destinationInBox([input.destination.lng, input.destination.lat], PARAISO_CENTRO_BOX)) {
    return PARAISO_ROUTED_CANDIDATE_PAIR_BUDGET;
  }

  if (isElCarmenLocalLoopDestination(input)) {
    return EL_CARMEN_LOCAL_LOOP_ROUTED_CANDIDATE_PAIR_BUDGET;
  }

  if (destinationInBox([input.destination.lng, input.destination.lat], GUADALUPE_BOX)) {
    return GUADALUPE_DESTINATION_ROUTED_CANDIDATE_PAIR_BUDGET;
  }

  if (isNorthLocalLoopDestination(input)) {
    return NORTH_LOCAL_LOOP_ROUTED_CANDIDATE_PAIR_BUDGET;
  }

  const directDistanceMeters = haversineMeters(input.origin, input.destination);
  if (directDistanceMeters <= SHORT_URBAN_TRIP_DISTANCE_METERS) {
    return SHORT_URBAN_ROUTED_CANDIDATE_PAIR_BUDGET;
  }

  return DEFAULT_ROUTED_CANDIDATE_PAIR_BUDGET;
}

export async function findJourneysWithRaptor(input: FindJourneysInput): Promise<FindJourneysResult> {
  const perf = createPerfStats(input);
  const snapshotStartedAt = perf ? nowMs() : 0;
  const snapshot = await getSnapshot();
  const departureDate = input.departureDate ?? new Date();
  const diaTipo = diaTipoForDate(departureDate);
  const departureMinutes = minutesSinceMidnightCostaRica(departureDate);
  const originRadiusMeters =
    input.originWalkRadiusMeters ?? input.walkRadiusMeters ?? DEFAULT_ORIGIN_WALK_RADIUS_METERS;
  const destinationRadiusMeters =
    input.destinationWalkRadiusMeters ?? input.walkRadiusMeters ?? DEFAULT_DESTINATION_WALK_RADIUS_METERS;
  const candidateLimit = input.maxStopCandidates ?? DEFAULT_STOP_CANDIDATES;
  const maxTransfers = input.maxTransfers ?? DEFAULT_MAX_TRANSFERS;
  const router = getRouter(snapshot, diaTipo);
  const timetable = getTimetable(snapshot, diaTipo);
  const routeNamesByStopId = getRouteNamesByStopId(snapshot);
  if (perf) addPerfTiming(perf, 'snapshotAccess', elapsedSince(snapshotStartedAt));

  const candidateSelectionStartedAt = perf ? nowMs() : 0;
  const shouldRespectExplicitDestinationRadius =
    input.destinationWalkRadiusMeters != null || input.walkRadiusMeters != null;
  let activeDestinationRadiusMeters = destinationRadiusMeters;
  let toCandidates = findNearestStops({
    stopsIndex: snapshot.stopsIndex,
    point: input.destination,
    radiusMeters: activeDestinationRadiusMeters,
    limit: candidateLimit,
    routeNamesByStopId,
  });

  if (
    toCandidates.length === 0 &&
    !shouldRespectExplicitDestinationRadius &&
    isRuralTouristDestination(input)
  ) {
    activeDestinationRadiusMeters = RURAL_TOURIST_DESTINATION_WALK_RADIUS_METERS;
    toCandidates = findNearestStops({
      stopsIndex: snapshot.stopsIndex,
      point: input.destination,
      radiusMeters: activeDestinationRadiusMeters,
      limit: candidateLimit,
      routeNamesByStopId,
    });
  }
  const destinationRouteNames = new Set<string>();
  for (const candidate of toCandidates) {
    for (const routeName of routeNamesByStopId.get(candidate.stopId) ?? []) {
      destinationRouteNames.add(routeName);
    }
  }
  let fromCandidates = findNearestStops({
    stopsIndex: snapshot.stopsIndex,
    point: input.origin,
    radiusMeters: originRadiusMeters,
    limit: candidateLimit,
    routeNamesByStopId,
    destinationRouteNames,
  });
  if (isNorthLocalLoopDestination(input)) {
    fromCandidates = mergeCandidates(
      fromCandidates,
      routeStartCandidatesForDestinationRoutes({
        destinationRouteNames,
        origin: input.origin,
        originRadiusMeters,
        snapshot,
      }),
    );
  }
  if (perf) addPerfTiming(perf, 'candidateSelection', elapsedSince(candidateSelectionStartedAt));

  if (fromCandidates.length === 0 || toCandidates.length === 0) {
    return {
      source: 'raptor',
      journeys: [],
      diagnostics: {
        diaTipo,
        candidatePairs: 0,
        routedCandidatePairs: 0,
        raptorJourneys: 0,
        snapshotVersion: snapshot.metadata.version,
        fromCandidateCount: fromCandidates.length,
        toCandidateCount: toCandidates.length,
        candidatePairsSkippedSameStop: 0,
        candidatePairsSkippedAccessWalk: 0,
        routeCalls: 0,
        directRouteCalls: 0,
        ...finishPerfDiagnostics(perf),
        fallbackReason: fromCandidates.length === 0 ? 'no_origin_candidates' : 'no_destination_candidates',
      },
    };
  }

  const journeys: PlannedJourney[] = [];
  let routeCalls = 0;
  let directRouteCalls = 0;
  let rangeRouteCalls = 0;
  const pairRoutingStartedAt = perf ? nowMs() : 0;
  const routedPairBudget =
    input.maxRoutedCandidatePairs ??
    configuredRoutedPairBudget() ??
    defaultRoutedPairBudgetForInput(input);
  const pairSelection = selectCandidatePairsForRouting({
    budget: routedPairBudget,
    fromCandidates,
    maxCombinedAccessWalkMeters: MAX_COMBINED_ACCESS_WALK_METERS,
    routeNamesByStopId,
    toCandidates,
  });

  for (const { fromCandidate, toCandidate } of pairSelection.pairs) {
    const queryDepartureMinutes =
      departureMinutes + estimateAccessWalkMinutes(fromCandidate.distanceMeters);
    const query = buildJourneyQuery({
      fromStopId: fromCandidate.stopId,
      toStopId: toCandidate.stopId,
      departureMinutes: queryDepartureMinutes,
      maxTransfers,
      maxInitialWaitingMinutes: input.maxInitialWaitingMinutes ?? DEFAULT_MAX_INITIAL_WAIT_MINUTES,
    });
    const routeStartedAt = perf ? nowMs() : 0;
    routeCalls += 1;
    const result = router.route(query);
    if (perf) {
      const routeElapsedMs = elapsedSince(routeStartedAt);
      addPerfTiming(perf, 'routeCalls', routeElapsedMs);
      perf.routeCallDurations.push(routeElapsedMs);
    }
    const mappingStartedAt = perf ? nowMs() : 0;
    const journey = mapRaptorResultToJourney({
      result,
      timetable,
      metadata: snapshot.metadata,
      context: {
        origin: input.origin,
        destination: input.destination,
        diaTipo,
        departureMinutes: queryDepartureMinutes,
        fromCandidate,
        toCandidate,
        maxTransfers,
      },
    });
    if (perf) addPerfTiming(perf, 'resultMapping', elapsedSince(mappingStartedAt));

    if (journey) {
      journeys.push(journey);
    }

    if (maxTransfers > 0 && journey && journey.legs.length > 1) {
      const directQuery = buildJourneyQuery({
        fromStopId: fromCandidate.stopId,
        toStopId: toCandidate.stopId,
        departureMinutes: queryDepartureMinutes,
        maxTransfers: 0,
        maxInitialWaitingMinutes: input.maxInitialWaitingMinutes ?? DEFAULT_MAX_INITIAL_WAIT_MINUTES,
      });
      const directRouteStartedAt = perf ? nowMs() : 0;
      directRouteCalls += 1;
      const directResult = router.route(directQuery);
      if (perf) {
        const directRouteElapsedMs = elapsedSince(directRouteStartedAt);
        addPerfTiming(perf, 'directRouteCalls', directRouteElapsedMs);
        perf.directRouteCallDurations.push(directRouteElapsedMs);
      }
      const directMappingStartedAt = perf ? nowMs() : 0;
      const directJourney = mapRaptorResultToJourney({
        result: directResult,
        timetable,
        metadata: snapshot.metadata,
        context: {
          origin: input.origin,
          destination: input.destination,
          diaTipo,
          departureMinutes: queryDepartureMinutes,
          fromCandidate,
          toCandidate,
          maxTransfers: 0,
        },
      });
      if (perf) addPerfTiming(perf, 'resultMapping', elapsedSince(directMappingStartedAt));

      if (directJourney) {
        journeys.push(directJourney);
      }
    }
  }

  if (shouldSearchShortUrbanRangeAlternatives(input) && typeof router.rangeRoute === 'function') {
    for (const { fromCandidate, toCandidate } of selectShortUrbanRangeCandidatePairs(pairSelection.pairs)) {
      const queryDepartureMinutes =
        departureMinutes + estimateAccessWalkMinutes(fromCandidate.distanceMeters);
      const rangeQuery = buildJourneyRangeQuery({
        fromStopId: fromCandidate.stopId,
        toStopId: toCandidate.stopId,
        departureMinutes: queryDepartureMinutes,
        lastDepartureMinutes: queryDepartureMinutes + SHORT_URBAN_RANGE_WINDOW_MINUTES,
        maxTransfers,
        maxInitialWaitingMinutes: input.maxInitialWaitingMinutes ?? DEFAULT_MAX_INITIAL_WAIT_MINUTES,
      });

      rangeRouteCalls += 1;
      const rangeResult = router.rangeRoute(rangeQuery);
      const rangeRoutes = rangeResult.getRoutes().slice(0, SHORT_URBAN_RANGE_ROUTES_PER_PAIR_LIMIT);

      for (const route of rangeRoutes) {
        const journey = mapRaptorRouteToJourney({
          route,
          timetable,
          metadata: snapshot.metadata,
          context: {
            origin: input.origin,
            destination: input.destination,
            diaTipo,
            departureMinutes: queryDepartureMinutes,
            fromCandidate,
            toCandidate,
            maxTransfers,
          },
        });

        if (journey) {
          journeys.push(journey);
        }
      }
    }
  }
  if (
    (shouldSearchLlanosRangeAlternatives(input) || shouldSearchParaisoRangeAlternatives(input)) &&
    typeof router.rangeRoute === 'function'
  ) {
    for (const { fromCandidate, toCandidate } of selectLlanosRangeCandidatePairs(pairSelection.pairs)) {
      const queryDepartureMinutes =
        departureMinutes + estimateAccessWalkMinutes(fromCandidate.distanceMeters);
      const rangeQuery = buildJourneyRangeQuery({
        fromStopId: fromCandidate.stopId,
        toStopId: toCandidate.stopId,
        departureMinutes: queryDepartureMinutes,
        lastDepartureMinutes: queryDepartureMinutes + LLANOS_RANGE_WINDOW_MINUTES,
        maxTransfers,
        maxInitialWaitingMinutes: input.maxInitialWaitingMinutes ?? DEFAULT_MAX_INITIAL_WAIT_MINUTES,
      });

      rangeRouteCalls += 1;
      const rangeResult = router.rangeRoute(rangeQuery);
      const rangeRoutes = rangeResult.getRoutes().slice(0, LLANOS_RANGE_ROUTES_PER_PAIR_LIMIT);

      for (const route of rangeRoutes) {
        const journey = mapRaptorRouteToJourney({
          route,
          timetable,
          metadata: snapshot.metadata,
          context: {
            origin: input.origin,
            destination: input.destination,
            diaTipo,
            departureMinutes: queryDepartureMinutes,
            fromCandidate,
            toCandidate,
            maxTransfers,
          },
        });

        if (journey) {
          journeys.push(journey);
        }
      }
    }
  }
  if (isNorthLocalLoopDestination(input) && typeof router.rangeRoute === 'function') {
    for (const { fromCandidate, toCandidate } of selectNorthLocalLoopRangeCandidatePairs(input, pairSelection.pairs)) {
      const queryDepartureMinutes =
        departureMinutes + estimateAccessWalkMinutes(fromCandidate.distanceMeters);
      const rangeQuery = buildJourneyRangeQuery({
        fromStopId: fromCandidate.stopId,
        toStopId: toCandidate.stopId,
        departureMinutes: queryDepartureMinutes,
        lastDepartureMinutes: queryDepartureMinutes + NORTH_LOCAL_LOOP_RANGE_WINDOW_MINUTES,
        maxTransfers,
        maxInitialWaitingMinutes: input.maxInitialWaitingMinutes ?? DEFAULT_MAX_INITIAL_WAIT_MINUTES,
      });

      rangeRouteCalls += 1;
      const rangeResult = router.rangeRoute(rangeQuery);
      const rangeRoutes = rangeResult.getRoutes().slice(0, NORTH_LOCAL_LOOP_RANGE_ROUTES_PER_PAIR_LIMIT);

      for (const route of rangeRoutes) {
        const journey = mapRaptorRouteToJourney({
          route,
          timetable,
          metadata: snapshot.metadata,
          context: {
            origin: input.origin,
            destination: input.destination,
            diaTipo,
            departureMinutes: queryDepartureMinutes,
            fromCandidate,
            toCandidate,
            maxTransfers,
          },
        });

        if (journey) {
          journeys.push(journey);
        }
      }
    }
  }

  const terminalBranchCandidateJourneys: PlannedJourney[] = [];
  if (shouldSearchEastTerminalBranchCandidates(input) && typeof router.rangeRoute === 'function') {
    const routeHints = terminalSynthesisRouteHintsForDestination([
      input.destination.lng,
      input.destination.lat,
    ]);
    if (routeHints) {
      const terminalDestinationCandidates = selectEastTerminalBranchDestinationCandidates({
        routeHints,
        routeNamesByStopId,
        toCandidates,
      });
      for (const fromCandidate of eastTerminalCandidates(snapshot.stopsIndex)) {
        for (const toCandidate of terminalDestinationCandidates) {
          if (fromCandidate.stopId === toCandidate.stopId) continue;
          const rangeQuery = buildJourneyRangeQuery({
            fromStopId: fromCandidate.stopId,
            toStopId: toCandidate.stopId,
            departureMinutes,
            lastDepartureMinutes: departureMinutes + LLANOS_RANGE_WINDOW_MINUTES,
            maxTransfers: 0,
            maxInitialWaitingMinutes: input.maxInitialWaitingMinutes ?? DEFAULT_MAX_INITIAL_WAIT_MINUTES,
          });

          rangeRouteCalls += 1;
          const rangeResult = router.rangeRoute(rangeQuery);
          const rangeRoutes = rangeResult.getRoutes().slice(0, LLANOS_RANGE_ROUTES_PER_PAIR_LIMIT);

          for (const route of rangeRoutes) {
            const journey = mapRaptorRouteToJourney({
              route,
              timetable,
              metadata: snapshot.metadata,
              context: {
                origin: input.origin,
                destination: input.destination,
                diaTipo,
                departureMinutes,
                fromCandidate,
                toCandidate,
                maxTransfers: 0,
              },
            });

            if (journey && routeMatchesAnyHint(journey, routeHints)) {
              terminalBranchCandidateJourneys.push(journey);
            }
          }
        }
      }
    }
  }
  if (perf) addPerfTiming(perf, 'pairRouting', elapsedSince(pairRoutingStartedAt));

  const rankingCandidateSelectionStartedAt = perf ? nowMs() : 0;
  const finalJourneys = selectJourneyCandidatesForRanking(
    synthesizeTarasParaisoTerminalTransfer(journeys, input, terminalBranchCandidateJourneys),
  );
  if (perf) {
    addPerfTiming(perf, 'candidateSelectionForRanking', elapsedSince(rankingCandidateSelectionStartedAt));
  }

  return {
    source: 'raptor',
    journeys: finalJourneys,
    diagnostics: {
      diaTipo,
      candidatePairs: pairSelection.candidatePairs,
      routedCandidatePairs: pairSelection.pairs.length,
      raptorJourneys: finalJourneys.length,
      snapshotVersion: snapshot.metadata.version,
      fromCandidateCount: fromCandidates.length,
      toCandidateCount: toCandidates.length,
      candidatePairsSkippedSameStop: pairSelection.candidatePairsSkippedSameStop,
      candidatePairsSkippedAccessWalk: pairSelection.candidatePairsSkippedAccessWalk,
      routeCalls,
      directRouteCalls,
      rangeRouteCalls,
      ...finishPerfDiagnostics(perf),
    },
  };
}
