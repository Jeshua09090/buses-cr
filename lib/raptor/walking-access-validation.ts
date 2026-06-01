import type { JourneyGeoMetrics, PlannedJourney } from '@/lib/journey-planner';
import {
  getWalkingRoute as getDefaultWalkingRoute,
  hasWalkingNetworkProvider,
  type WalkingCoordinate,
  type WalkingRouteResult,
} from '@/lib/walking-network';
import {
  computeWalkNetworkPenalty,
  WALK_NETWORK_DETOUR_RATIO_LIMIT,
  WALK_NETWORK_SOFT_LIMIT_METERS,
} from '@/lib/walking-network-scoring';

type EndpointKind = 'origin' | 'final';

type WalkingRouteGetter = (params: {
  from: WalkingCoordinate;
  to: WalkingCoordinate;
}) => Promise<WalkingRouteResult>;

const WALK_NETWORK_VALIDATION_LIMIT = 24;
const ORIGIN_NETWORK_MIN_STRAIGHT_LINE_METERS = 250;

function stopCoordinate(
  stop: PlannedJourney['legs'][number]['boardStop'] | PlannedJourney['legs'][number]['alightStop'] | undefined,
): WalkingCoordinate | null {
  if (!stop) return null;
  if (!Number.isFinite(Number(stop.lng)) || !Number.isFinite(Number(stop.lat))) return null;
  return [Number(stop.lng), Number(stop.lat)];
}

function buildEndpointFlags(kind: EndpointKind, walkingRoute: WalkingRouteResult) {
  if (walkingRoute.status === 'unavailable') return [];
  if (walkingRoute.status === 'no_route') return [`${kind}_walk_no_network_route`];

  const flags: string[] = [];
  if (
    walkingRoute.detourRatio !== null &&
    walkingRoute.detourRatio > WALK_NETWORK_DETOUR_RATIO_LIMIT &&
    (walkingRoute.networkDistanceMeters ?? 0) >= 700
  ) {
    flags.push(`${kind}_walk_detour_high`);
  }

  if ((walkingRoute.networkDistanceMeters ?? 0) > WALK_NETWORK_SOFT_LIMIT_METERS) {
    flags.push(`${kind}_walk_network_long`);
  }

  return flags;
}

function uniqueQualityFlags(flags: string[]) {
  return Array.from(new Set(flags.filter(Boolean)));
}

