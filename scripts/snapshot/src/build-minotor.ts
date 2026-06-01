import { StopsIndex, Timetable } from 'minotor';
import type { Stop } from 'minotor';
// HACK: minotor@11.2.2 root exports the public routing Route, not the timetable Route factory.
// Wave 0.1 documented this as a subpath-export caveat; this generator is local-only and runs under tsx.
import { Route } from '../node_modules/minotor/src/timetable/route.ts';

import type {
  DiaTipo,
  ExpandedTrip,
  LinearizedSubPatternWithRows,
  RawParadaRow,
  RawRoutePatternRow,
  RawTransferEdgeRow,
} from './types.ts';

type MinotorTransfer = {
  destination: number;
  type: 'RECOMMENDED' | 'GUARANTEED' | 'REQUIRES_MINIMAL_TIME' | 'IN_SEAT';
  minTransferTime?: number;
};

type StopAdjacency = {
  transfers?: MinotorTransfer[];
  routes: number[];
};

type ServiceRoute = {
  type: 'BUS';
  name: string;
  routes: number[];
};

type TransferEntry = {
  transfer: MinotorTransfer;
  source: 'real' | 'synthetic';
};

export type VerifyPair = {
  dia_tipo: DiaTipo;
  from_stop_id: number;
  to_stop_id: number;
  from_parada_id: number;
  to_parada_id: number;
  route_id: number;
};

export type MinotorBuildResult = {
  blobs: Map<string, Uint8Array>;
  stopIdByParadaId: Map<number, number>;
  paradaIdByStopId: number[];
  verifyPairs: VerifyPair[];
  diagnostics: {
    stopCount: number;
    routeCount: number;
    transferCount: number;
    realTransferCount: number;
    syntheticTransferCount: number;
    realWinningOnConflict: number;
    discardedTransfers: number;
    expandedTripsPerDiaTipo: Record<DiaTipo, number>;
  };
};

const DIA_TIPOS: DiaTipo[] = ['habil', 'sabado', 'domingo', 'feriado'];

function uniqSorted(values: Iterable<number>): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function groupTripsByRouteId(trips: ExpandedTrip[]): Map<number, ExpandedTrip[]> {
  const groups = new Map<number, ExpandedTrip[]>();

  for (const trip of trips) {
    const current = groups.get(trip.routeId) ?? [];
    current.push(trip);
    groups.set(trip.routeId, current);
  }

  return groups;
}

function cloneBaseAdjacency(base: StopAdjacency[]): StopAdjacency[] {
  return base.map((entry) => ({
    routes: [],
    transfers: entry.transfers ? entry.transfers.map((transfer) => ({ ...transfer })) : undefined,
  }));
}

function makeStopIdMaps(linearized: LinearizedSubPatternWithRows[], transfers: RawTransferEdgeRow[]) {
  const routeStopIds = linearized.flatMap((subPattern) => subPattern.stops);
  const transferStopIds = transfers.flatMap((edge) => [edge.from_parada_id, edge.to_parada_id]).filter((id): id is number => id != null);
  const paradaIdByStopId = uniqSorted([...routeStopIds, ...transferStopIds]);
  const stopIdByParadaId = new Map(paradaIdByStopId.map((paradaId, stopId) => [paradaId, stopId]));

  return { paradaIdByStopId, stopIdByParadaId };
}

function makeStops(paradas: RawParadaRow[], paradaIdByStopId: number[]): Stop[] {
  const paradaById = new Map(paradas.map((parada) => [parada.id, parada]));

  return paradaIdByStopId.map((paradaId, stopId) => {
    const parada = paradaById.get(paradaId);
    return {
      id: stopId,
      sourceStopId: String(paradaId),
      name: parada?.nombre ?? `Parada ${paradaId}`,
      lat: parada?.lat,
      lon: parada?.lng,
      children: [],
      locationType: 'SIMPLE_STOP_OR_PLATFORM',
    };
  });
}

