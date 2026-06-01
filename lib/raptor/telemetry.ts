import type { RaptorRuntimeDecision } from './feature-flag';
import type { FindJourneysResult } from './types';

const TELEMETRY_TABLE = 'planner_runtime_events';

type TelemetryEnv = {
  [key: string]: string | undefined;
  EXPO_PUBLIC_RAPTOR_TELEMETRY_ENABLED?: string;
  EXPO_PUBLIC_RAPTOR_TELEMETRY_DISABLED?: string;
};

export type PlannerRuntimeTelemetryEvent = {
  app_runtime: 'native' | 'web' | 'node';
  planner_source: FindJourneysResult['source'];
  runtime_mode: RaptorRuntimeDecision['mode'] | null;
  rollout_percent: number | null;
  rollout_bucket: number | null;
  runtime_latency_ms: number | null;
  fallback_reason: string | null;
  journey_count: number;
  snapshot_version: string | null;
  departure_day_type: string | null;
};

function isTruthyEnv(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

function appRuntime(): PlannerRuntimeTelemetryEvent['app_runtime'] {
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return 'native';
  }

  if (typeof window !== 'undefined') {
    return 'web';
  }

  return 'node';
}

export function shouldEmitPlannerRuntimeTelemetry(
  decision: RaptorRuntimeDecision | undefined,
  env: TelemetryEnv = process.env,
) {
  if (isTruthyEnv(env.EXPO_PUBLIC_RAPTOR_TELEMETRY_DISABLED)) return false;
  if (isTruthyEnv(env.EXPO_PUBLIC_RAPTOR_TELEMETRY_ENABLED)) return true;

  if (!decision) return false;

  return decision.rolloutPercent > 0 && decision.mode !== 'forced_on';
}

export function buildPlannerRuntimeTelemetryEvent(
  result: FindJourneysResult,
): PlannerRuntimeTelemetryEvent {
  const diagnostics = result.diagnostics;
  const decision = diagnostics?.runtimeDecision;

  return {
    app_runtime: appRuntime(),
    planner_source: result.source,
    runtime_mode: decision?.mode ?? null,
    rollout_percent: decision?.rolloutPercent ?? null,
    rollout_bucket: decision?.rolloutBucket ?? null,
    runtime_latency_ms: diagnostics?.runtimeLatencyMs ?? null,
    fallback_reason: diagnostics?.fallbackReason ?? decision?.fallbackReason ?? null,
    journey_count: result.journeys.length,
    snapshot_version: diagnostics?.snapshotVersion ?? null,
    departure_day_type: diagnostics?.diaTipo ?? null,
  };
}

async function insertPlannerRuntimeTelemetry(event: PlannerRuntimeTelemetryEvent) {
  const { supabase } = await import('@/lib/supabase');
  const { error } = await supabase.from(TELEMETRY_TABLE).insert(event);

  if (error && __DEV__) {
    console.warn('RAPTOR planner telemetry insert failed.', error);
  }
}

export function emitPlannerRuntimeTelemetry(result: FindJourneysResult) {
  if (!shouldEmitPlannerRuntimeTelemetry(result.diagnostics?.runtimeDecision)) return;

  const event = buildPlannerRuntimeTelemetryEvent(result);

  void insertPlannerRuntimeTelemetry(event).catch((error) => {
    if (__DEV__) {
      console.warn('RAPTOR planner telemetry failed.', error);
    }
  });
}