function buildGeoMetrics(journey: PlannedJourney): JourneyGeoMetrics {
  return {
    baseScore: journey.geoMetrics?.baseScore ?? journey.score,
    scoreAdjustment: journey.geoMetrics?.scoreAdjustment ?? null,
    confidenceScore: journey.geoMetrics?.confidenceScore ?? null,
    qualityFlags: journey.geoMetrics?.qualityFlags ?? [],
    straightLineMeters: journey.geoMetrics?.straightLineMeters ?? null,
    originWalkMeters: journey.geoMetrics?.originWalkMeters ?? journey.originWalkMeters,
    transferWalkMeters: journey.geoMetrics?.transferWalkMeters ?? journey.transferWalkMeters,
    finalWalkMeters: journey.geoMetrics?.finalWalkMeters ?? journey.destinationWalkMeters,
    totalWalkMeters: journey.geoMetrics?.totalWalkMeters ?? journey.totalWalkMeters,
    firstLegDestinationDistanceMeters: journey.geoMetrics?.firstLegDestinationDistanceMeters ?? null,
    finalStopDestinationDistanceMeters:
      journey.geoMetrics?.finalStopDestinationDistanceMeters ?? journey.destinationWalkMeters,
    firstLegProgressMeters: journey.geoMetrics?.firstLegProgressMeters ?? null,
    firstLegProgressRatio: journey.geoMetrics?.firstLegProgressRatio ?? null,
    finalStopProgressMeters: journey.geoMetrics?.finalStopProgressMeters ?? null,
    finalStopProgressRatio: journey.geoMetrics?.finalStopProgressRatio ?? null,
    firstLegBacktrackMeters: journey.geoMetrics?.firstLegBacktrackMeters ?? null,
    finalStopBacktrackMeters: journey.geoMetrics?.finalStopBacktrackMeters ?? null,
    transferGainMeters: journey.geoMetrics?.transferGainMeters ?? null,
    transferGainRatio: journey.geoMetrics?.transferGainRatio ?? null,
    totalWalkRatio: journey.geoMetrics?.totalWalkRatio ?? null,
    transferWalkRatio: journey.geoMetrics?.transferWalkRatio ?? null,
    boardShapeDistanceMeters: journey.geoMetrics?.boardShapeDistanceMeters ?? null,
    firstAlightShapeDistanceMeters: journey.geoMetrics?.firstAlightShapeDistanceMeters ?? null,
    secondBoardShapeDistanceMeters: journey.geoMetrics?.secondBoardShapeDistanceMeters ?? null,
    finalAlightShapeDistanceMeters: journey.geoMetrics?.finalAlightShapeDistanceMeters ?? null,
    maxShapeStopDistanceMeters: journey.geoMetrics?.maxShapeStopDistanceMeters ?? null,
    routeDestinationAlignment: journey.geoMetrics?.routeDestinationAlignment ?? null,
    transferQualityLabel: journey.geoMetrics?.transferQualityLabel ?? null,
    transferQualityScore: journey.geoMetrics?.transferQualityScore ?? null,
    finalWalkStraightMeters: journey.geoMetrics?.finalWalkStraightMeters ?? journey.destinationWalkMeters,
    finalWalkNetworkMeters: journey.geoMetrics?.finalWalkNetworkMeters ?? null,
    finalWalkNetworkMinutes: journey.geoMetrics?.finalWalkNetworkMinutes ?? null,
    walkDetourRatio: journey.geoMetrics?.walkDetourRatio ?? null,
    walkRouteAvailable: journey.geoMetrics?.walkRouteAvailable ?? null,
    walkNetworkPenalty: journey.geoMetrics?.walkNetworkPenalty ?? null,
    walkNetworkStatus: journey.geoMetrics?.walkNetworkStatus ?? null,
    finalWalkBacktrackDot: journey.geoMetrics?.finalWalkBacktrackDot ?? null,
    finalWalkBacktrackPenalty: journey.geoMetrics?.finalWalkBacktrackPenalty ?? null,
    finalWalkStartsAgainstBus: journey.geoMetrics?.finalWalkStartsAgainstBus ?? null,
    finalWalkRouteCoordinates: journey.geoMetrics?.finalWalkRouteCoordinates ?? null,
  };
}

function confidenceDropFor(walkingRoute: WalkingRouteResult, penalty: number) {
  if (walkingRoute.status === 'no_route') return 0.32;
  if (penalty >= 1_500) return 0.22;
  return penalty > 0 ? 0.12 : 0;
}

function shouldKeepStraightLineOriginWalk(walkingRoute: WalkingRouteResult) {
  if (walkingRoute.status !== 'ok') return false;

  return walkingRoute.straightLineMeters < ORIGIN_NETWORK_MIN_STRAIGHT_LINE_METERS;
}

