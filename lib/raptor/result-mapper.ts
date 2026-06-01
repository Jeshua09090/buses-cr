import type { Leg, Result, Route as PublicRoute, Stop, Timetable, VehicleLeg } from 'minotor';

import type { JourneyLeg, PlannedJourney } from '@/lib/journey-planner';
import type { Parada } from '@/lib/paradas';

import { haversineMeters } from './geo';
import type {
  NearbyStopCandidate,
  RaptorJourneyContext,
  ServiceRouteDirectoryEntry,
  SnapshotMetadata,
} from './types';

type TimetableRoute = ReturnType<Timetable['routesPassingThrough']>[number];

const WALK_SCORE_METERS_PER_POINT = 70;

function isVehicleLeg(leg: Leg): leg is VehicleLeg {
  return 'route' in leg && 'departureTime' in leg && 'arrivalTime' in leg;
}

function stopToParada(stop: Stop): Parada {
  return {
    parada_id: Number(stop.sourceStopId ?? stop.id),
    nombre: stop.name,
    lat: typeof stop.lat === 'number' ? stop.lat : 0,
    lng: typeof stop.lon === 'number' ? stop.lon : 0,
    tiene_techo: null,
    accesible: null,
  };
}

function candidateToParada(candidate: NearbyStopCandidate): Parada {
  return {
    parada_id: candidate.paradaId ?? candidate.stopId,
    nombre: candidate.name,
    lat: candidate.lat,
    lng: candidate.lng,
    tiene_techo: null,
    accesible: null,
  };
}

