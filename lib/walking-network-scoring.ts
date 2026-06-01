import type { WalkingRouteResult } from '@/lib/walking-network';

export const WALK_NETWORK_SOFT_LIMIT_METERS = 2_500;
export const WALK_NETWORK_HARD_LIMIT_METERS = 5_000;
export const WALK_NETWORK_DETOUR_RATIO_LIMIT = 2.2;

const WALK_SCORE_METERS_PER_POINT = 70;
const SHORT_NO_ROUTE_METERS_PER_POINT = 80;

export function computeWalkNetworkPenalty(walkingRoute: WalkingRouteResult) {
  if (walkingRoute.status === 'unavailable') return 0;

  const straightLineMeters = Math.max(0, walkingRoute.straightLineMeters);

  if (walkingRoute.status === 'no_route') {
    if (straightLineMeters < 350) {
      return Math.max(3, Math.round(straightLineMeters / SHORT_NO_ROUTE_METERS_PER_POINT));
    }

    return Math.round(8 + straightLineMeters / 120);
  }

  const networkDistanceMeters = Math.max(
    0,
    walkingRoute.networkDistanceMeters ?? straightLineMeters,
  );
  const extraNetworkMeters = Math.max(0, networkDistanceMeters - straightLineMeters);
  const detourRatio =
    walkingRoute.detourRatio ??
    (straightLineMeters > 0 ? networkDistanceMeters / straightLineMeters : 1);

  let penalty = extraNetworkMeters / WALK_SCORE_METERS_PER_POINT;

  if (detourRatio > WALK_NETWORK_DETOUR_RATIO_LIMIT && networkDistanceMeters >= 700) {
    penalty += Math.min(18, (detourRatio - WALK_NETWORK_DETOUR_RATIO_LIMIT) * 4);
  }

  if (networkDistanceMeters > WALK_NETWORK_SOFT_LIMIT_METERS) {
    penalty += (networkDistanceMeters - WALK_NETWORK_SOFT_LIMIT_METERS) / 350;
  }

  if (networkDistanceMeters > WALK_NETWORK_HARD_LIMIT_METERS) {
    penalty += 25;
  }

  return Math.max(0, Math.round(penalty));
}