function applyEndpointWalkingRoute(params: {
  journey: PlannedJourney;
  walkingRoute: WalkingRouteResult;
  kind: EndpointKind;
}) {
  const { journey, kind, walkingRoute } = params;
  if (walkingRoute.status === 'unavailable') return journey;
  if (kind === 'origin' && shouldKeepStraightLineOriginWalk(walkingRoute)) return journey;

  const geoMetrics = buildGeoMetrics(journey);
  const penalty = computeWalkNetworkPenalty(walkingRoute);
  const networkDistanceMeters =
    walkingRoute.status === 'ok' && walkingRoute.networkDistanceMeters !== null
      ? walkingRoute.networkDistanceMeters
      : null;
  const nextFlags = uniqueQualityFlags([
    ...geoMetrics.qualityFlags,
    ...buildEndpointFlags(kind, walkingRoute),
  ]);
  const confidenceDrop = confidenceDropFor(walkingRoute, penalty);
  const confidenceScore =
    geoMetrics.confidenceScore !== null
      ? Math.max(0, geoMetrics.confidenceScore - confidenceDrop)
      : walkingRoute.status === 'ok'
        ? Math.max(0, 1 - confidenceDrop)
        : 0.45;
  const scoreAdjustment = (geoMetrics.scoreAdjustment ?? 0) + penalty;

  if (kind === 'origin') {
    const originWalkMeters = networkDistanceMeters ?? journey.originWalkMeters;
    const totalWalkMeters =
      networkDistanceMeters !== null
        ? Math.max(0, journey.totalWalkMeters - journey.originWalkMeters + networkDistanceMeters)
        : journey.totalWalkMeters;

    return {
      ...journey,
      originWalkMeters,
      totalWalkMeters,
      score: journey.score + penalty,
      geoMetrics: {
        ...geoMetrics,
        confidenceScore,
        qualityFlags: nextFlags,
        originWalkMeters,
        scoreAdjustment,
        totalWalkMeters,
      },
    } satisfies PlannedJourney;
  }

  const destinationWalkMeters = networkDistanceMeters ?? journey.destinationWalkMeters;
  const totalWalkMeters =
    networkDistanceMeters !== null
      ? Math.max(0, journey.totalWalkMeters - journey.destinationWalkMeters + networkDistanceMeters)
      : journey.totalWalkMeters;

  return {
    ...journey,
    destinationWalkMeters,
    totalWalkMeters,
    score: journey.score + penalty,
    geoMetrics: {
      ...geoMetrics,
      confidenceScore,
      finalWalkMeters: destinationWalkMeters,
      finalStopDestinationDistanceMeters: destinationWalkMeters,
      finalWalkStraightMeters: walkingRoute.straightLineMeters,
      finalWalkNetworkMeters: networkDistanceMeters,
      finalWalkNetworkMinutes: walkingRoute.networkDurationMinutes,
      finalWalkRouteCoordinates: walkingRoute.coordinates.length > 0 ? walkingRoute.coordinates : null,
      qualityFlags: nextFlags,
      scoreAdjustment,
      totalWalkMeters,
      walkDetourRatio: walkingRoute.detourRatio,
      walkNetworkPenalty: penalty,
      walkNetworkStatus: walkingRoute.status,
      walkRouteAvailable: walkingRoute.routeAvailable,
    },
  } satisfies PlannedJourney;
}

export async function applyEndpointWalkingNetworkValidationToJourneys(params: {
  destination: WalkingCoordinate;
  journeys: PlannedJourney[];
  origin: WalkingCoordinate;
  getWalkingRoute?: WalkingRouteGetter;
  limit?: number;
}) {
  const {
    destination,
    getWalkingRoute = getDefaultWalkingRoute,
    journeys,
    limit = WALK_NETWORK_VALIDATION_LIMIT,
    origin,
  } = params;

  if (journeys.length === 0) return journeys;
  if (!params.getWalkingRoute && !hasWalkingNetworkProvider()) return journeys;

  const candidates = [...journeys].sort((a, b) => a.score - b.score).slice(0, limit);
  const candidateIds = new Set(candidates.map((journey) => journey.id));
  const routesByJourneyId = new Map<
    string,
    {
      final?: WalkingRouteResult;
      origin?: WalkingRouteResult;
    }
  >();

  await Promise.all(
    candidates.map(async (journey) => {
      const firstBoardCoordinate = stopCoordinate(journey.legs[0]?.boardStop);
      const finalAlightCoordinate = stopCoordinate(journey.legs[journey.legs.length - 1]?.alightStop);
      const routes: { final?: WalkingRouteResult; origin?: WalkingRouteResult } = {};

      await Promise.all([
        firstBoardCoordinate
          ? getWalkingRoute({ from: origin, to: firstBoardCoordinate }).then((route) => {
              routes.origin = route;
            })
          : Promise.resolve(),
        finalAlightCoordinate
          ? getWalkingRoute({ from: finalAlightCoordinate, to: destination }).then((route) => {
              routes.final = route;
            })
          : Promise.resolve(),
      ]);

      routesByJourneyId.set(journey.id, routes);
    }),
  );

  return journeys
    .map((journey) => {
      if (!candidateIds.has(journey.id)) return journey;

      const routes = routesByJourneyId.get(journey.id);
      let nextJourney = journey;
      if (routes?.origin) {
        nextJourney = applyEndpointWalkingRoute({
          journey: nextJourney,
          kind: 'origin',
          walkingRoute: routes.origin,
        });
      }
      if (routes?.final) {
        nextJourney = applyEndpointWalkingRoute({
          journey: nextJourney,
          kind: 'final',
          walkingRoute: routes.final,
        });
      }

      return nextJourney;
    })
    .sort((a, b) => a.score - b.score);
}