function legStopDistanceMeters(leg: Leg) {
  if (
    typeof leg.from.lat !== 'number' ||
    typeof leg.from.lon !== 'number' ||
    typeof leg.to.lat !== 'number' ||
    typeof leg.to.lon !== 'number'
  ) {
    return 0;
  }

  return haversineMeters({ lat: leg.from.lat, lng: leg.from.lon }, { lat: leg.to.lat, lng: leg.to.lon });
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function findMatchingTimetableRoute(params: {
  timetable: Timetable;
  leg: VehicleLeg;
}): TimetableRoute | null {
  const candidateRoutes = params.timetable.routesPassingThrough(params.leg.from.id);

  for (const route of candidateRoutes) {
    const fromIndices = route.stopRouteIndices(params.leg.from.id);
    const toIndices = route.stopRouteIndices(params.leg.to.id);

    for (const fromIndex of fromIndices) {
      for (const toIndex of toIndices) {
        if (toIndex <= fromIndex) continue;

        for (let tripIndex = 0; tripIndex < route.getNbTrips(); tripIndex += 1) {
          if (
            route.departureFrom(fromIndex, tripIndex) === params.leg.departureTime &&
            route.arrivalAt(toIndex, tripIndex) === params.leg.arrivalTime
          ) {
            return route;
          }
        }
      }
    }
  }

  return null;
}

function fallbackDirectoryEntry(
  metadata: SnapshotMetadata,
  leg: VehicleLeg,
): ServiceRouteDirectoryEntry | null {
  const entries = Object.values(metadata.service_route_directory);
  const byName = entries.filter((entry) => entry.route_name === leg.route.name);
  return byName[0] ?? null;
}

function directoryEntryForLeg(params: {
  metadata: SnapshotMetadata;
  timetable: Timetable;
  leg: VehicleLeg;
}): ServiceRouteDirectoryEntry | null {
  const timetableRoute = findMatchingTimetableRoute({ timetable: params.timetable, leg: params.leg });
  if (timetableRoute) {
    const serviceRouteId = String(timetableRoute.serviceRoute());
    const entry = params.metadata.service_route_directory[serviceRouteId];
    if (entry) {
      return entry;
    }
  }

  return fallbackDirectoryEntry(params.metadata, params.leg);
}

function toJourneyLeg(params: {
  metadata: SnapshotMetadata;
  timetable: Timetable;
  leg: VehicleLeg;
}): JourneyLeg {
  const entry = directoryEntryForLeg(params);

  return {
    routeId: entry?.ruta_id ?? 0,
    routeName: entry?.route_name ?? params.leg.route.name,
    routeCode: entry?.pattern_code ?? null,
    operator: 'RAPTOR local',
    direction: entry?.pattern_name ?? null,
    boardStopId: Number(params.leg.from.sourceStopId ?? params.leg.from.id),
    boardStopName: params.leg.from.name,
    alightStopId: Number(params.leg.to.sourceStopId ?? params.leg.to.id),
    alightStopName: params.leg.to.name,
    boardStop: stopToParada(params.leg.from),
    alightStop: stopToParada(params.leg.to),
    scheduledWaitMinutes: null,
    scheduledFrequencyMinutes: null,
  };
}

function makeTransferLabel(legs: JourneyLeg[]) {
  if (legs.length < 2) {
    return null;
  }

  const firstTransferStop = legs[0]?.alightStopName ?? legs[1]?.boardStopName;
  return firstTransferStop ? `Transbordo en ${firstTransferStop}` : 'Transbordo';
}

function routeWalkBreakdown(legs: Leg[]) {
  const firstVehicleIndex = legs.findIndex(isVehicleLeg);
  let lastVehicleIndex = -1;

  for (const [index, leg] of legs.entries()) {
    if (isVehicleLeg(leg)) {
      lastVehicleIndex = index;
    }
  }

  return legs.reduce(
    (walk, leg, index) => {
      if (isVehicleLeg(leg)) return walk;

      const meters = legStopDistanceMeters(leg);
      if (firstVehicleIndex !== -1 && index < firstVehicleIndex) {
        walk.origin += meters;
      } else if (lastVehicleIndex !== -1 && index > lastVehicleIndex) {
        walk.destination += meters;
      } else {
        walk.transfer += meters;
      }
      return walk;
    },
    { destination: 0, origin: 0, transfer: 0 },
  );
}

function journeySignature(journey: PlannedJourney) {
  const routePart = journey.routeIds.join(',');
  const stopPart = journey.legs
    .map((leg) => `${leg.boardStopId ?? ''}-${leg.alightStopId ?? ''}`)
    .join(',');
  return `${routePart}|${stopPart}|${Math.round(journey.totalWalkMeters)}`;
}

export function plannedJourneySignature(journey: PlannedJourney) {
  return journeySignature(journey);
}

export function mapRaptorResultToJourney(params: {
  result: Result;
  timetable: Timetable;
  metadata: SnapshotMetadata;
  context: RaptorJourneyContext;
}): PlannedJourney | null {
  const route = params.result.bestRoute(params.context.toCandidate.stopId);
  if (!route) {
    return null;
  }

  return mapRaptorRouteToJourney({
    route,
    timetable: params.timetable,
    metadata: params.metadata,
    context: params.context,
  });
}

export function mapRaptorRouteToJourney(params: {
  route: PublicRoute;
  timetable: Timetable;
  metadata: SnapshotMetadata;
  context: RaptorJourneyContext;
}): PlannedJourney | null {
  const vehicleLegs = params.route.legs.filter(isVehicleLeg);
  if (vehicleLegs.length === 0) {
    return null;
  }

  const journeyLegs = vehicleLegs.map((leg) =>
    toJourneyLeg({
      metadata: params.metadata,
      timetable: params.timetable,
      leg,
    }),
  );

  const routeIds = unique(journeyLegs.map((leg) => leg.routeId).filter((routeId) => routeId > 0));
  const routeCodes = unique(journeyLegs.map((leg) => leg.routeCode).filter((code): code is string => Boolean(code)));
  const routeNames = unique(journeyLegs.map((leg) => leg.routeName).filter((name): name is string => Boolean(name)));
  const routeWalk = routeWalkBreakdown(params.route.legs);
  const transferWalkMeters = routeWalk.transfer;
  const originWalkMeters = params.context.fromCandidate.distanceMeters + routeWalk.origin;
  const destinationWalkMeters = params.context.toCandidate.distanceMeters + routeWalk.destination;
  const totalWalkMeters = originWalkMeters + destinationWalkMeters + transferWalkMeters;
  const totalDuration = Math.max(0, params.route.totalDuration());
  const totalWaitPenalty = Math.max(0, params.route.departureTime() - params.context.departureMinutes);
  const score =
    totalDuration +
    totalWaitPenalty * 0.25 +
    totalWalkMeters / WALK_SCORE_METERS_PER_POINT +
    (journeyLegs.length - 1) * 12;
  const firstLeg = journeyLegs[0];
  const finalLeg = journeyLegs.at(-1);

  if (!firstLeg || !finalLeg) {
    return null;
  }

  return {
    id: [
      'raptor',
      params.metadata.version,
      params.context.diaTipo,
      params.context.fromCandidate.stopId,
      params.context.toCandidate.stopId,
      routeIds.join('-') || routeNames.join('-'),
      params.route.departureTime(),
      params.route.arrivalTime(),
    ].join(':'),
    kind: journeyLegs.length > 1 ? 'transfer' : 'direct',
    routeId: routeIds[0] ?? firstLeg.routeId,
    routeName: routeNames.length > 0 ? routeNames.join(' luego ') : vehicleLegs[0]?.route.name ?? null,
    routeCode: routeCodes.length > 0 ? routeCodes.join(' + ') : null,
    operatorLabel: 'RAPTOR local',
    routeIds,
    routeCodes,
    legs: journeyLegs,
    originWalkMeters,
    destinationWalkMeters,
    transferWalkMeters,
    totalWalkMeters,
    totalFare: null,
    score,
    boardStopName: firstLeg.boardStopName ?? params.context.fromCandidate.name,
    dropStopName: finalLeg.alightStopName ?? params.context.toCandidate.name,
    transferLabel: makeTransferLabel(journeyLegs),
    geoMetrics: {
      baseScore: totalDuration,
      scoreAdjustment: score - totalDuration,
      confidenceScore: null,
      qualityFlags: [],
      straightLineMeters: null,
      originWalkMeters,
      transferWalkMeters,
      finalWalkMeters: destinationWalkMeters,
      totalWalkMeters,
      firstLegDestinationDistanceMeters: null,
      finalStopDestinationDistanceMeters: destinationWalkMeters,
      firstLegProgressMeters: null,
      firstLegProgressRatio: null,
      finalStopProgressMeters: null,
      finalStopProgressRatio: null,
      firstLegBacktrackMeters: null,
      finalStopBacktrackMeters: null,
      transferGainMeters: null,
      transferGainRatio: null,
      totalWalkRatio: null,
      transferWalkRatio: null,
      boardShapeDistanceMeters: null,
      firstAlightShapeDistanceMeters: null,
      secondBoardShapeDistanceMeters: null,
      finalAlightShapeDistanceMeters: null,
      maxShapeStopDistanceMeters: null,
      routeDestinationAlignment: null,
      transferQualityLabel: null,
      transferQualityScore: null,
      finalWalkStraightMeters: destinationWalkMeters,
      finalWalkNetworkMeters: null,
      finalWalkNetworkMinutes: null,
      walkDetourRatio: null,
      walkRouteAvailable: null,
      walkNetworkPenalty: null,
      walkNetworkStatus: null,
      finalWalkBacktrackDot: null,
      finalWalkBacktrackPenalty: null,
      finalWalkStartsAgainstBus: null,
      finalWalkRouteCoordinates: null,
    },
  };
}

export function makeEndpointLegs(params: {
  origin: NearbyStopCandidate;
  destination: NearbyStopCandidate;
}) {
  return {
    boardStop: candidateToParada(params.origin),
    alightStop: candidateToParada(params.destination),
  };
}
