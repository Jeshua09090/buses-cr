import { planJourneys as planLegacyJourneys } from '@/lib/journey-planner';

import { isRaptorRuntimeEnabled, resolveRaptorRuntimeDecision, type RaptorRuntimeDecision } from './feature-flag';
import { findJourneysWithRaptor } from './find-journeys';
import { prefetchSnapshot } from './snapshot-cache';
import { emitPlannerRuntimeTelemetry } from './telemetry';
import type { FindJourneysInput, FindJourneysResult } from './types';

export { isRaptorRuntimeEnabled, prefetchSnapshot, resolveRaptorRuntimeDecision };
export type { FindJourneysInput, FindJourneysResult };

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function withRuntimeDiagnostics(
  result: FindJourneysResult,
  decision: RaptorRuntimeDecision,
  startedAtMs: number,
): FindJourneysResult {
  return {
    ...result,
    diagnostics: {
      diaTipo: result.diagnostics?.diaTipo ?? 'habil',
      candidatePairs: result.diagnostics?.candidatePairs ?? 0,
      raptorJourneys: result.diagnostics?.raptorJourneys ?? 0,
      ...result.diagnostics,
      runtimeDecision: decision,
      runtimeLatencyMs: Math.round(nowMs() - startedAtMs),
    },
  };
}

async function findJourneysWithLegacy(
  input: FindJourneysInput,
  fallbackReason?: string,
  decision?: RaptorRuntimeDecision,
  startedAtMs = nowMs(),
): Promise<FindJourneysResult> {
  const legacyRadiusMeters =
    input.walkRadiusMeters ??
    (input.originWalkRadiusMeters != null || input.destinationWalkRadiusMeters != null
      ? Math.max(input.originWalkRadiusMeters ?? 0, input.destinationWalkRadiusMeters ?? 0)
      : undefined);

  const journeys = await planLegacyJourneys({
    origin: [input.origin.lng, input.origin.lat],
    destination: [input.destination.lng, input.destination.lat],
    radioMeters: legacyRadiusMeters,
  });

  return {
    source: 'legacy',
    journeys,
    diagnostics: {
      diaTipo: 'habil',
      candidatePairs: 0,
      raptorJourneys: 0,
      fallbackReason,
      runtimeDecision: decision,
      runtimeLatencyMs: Math.round(nowMs() - startedAtMs),
    },
  };
}

function finalizeFindJourneysResult(result: FindJourneysResult) {
  emitPlannerRuntimeTelemetry(result);
  return result;
}

export async function findJourneys(input: FindJourneysInput): Promise<FindJourneysResult> {
  const startedAtMs = nowMs();
  const decision = await resolveRaptorRuntimeDecision();

  if (!decision.enabled) {
    return finalizeFindJourneysResult(
      await findJourneysWithLegacy(input, decision.fallbackReason ?? 'feature_flag_off', decision, startedAtMs),
    );
  }

  try {
    return finalizeFindJourneysResult(withRuntimeDiagnostics(await findJourneysWithRaptor(input), decision, startedAtMs));
  } catch (error) {
    if (__DEV__) {
      console.warn('RAPTOR runtime failed; falling back to legacy planner.', error);
    }

    return finalizeFindJourneysResult(
      await findJourneysWithLegacy(
        input,
        error instanceof Error ? error.message : 'unknown_raptor_error',
        decision,
        startedAtMs,
      ),
    );
  }
}