function makeTransferAdjacency(
  stopCount: number,
  transfers: RawTransferEdgeRow[],
  stopIdByParadaId: Map<number, number>,
): {
  adjacency: StopAdjacency[];
  transferCount: number;
  realTransferCount: number;
  syntheticTransferCount: number;
  realWinningOnConflict: number;
  discardedTransfers: number;
} {
  const transferByKey = new Map<string, TransferEntry>();
  let discardedTransfers = 0;
  let realWinningOnConflict = 0;

  for (const edge of transfers) {
    const from = edge.from_parada_id == null ? undefined : stopIdByParadaId.get(edge.from_parada_id);
    const to = edge.to_parada_id == null ? undefined : stopIdByParadaId.get(edge.to_parada_id);

    if (from == null || to == null || from === to) {
      discardedTransfers += 1;
      continue;
    }

    const key = `${from}:${to}`;
    const minTransferTime = Math.max(1, Math.round(edge.walk_time_min));
    const existing = transferByKey.get(key);
    const source = edge.source === 'auto_synthesized' ? 'synthetic' : 'real';
    const transfer: MinotorTransfer = {
      destination: to,
      type: edge.transfer_type === 'same_macro' ? 'RECOMMENDED' : 'REQUIRES_MINIMAL_TIME',
      // Minotor v11 Duration is minutes, despite earlier Wave 0 notes saying seconds.
      minTransferTime,
    };

    if (!existing) {
      transferByKey.set(key, { transfer, source });
      continue;
    }

    if (existing.source === 'real' && source === 'synthetic') {
      realWinningOnConflict += 1;
      continue;
    }

    if (existing.source === 'synthetic' && source === 'real') {
      transferByKey.set(key, { transfer, source });
      realWinningOnConflict += 1;
      continue;
    }

    if ((existing.transfer.minTransferTime ?? Number.POSITIVE_INFINITY) > minTransferTime) {
      transferByKey.set(key, { transfer, source });
    }
  }

  const adjacency: StopAdjacency[] = Array.from({ length: stopCount }, () => ({ routes: [] }));
  let realTransferCount = 0;
  let syntheticTransferCount = 0;

  for (const [key, entry] of transferByKey.entries()) {
    const [from] = key.split(':').map((value) => Number(value));
    const transfersForStop = adjacency[from].transfers ?? [];
    transfersForStop.push(entry.transfer);
    adjacency[from].transfers = transfersForStop;

    if (entry.source === 'real') {
      realTransferCount += 1;
    } else {
      syntheticTransferCount += 1;
    }
  }

  return {
    adjacency,
    transferCount: transferByKey.size,
    realTransferCount,
    syntheticTransferCount,
    realWinningOnConflict,
    discardedTransfers,
  };
}

function makeRouteName(
  subPattern: LinearizedSubPatternWithRows,
  routePatternById: Map<number, RawRoutePatternRow>,
): string {
  const pattern = routePatternById.get(subPattern.pattern_id);
  return pattern?.route_name ?? pattern?.pattern_name ?? `Pattern ${subPattern.pattern_id}`;
}

function makeVerifyPair(diaTipo: DiaTipo, route: Route, originalRouteId: number, paradaIdByStopId: number[]): VerifyPair | null {
  if (route.getNbStops() < 2 || route.getNbTrips() < 1) {
    return null;
  }

  const fromStopId = route.stopId(0);
  const toStopId = route.stopId(route.getNbStops() - 1);
  const fromParadaId = paradaIdByStopId[fromStopId];
  const toParadaId = paradaIdByStopId[toStopId];

  if (fromParadaId == null || toParadaId == null) {
    return null;
  }

  return {
    dia_tipo: diaTipo,
    from_stop_id: fromStopId,
    to_stop_id: toStopId,
    from_parada_id: fromParadaId,
    to_parada_id: toParadaId,
    route_id: originalRouteId,
  };
}

