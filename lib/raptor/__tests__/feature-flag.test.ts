import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateRaptorRuntimeDecision, evaluateRaptorRuntimePreloadEnabled } from '../feature-flag';

test('RAPTOR runtime stays off by default', () => {
  assert.deepEqual(evaluateRaptorRuntimeDecision(), {
    enabled: false,
    mode: 'rollout_disabled',
    fallbackReason: 'feature_flag_off',
    rolloutPercent: 0,
  });
});

test('RAPTOR runtime force-on override wins over rollout percent', () => {
  assert.deepEqual(
    evaluateRaptorRuntimeDecision({
      forceEnv: '1',
      rolloutPercentEnv: '0',
    }),
    {
      enabled: true,
      mode: 'forced_on',
      rolloutPercent: 100,
    },
  );
});

test('RAPTOR runtime force-off override wins over force-on for rollback', () => {
  assert.deepEqual(
    evaluateRaptorRuntimeDecision({
      disableEnv: '1',
      forceEnv: '1',
      rolloutPercentEnv: '100',
    }),
    {
      enabled: false,
      mode: 'forced_off',
      fallbackReason: 'raptor_forced_off',
      rolloutPercent: 100,
    },
  );
});

test('RAPTOR runtime supports 100 percent rollout', () => {
  assert.deepEqual(
    evaluateRaptorRuntimeDecision({
      rolloutPercentEnv: '100',
    }),
    {
      enabled: true,
      mode: 'rollout_enabled',
      rolloutPercent: 100,
      rolloutBucket: 0,
    },
  );
});

test('RAPTOR runtime canary decision is stable for the same installation id', () => {
  const first = evaluateRaptorRuntimeDecision({
    installationId: 'test-installation',
    rolloutPercentEnv: '5',
    rolloutSalt: 'salt-a',
  });
  const second = evaluateRaptorRuntimeDecision({
    installationId: 'test-installation',
    rolloutPercentEnv: '5',
    rolloutSalt: 'salt-a',
  });

  assert.deepEqual(second, first);
  assert.equal(typeof first.rolloutBucket, 'number');
});

test('RAPTOR runtime clamps invalid rollout percentages to default off', () => {
  assert.deepEqual(
    evaluateRaptorRuntimeDecision({
      rolloutPercentEnv: 'nope',
    }),
    {
      enabled: false,
      mode: 'rollout_disabled',
      fallbackReason: 'feature_flag_off',
      rolloutPercent: 0,
    },
  );
});

test('sync RAPTOR runtime flag only preloads force-on or full rollout', () => {
  assert.equal(
    evaluateRaptorRuntimePreloadEnabled({
      rolloutPercentEnv: '5',
    }),
    false,
  );

  assert.equal(
    evaluateRaptorRuntimePreloadEnabled({
      rolloutPercentEnv: '100',
    }),
    true,
  );

  assert.equal(
    evaluateRaptorRuntimePreloadEnabled({
      forceEnv: '1',
      rolloutPercentEnv: '0',
    }),
    true,
  );

  assert.equal(
    evaluateRaptorRuntimePreloadEnabled({
      disableEnv: '1',
      forceEnv: '1',
      rolloutPercentEnv: '100',
    }),
    false,
  );
});
