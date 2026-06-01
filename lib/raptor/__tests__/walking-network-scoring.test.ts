import assert from 'node:assert/strict';
import test from 'node:test';

import { computeWalkNetworkPenalty } from '../../walking-network-scoring';

test('computeWalkNetworkPenalty scores short final-walk detours in planner score units', () => {
  const penalty = computeWalkNetworkPenalty({
    provider: 'mapbox',
    status: 'ok',
    routeAvailable: true,
    straightLineMeters: 331,
    networkDistanceMeters: 512,
    networkDurationMinutes: 7,
    detourRatio: 1.55,
    coordinates: [],
    failureReason: null,
  });

  assert.equal(penalty, 3);
});

test('computeWalkNetworkPenalty keeps short no-route uncertainty modest', () => {
  const penalty = computeWalkNetworkPenalty({
    provider: 'mapbox',
    status: 'no_route',
    routeAvailable: false,
    straightLineMeters: 331,
    networkDistanceMeters: null,
    networkDurationMinutes: null,
    detourRatio: null,
    coordinates: [],
    failureReason: 'NoRoute',
  });

  assert.equal(penalty, 4);
});