export function buildMinotorSnapshot(params: {
  paradas: RawParadaRow[];
  routePatterns: RawRoutePatternRow[];
  linearized: LinearizedSubPatternWithRows[];
  tripsByDiaTipo: Map<DiaTipo, ExpandedTrip[]>;
  transferEdges: RawTransferEdgeRow[];
}): MinotorBuildResult {
  const routePatternById = new Map(params.routePatterns.map((pattern) => [pattern.pattern_id, pattern]));
  const { paradaIdByStopId, stopIdByParadaId } = makeStopIdMaps(params.linearized, params.transferEdges);
  const stops = makeStops(params.paradas, paradaIdByStopId);
  const stopsIndex = new StopsIndex(stops);
  const {
    adjacency: baseAdjacency,
    transferCount,
    realTransferCount,
    syntheticTransferCount,
    realWinningOnConflict,
    discardedTransfers,
  } = makeTransferAdjacency(stops.length, params.transferEdges, stopIdByParadaId);
  const blobs = new Map<string, Uint8Array>([['stops', stopsIndex.serialize()]]);
  const expandedTripsPerDiaTipo: Record<DiaTipo, number> = {
    habil: 0,
    sabado: 0,
    domingo: 0,
    feriado: 0,
  };
  const verifyPairs: VerifyPair[] = [];
  let totalRoutes = 0;

  for (const diaTipo of DIA_TIPOS) {
    const dayTrips = params.tripsByDiaTipo.get(diaTipo) ?? [];
    const tripsByRouteId = groupTripsByRouteId(dayTrips);
    const adjacency = cloneBaseAdjacency(baseAdjacency);
    const minotorRoutes: Route[] = [];
    const serviceRouteById = new Map<number, ServiceRoute>();

    for (const [originalRouteId, routeTrips] of tripsByRouteId.entries()) {
      const routeId = minotorRoutes.length;
      const firstTrip = routeTrips[0];
      if (!firstTrip) continue;

      const minotorTrips = routeTrips.map((trip) => ({
        stops: trip.stops.map((stop) => {
          const denseStopId = stopIdByParadaId.get(stop.stopId);
          if (denseStopId == null) {
            throw new Error(`Missing dense stop ID for parada ${stop.stopId}`);
          }

          return {
            id: denseStopId,
            arrivalTime: stop.arrivalMin,
            departureTime: stop.departureMin,
            pickUpType: stop.pickupType,
            dropOffType: stop.dropOffType,
          };
        }),
      }));
      const serviceRouteId = firstTrip.serviceRouteId;
      const route = Route.of({
        id: routeId,
        serviceRouteId,
        trips: minotorTrips,
      });

      for (const stopId of route.stops) {
        adjacency[stopId].routes.push(routeId);
      }

      const serviceRoute = serviceRouteById.get(serviceRouteId) ?? {
        type: 'BUS',
        name: makeRouteName(firstTrip.subPattern, routePatternById),
        routes: [],
      };
      serviceRoute.routes.push(routeId);
      serviceRouteById.set(serviceRouteId, serviceRoute);
      minotorRoutes.push(route);

      if (verifyPairs.length < 20) {
        const pair = makeVerifyPair(diaTipo, route, originalRouteId, paradaIdByStopId);
        if (pair) verifyPairs.push(pair);
      }
    }

    const serviceRoutes = Array.from({ length: Math.max(-1, ...serviceRouteById.keys()) + 1 }, (_, serviceRouteId) => {
      return (
        serviceRouteById.get(serviceRouteId) ?? {
          type: 'BUS',
          name: `Service route ${serviceRouteId}`,
          routes: [],
        }
      );
    });
    const timetable = new Timetable(
      adjacency as ConstructorParameters<typeof Timetable>[0],
      minotorRoutes as unknown as ConstructorParameters<typeof Timetable>[1],
      serviceRoutes as unknown as ConstructorParameters<typeof Timetable>[2],
    );

    blobs.set(`tt-${diaTipo}`, timetable.serialize());
    expandedTripsPerDiaTipo[diaTipo] = dayTrips.length;
    totalRoutes += minotorRoutes.length;
  }

  return {
    blobs,
    stopIdByParadaId,
    paradaIdByStopId,
    verifyPairs,
    diagnostics: {
      stopCount: stops.length,
      routeCount: totalRoutes,
      transferCount,
      realTransferCount,
      syntheticTransferCount,
      realWinningOnConflict,
      discardedTransfers,
      expandedTripsPerDiaTipo,
    },
  };
}
