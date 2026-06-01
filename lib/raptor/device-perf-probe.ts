import { buildGoldenCaseJourneyTitle, plannerGoldenCases, type PlannerGoldenCase } from '@/lib/planner-golden-cases';

import { findJourneysWithRaptor } from './find-journeys';
import { rankRaptorJourneys } from './journey-ranking';
import type { FindJourneysResult } from './types';

let probeStarted = false;

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) return 0;

  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
}

function destinationCoordinates(goldenCase: PlannerGoldenCase) {
  return goldenCase.destinationCoordinates ?? null;
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function shouldCollectPerfDiagnostics() {
  return process.env.EXPO_PUBLIC_RAPTOR_PERF_DIAGNOSTICS === '1';
}

function roundNumberRecord(record: Record<string, number | undefined> | undefined) {
  if (!record) return undefined;

  return Object.fromEntries(
    Object.entries(record)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .map(([key, value]) => [key, roundMs(value)]),
  );
}

function roundDurationStats(
  stats: NonNullable<NonNullable<FindJourneysResult['diagnostics']>['routeCallDurationStatsMs']> | undefined,
) {
  if (!stats) return undefined;

  return {
    count: stats.count,
    p50: roundMs(stats.p50),
    p95: roundMs(stats.p95),
    max: roundMs(stats.max),
    total: roundMs(stats.total),
  };
}

function summarizeDiagnostics(diagnostics: FindJourneysResult['diagnostics'] | undefined) {
  if (!diagnostics) return undefined;

  return {
    fromCandidateCount: diagnostics.fromCandidateCount,
    toCandidateCount: diagnostics.toCandidateCount,
    candidatePairs: diagnostics.candidatePairs,
    routedCandidatePairs: diagnostics.routedCandidatePairs,
    candidatePairsSkippedSameStop: diagnostics.candidatePairsSkippedSameStop,
    candidatePairsSkippedAccessWalk: diagnostics.candidatePairsSkippedAccessWalk,
    routeCalls: diagnostics.routeCalls,
    directRouteCalls: diagnostics.directRouteCalls,
    rangeRouteCalls: diagnostics.rangeRouteCalls,
    raptorJourneys: diagnostics.raptorJourneys,
    perfTimingsMs: roundNumberRecord(diagnostics.perfTimingsMs),
    routeCallDurationStatsMs: roundDurationStats(diagnostics.routeCallDurationStatsMs),
    directRouteCallDurationStatsMs: roundDurationStats(diagnostics.directRouteCallDurationStatsMs),
  };
}

function accumulateDiagnostics(
  totals: {
    routeCalls: number;
    directRouteCalls: number;
    rangeRouteCalls: number;
    candidatePairs: number;
    routedCandidatePairs: number;
    candidatePairsSkippedSameStop: number;
    candidatePairsSkippedAccessWalk: number;
    perfTimingsMs: Record<string, number>;
  },
  diagnostics: ReturnType<typeof summarizeDiagnostics>,
) {
  if (!diagnostics) return;

  totals.routeCalls += diagnostics.routeCalls ?? 0;
  totals.directRouteCalls += diagnostics.directRouteCalls ?? 0;
  totals.rangeRouteCalls += diagnostics.rangeRouteCalls ?? 0;
  totals.candidatePairs += diagnostics.candidatePairs ?? 0;
  totals.routedCandidatePairs += diagnostics.routedCandidatePairs ?? 0;
  totals.candidatePairsSkippedSameStop += diagnostics.candidatePairsSkippedSameStop ?? 0;
  totals.candidatePairsSkippedAccessWalk += diagnostics.candidatePairsSkippedAccessWalk ?? 0;

  for (const [key, value] of Object.entries(diagnostics.perfTimingsMs ?? {})) {
    totals.perfTimingsMs[key] = (totals.perfTimingsMs[key] ?? 0) + value;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function runMeasuredCase(params: {
  goldenCase: PlannerGoldenCase;
  perfDiagnostics: boolean;
  destination: [number, number];
  departureDate: Date;
}) {
  const startedAt = nowMs();
  const planningStartedAt = nowMs();
  const planningResult = await withTimeout(
    findJourneysWithRaptor({
      origin: { lng: params.goldenCase.originCoordinates[0], lat: params.goldenCase.originCoordinates[1] },
      destination: { lng: params.destination[0], lat: params.destination[1] },
      departureDate: params.departureDate,
      perfDiagnostics: params.perfDiagnostics,
    }),
    30000,
    params.goldenCase.id,
  );
  const planningMs = nowMs() - planningStartedAt;
  const rankingStartedAt = nowMs();
  const ranking = rankRaptorJourneys({
    journeys: planningResult.journeys,
    origin: params.goldenCase.originCoordinates,
    destination: params.destination,
    destinationName: params.goldenCase.destinationLabel ?? params.goldenCase.destinationQuery,
  });
  const rankingMs = nowMs() - rankingStartedAt;
  const elapsedMs = nowMs() - startedAt;
  const topJourney = ranking.ranked[0] ?? null;

  return {
    id: params.goldenCase.id,
    elapsedMs,
    planningMs,
    rankingMs,
    source: planningResult.source,
    journeyCount: ranking.ranked.length,
    diagnostics: summarizeDiagnostics(planningResult.diagnostics),
    topTitle: topJourney ? buildGoldenCaseJourneyTitle(topJourney) : 'Sin journeys',
  };
}

export async function runRaptorDevicePerfProbe() {
  if (probeStarted) return;
  probeStarted = true;

  const departureDate = new Date('2026-05-07T09:00:00-06:00');
  const selectedCases = plannerGoldenCases
    .map((goldenCase) => ({
      goldenCase,
      destination: destinationCoordinates(goldenCase),
    }))
    .filter(
      (entry): entry is { goldenCase: PlannerGoldenCase; destination: [number, number] } =>
        entry.destination != null,
    )
    .slice(0, 50);
  const perfDiagnostics = shouldCollectPerfDiagnostics();

  const sourceCounts: Record<string, number> = {};
  const results: Array<{
    id: string;
    elapsedMs: number;
    planningMs: number;
    rankingMs: number;
    source: string;
    journeyCount: number;
    diagnostics: ReturnType<typeof summarizeDiagnostics>;
    topTitle: string;
  }> = [];

  console.log(
    `RAPTOR_DEVICE_P95_START ${JSON.stringify({
      count: selectedCases.length,
      surface: 'findJourneysWithRaptor+rankRaptorJourneys',
      perfDiagnostics,
    })}`,
  );

  const warmupEntry = selectedCases[0];
  if (warmupEntry) {
    const warmup = await runMeasuredCase({
      goldenCase: warmupEntry.goldenCase,
      perfDiagnostics,
      destination: warmupEntry.destination,
      departureDate,
    });
    console.log(
      `RAPTOR_DEVICE_P95_WARMUP ${JSON.stringify({
        id: warmup.id,
        elapsedMs: roundMs(warmup.elapsedMs),
        planningMs: roundMs(warmup.planningMs),
        rankingMs: roundMs(warmup.rankingMs),
        journeys: warmup.journeyCount,
        diagnostics: warmup.diagnostics,
      })}`,
    );
  }

  for (const [index, { destination, goldenCase }] of selectedCases.entries()) {
    const result = await runMeasuredCase({
      goldenCase,
      perfDiagnostics,
      destination,
      departureDate,
    });

    sourceCounts[result.source] = (sourceCounts[result.source] ?? 0) + 1;
    results.push(result);

    console.log(
      `RAPTOR_DEVICE_P95_CASE ${JSON.stringify({
        index: index + 1,
        count: selectedCases.length,
        id: result.id,
        elapsedMs: roundMs(result.elapsedMs),
        planningMs: roundMs(result.planningMs),
        rankingMs: roundMs(result.rankingMs),
        journeys: result.journeyCount,
        diagnostics: result.diagnostics,
      })}`,
    );
  }

  const sortedTimes = results.map((result) => result.elapsedMs).sort((a, b) => a - b);
  const diagnosticTotals = {
    routeCalls: 0,
    directRouteCalls: 0,
    rangeRouteCalls: 0,
    candidatePairs: 0,
    routedCandidatePairs: 0,
    candidatePairsSkippedSameStop: 0,
    candidatePairsSkippedAccessWalk: 0,
    perfTimingsMs: {} as Record<string, number>,
  };

  for (const result of results) {
    accumulateDiagnostics(diagnosticTotals, result.diagnostics);
  }

  const slowest = [...results]
    .sort((a, b) => b.elapsedMs - a.elapsedMs)
    .slice(0, 5)
    .map((result) => ({
      id: result.id,
      elapsedMs: roundMs(result.elapsedMs),
      planningMs: roundMs(result.planningMs),
      rankingMs: roundMs(result.rankingMs),
      source: result.source,
      journeyCount: result.journeyCount,
      diagnostics: result.diagnostics,
      topTitle: result.topTitle,
    }));

  console.log(
    `RAPTOR_DEVICE_P95_RESULT ${JSON.stringify({
      count: results.length,
      perfDiagnostics,
      p50Ms: roundMs(percentile(sortedTimes, 50)),
      p95Ms: roundMs(percentile(sortedTimes, 95)),
      p99Ms: roundMs(percentile(sortedTimes, 99)),
      maxMs: roundMs(sortedTimes[sortedTimes.length - 1] ?? 0),
      sourceCounts,
      diagnosticsTotals: {
        ...diagnosticTotals,
        perfTimingsMs: roundNumberRecord(diagnosticTotals.perfTimingsMs),
      },
      slowest,
    })}`,
  );
}
