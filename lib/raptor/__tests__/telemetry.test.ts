import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlannerRuntimeTelemetryEvent,
  shouldEmitPlannerRuntimeTelemetry,
} from '../telemetry';
import type { FindJourneysResult } from '../types';

test('planner runtime telemetry stays off without rollout or explicit opt-in', () => {
  assert.equal(shouldEmitPlannerRuntimeTelemetry(undefined, {}), false);
  assert.equal(
    shouldEmitPlannerRuntimeTelemetry(
      {
        enabled: true,
        mode: 'forced_on',
        rolloutPercent: 100,
      },
      {},
    ),
    false,
  );
});

test('planner runtime telemetry emits for rollout buckets and rollback override', () => {
  assert.equal(
    shouldEmitPlannerRuntimeTelemetry(
      {
        enabled: true,
        mode: 'rollout_enabled',
        rolloutPercent: 5,
        rolloutBucket: 2.12,
      },
      {},
    ),
    true,
  );
  assert.equal(
    shouldEmitPlannerRuntimeTelemetry(
      {
        enabled: false,
        mode: 'forced_off',
        fallbackReason: 'raptor_forced_off',
        rolloutPercent: 5,
      },
      {},
    ),
    true,
  );
});

test('planner runtime telemetry supports explicit enable and disable envs', () => {
  assert.equal(
    shouldEmitPlannerRuntimeTelemetry(undefined, {
      EXPO_PUBLIC_RAPTOR_TELEMETRY_ENABLED: '1',
    }),
    true,
  );
  assert.equal(
    shouldEmitPlannerRuntimeTelemetry(
      {
        enabled: true,
        mode: 'rollout_enabled',
        rolloutPercent: 5,
      },
      {
        EXPO_PUBLIC_RAPTOR_TELEMETRY_ENABLED: '1',
        EXPO_PUBLIC_RAPTOR_TELEMETRY_DISABLED: '1',
      },
    ),
    false,
  );
});

test('planner runtime telemetry event contains rollout diagnostics without coordinates', () => {
  const result = {
    source: 'raptor',
    journeys: [{ id: 'journey-1', legs: [] }],
    diagnostics: {
      diaTipo: 'habil',
      candidatePairs: 12,
      raptorJourneys: 3,
      runtimeLatencyMs: 1234,
      snapshotVersion: 'snapshot-test',
      runtimeDecision: {
        enabled: true,
        mode: 'rollout_enabled',
        rolloutPercent: 5,
        rolloutBucket: 1.23,
      },
    },
  } as unknown as FindJourneysResult;

  assert.deepEqual(buildPlannerRuntimeTelemetryEvent(result), {
    app_runtime: 'node',
    planner_source: 'raptor',
    runtime_mode: 'rollout_enabled',
    rollout_percent: 5,
    rollout_bucket: 1.23,
    runtime_latency_ms: 1234,
    fallback_reason: null,
    journey_count: 1,
    snapshot_version: 'snapshot-test',
    departure_day_type: 'habil',
  });
});
