import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  Route as PublicRoute,
  StopsIndex,
  type Query,
  type RangeQuery,
  type Stop,
  type Timetable,
  type VehicleLeg,
} from 'minotor';

import {
  findJourneysWithRaptor,
  selectCandidatePairsForRouting,
  selectJourneyCandidatesForRanking,
} from '../find-journeys';
import { setSnapshotForTesting } from '../snapshot-cache';
import type { PlannedJourney } from '@/lib/journey-planner';
import type { CachedSnapshot, SnapshotMetadata } from '../types';

const stopA: Stop = {
  id: 1,
  sourceStopId: '101',
  name: 'Origen',
  lat: 9.864,
  lon: -83.919,
  children: [],
  locationType: 'SIMPLE_STOP_OR_PLATFORM',
};

const stopB: Stop = {
  id: 2,
  sourceStopId: '202',
  name: 'Destino',
  lat: 9.865,
  lon: -83.918,
  children: [],
  locationType: 'SIMPLE_STOP_OR_PLATFORM',
};

const stopC: Stop = {
  id: 3,
  sourceStopId: '303',
  name: 'Transfer',
  lat: 9.8645,
  lon: -83.9185,
  children: [],
  locationType: 'SIMPLE_STOP_OR_PLATFORM',
};

const metadata: SnapshotMetadata = {
  version: 'test-snapshot',
  generated_at: '2026-05-06T00:00:00.000Z',
  minotor_version: '11.2.2',
  generator_version: '0.1.0',
  schema_version: 1,
  scope: 'cartago',
  dia_tipos: ['habil', 'sabado', 'domingo', 'feriado'],
  byte_size: { raw: 1, gzipped: 1 },
  service_route_directory: {
    '0': {
      service_route_key: 'pattern-1',
      pattern_id: 1,
      ruta_id: 500,
      route_name: 'Cartago Test',
      pattern_name: 'Cartago Test / IDA',
      pattern_code: 'test-ida',
      categoria_operativa: 'local',
      sub_arcs: [{ sub_arc_index: 0, reason: 'linear', stop_count: 2, parada_ids: [101, 202] }],
    },
  },
};

function makeVehicleLeg(): VehicleLeg {
  return {
    from: stopA,
    to: stopB,
    route: { type: 'BUS', name: 'Cartago Test' },
    departureTime: 480,
    arrivalTime: 500,
    pickUpType: 'REGULAR',
    dropOffType: 'REGULAR',
  };
}

function makeTimetable(): Timetable {
  const timetableRoute = {
    stopRouteIndices(stopId: number) {
      if (stopId === stopA.id) return [0];
      if (stopId === stopB.id) return [1];
      return [];
    },
    getNbTrips() {
      return 1;
    },
    departureFrom(stopIndex: number) {
      return stopIndex === 0 ? 480 : 500;
    },
    arrivalAt(stopIndex: number) {
      return stopIndex === 1 ? 500 : 480;
    },
    serviceRoute() {
      return 0;
    },
  };

  return {
    routesPassingThrough() {
      return [timetableRoute];
    },
  } as unknown as Timetable;
}

function makeSnapshot(queries: Query[] = []): CachedSnapshot {
  const timetable = makeTimetable();
  const route = new PublicRoute([makeVehicleLeg()]);
  const router = {
    route(query: Query) {
      queries.push(query);
      return {
        bestRoute() {
          return route;
        },
      };
    },
  };

  return {
    metadata,
    stopsIndex: new StopsIndex([stopA, stopB]),
    timetables: new Map([['habil', timetable]]),
    routers: new Map([['habil', router as unknown as CachedSnapshot['routers'] extends Map<unknown, infer T> ? T : never]]),
  };
}

function makeTwoStopSnapshot(params: {
  fromStop: Stop;
  queries?: Query[];
  routeName: string;
  routeId?: number;
  toStop: Stop;
}): CachedSnapshot {
  const queries = params.queries ?? [];
  const routeId = params.routeId ?? 0;
  const timetableRoute = {
    stopRouteIndices(stopId: number) {
      if (stopId === params.fromStop.id) return [0];
      if (stopId === params.toStop.id) return [1];
      return [];
    },
    getNbTrips() {
      return 1;
    },
    departureFrom(stopIndex: number) {
      return stopIndex === 0 ? 480 : 500;
    },
    arrivalAt(stopIndex: number) {
      return stopIndex === 1 ? 500 : 480;
    },
    serviceRoute() {
      return routeId;
    },
  };
  const timetable = {
    routesPassingThrough() {
      return [timetableRoute];
    },
  } as unknown as Timetable;
  const route = new PublicRoute([
    {
      from: params.fromStop,
      to: params.toStop,
      route: { type: 'BUS', name: params.routeName },
      departureTime: 480,
      arrivalTime: 500,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
  ]);
  const router = {
    route(query: Query) {
      queries.push(query);
      return {
        bestRoute() {
          return route;
        },
      };
    },
  };
  const fromParadaId = Number(params.fromStop.sourceStopId);
  const toParadaId = Number(params.toStop.sourceStopId);

  return {
    metadata: {
      ...metadata,
      service_route_directory: {
        [String(routeId)]: directoryEntry(params.routeName, [fromParadaId, toParadaId], routeId),
      },
    },
    stopsIndex: new StopsIndex([params.fromStop, params.toStop]),
    timetables: new Map([['habil', timetable]]),
    routers: new Map([['habil', router as unknown as CachedSnapshot['routers'] extends Map<unknown, infer T> ? T : never]]),
  };
}

function makeDirectAndTransferSnapshot(queries: Query[] = []): CachedSnapshot {
  const directRouteName = 'LOAIZA - CARTAGO';
  const transferRouteName = 'PENAS BLANCAS - CARTAGO';
  const directRoute = new PublicRoute([
    {
      from: stopA,
      to: stopB,
      route: { type: 'BUS', name: directRouteName },
      departureTime: 480,
      arrivalTime: 530,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
  ]);
  const transferRoute = new PublicRoute([
    {
      from: stopA,
      to: stopC,
      route: { type: 'BUS', name: directRouteName },
      departureTime: 480,
      arrivalTime: 500,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
    { from: stopC, to: stopC, type: 'REQUIRES_MINIMAL_TIME', minTransferTime: 3 },
    {
      from: stopC,
      to: stopB,
      route: { type: 'BUS', name: transferRouteName },
      departureTime: 503,
      arrivalTime: 520,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
  ]);
  const router = {
    route(query: Query) {
      queries.push(query);
      return {
        bestRoute() {
          return (query as unknown as { options?: { maxTransfers?: number } }).options?.maxTransfers === 0
            ? directRoute
            : transferRoute;
        },
      };
    },
  };

  return {
    metadata: {
      ...metadata,
      service_route_directory: {
        '81': directoryEntry(transferRouteName, [101, 303, 202], 81),
        '83': directoryEntry(directRouteName, [101, 202], 83),
      },
    },
    stopsIndex: new StopsIndex([stopA, stopB, stopC]),
    timetables: new Map([['habil', { routesPassingThrough: () => [] } as unknown as Timetable]]),
    routers: new Map([['habil', router as unknown as CachedSnapshot['routers'] extends Map<unknown, infer T> ? T : never]]),
  };
}

function makeBroadCandidateSnapshot(params: {
  destination: { lat: number; lng: number };
  origin: { lat: number; lng: number };
  queries: Query[];
}): CachedSnapshot {
  const originStops = Array.from({ length: 24 }, (_, index) =>
    stopNear({
      id: 10_000 + index,
      sourceStopId: 10_000 + index,
      name: `Origin candidate ${index + 1}`,
      origin: params.origin,
      eastMeters: index * 10,
    }),
  );
  const destinationStops = Array.from({ length: 24 }, (_, index) =>
    stopNear({
      id: 20_000 + index,
      sourceStopId: 20_000 + index,
      name: `Destination candidate ${index + 1}`,
      origin: params.destination,
      eastMeters: index * 10,
    }),
  );
  const router = {
    route(query: Query) {
      params.queries.push(query);
      return {
        bestRoute() {
          return null;
        },
      };
    },
  };

  return {
    metadata,
    stopsIndex: new StopsIndex([...originStops, ...destinationStops]),
    timetables: new Map([['habil', { routesPassingThrough: () => [] } as unknown as Timetable]]),
    routers: new Map([['habil', router as unknown as CachedSnapshot['routers'] extends Map<unknown, infer T> ? T : never]]),
  };
}

function makeShortUrbanRangeAlternativeSnapshot(params: {
  queries?: Query[];
  rangeQueries?: RangeQuery[];
} = {}): CachedSnapshot {
  const queries = params.queries ?? [];
  const rangeQueries = params.rangeQueries ?? [];
  const origin = { lat: 9.864, lng: -83.919 };
  const downstreamStop = stopNear({
    id: 3,
    sourceStopId: 303,
    name: 'Downstream board',
    origin,
    eastMeters: 220,
  });
  const destinationStop = stopNear({
    id: 2,
    sourceStopId: 202,
    name: 'Destination',
    origin,
    eastMeters: 360,
  });
  const accessRoute = new PublicRoute([
    {
      from: stopA,
      to: downstreamStop,
      duration: 3,
    },
    {
      from: downstreamStop,
      to: destinationStop,
      route: { type: 'BUS', name: 'Cartago Test' },
      departureTime: 483,
      arrivalTime: 490,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
  ]);
  const directRoute = new PublicRoute([
    {
      from: stopA,
      to: destinationStop,
      route: { type: 'BUS', name: 'Cartago Test' },
      departureTime: 488,
      arrivalTime: 493,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
  ]);
  const timetableRoute = {
    stopRouteIndices(stopId: number) {
      if (stopId === stopA.id) return [0];
      if (stopId === downstreamStop.id) return [1];
      if (stopId === destinationStop.id) return [2];
      return [];
    },
    getNbTrips() {
      return 1;
    },
    departureFrom(stopIndex: number) {
      return [488, 483, 493][stopIndex] ?? 0;
    },
    arrivalAt(stopIndex: number) {
      return [488, 483, 493][stopIndex] ?? 0;
    },
    serviceRoute() {
      return 0;
    },
  };
  const router = {
    route(query: Query) {
      queries.push(query);
      return {
        bestRoute() {
          return accessRoute;
        },
      };
    },
    rangeRoute(query: RangeQuery) {
      rangeQueries.push(query);
      return {
        getRoutes() {
          return [directRoute];
        },
      };
    },
  };

  return {
    metadata: {
      ...metadata,
      service_route_directory: {
        '0': directoryEntry('Cartago Test', [101, 303, 202], 0),
      },
    },
    stopsIndex: new StopsIndex([stopA, downstreamStop, destinationStop]),
    timetables: new Map([['habil', { routesPassingThrough: () => [timetableRoute] } as unknown as Timetable]]),
    routers: new Map([['habil', router as unknown as CachedSnapshot['routers'] extends Map<unknown, infer T> ? T : never]]),
  };
}

function makeLlanosRangeAlternativeSnapshot(params: {
  queries?: Query[];
  rangeQueries?: RangeQuery[];
} = {}): CachedSnapshot {
  const queries = params.queries ?? [];
  const rangeQueries = params.rangeQueries ?? [];
  const origin = { lat: 9.87829, lng: -83.9389683 };
  const llanos = { lat: 9.8421571, lng: -83.8829415 };
  const casaPatosStop = stopNear({
    id: 501,
    sourceStopId: -501,
    name: 'DIAGONAL A LA CASA DE LOS PATOS',
    origin,
    eastMeters: 120,
  });
  const llanosStop = stopNear({
    id: 962,
    sourceStopId: -962,
    name: 'TERMINAL SANTA LUCIA',
    origin: llanos,
    eastMeters: 220,
  });
  const llanosRoute = new PublicRoute([
    {
      from: casaPatosStop,
      to: llanosStop,
      route: { type: 'BUS', name: 'CARTAGO - LLANOS DE SANTA LUCIA' },
      departureTime: 500,
      arrivalTime: 535,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
  ]);
  const timetableRoute = {
    stopRouteIndices(stopId: number) {
      if (stopId === casaPatosStop.id) return [0];
      if (stopId === llanosStop.id) return [1];
      return [];
    },
    getNbTrips() {
      return 1;
    },
    departureFrom(stopIndex: number) {
      return stopIndex === 0 ? 500 : 535;
    },
    arrivalAt(stopIndex: number) {
      return stopIndex === 1 ? 535 : 500;
    },
    serviceRoute() {
      return 962;
    },
  };
  const router = {
    route(query: Query) {
      queries.push(query);
      return {
        bestRoute() {
          return null;
        },
      };
    },
    rangeRoute(query: RangeQuery) {
      rangeQueries.push(query);
      return {
        getRoutes() {
          return [llanosRoute];
        },
      };
    },
  };

  return {
    metadata: {
      ...metadata,
      service_route_directory: {
        '962': directoryEntry('CARTAGO - LLANOS DE SANTA LUCIA', [-501, -962], 962),
      },
    },
    stopsIndex: new StopsIndex([casaPatosStop, llanosStop]),
    timetables: new Map([['habil', { routesPassingThrough: () => [timetableRoute] } as unknown as Timetable]]),
    routers: new Map([['habil', router as unknown as CachedSnapshot['routers'] extends Map<unknown, infer T> ? T : never]]),
  };
}

function makeParaisoRangeAlternativeSnapshot(params: {
  queries?: Query[];
  rangeQueries?: RangeQuery[];
} = {}): CachedSnapshot {
  const queries = params.queries ?? [];
  const rangeQueries = params.rangeQueries ?? [];
  const origin = { lat: 9.87829, lng: -83.9389683 };
  const paraiso = { lat: 9.838231, lng: -83.865581 };
  const casaPatosStop = stopNear({
    id: 501,
    sourceStopId: -501,
    name: 'DIAGONAL A LA CASA DE LOS PATOS',
    origin,
    eastMeters: 120,
  });
  const paraisoStop = stopNear({
    id: 725,
    sourceStopId: -725,
    name: 'TERMINAL COOPEPAR PARAISO',
    origin: paraiso,
    eastMeters: 120,
  });
  const paraisoRoute = new PublicRoute([
    {
      from: casaPatosStop,
      to: paraisoStop,
      route: { type: 'BUS', name: 'CARTAGO - PARAISO' },
      departureTime: 500,
      arrivalTime: 535,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
  ]);
  const timetableRoute = {
    stopRouteIndices(stopId: number) {
      if (stopId === casaPatosStop.id) return [0];
      if (stopId === paraisoStop.id) return [1];
      return [];
    },
    getNbTrips() {
      return 1;
    },
    departureFrom(stopIndex: number) {
      return stopIndex === 0 ? 500 : 535;
    },
    arrivalAt(stopIndex: number) {
      return stopIndex === 1 ? 535 : 500;
    },
    serviceRoute() {
      return 725;
    },
  };
  const router = {
    route(query: Query) {
      queries.push(query);
      return {
        bestRoute() {
          return null;
        },
      };
    },
    rangeRoute(query: RangeQuery) {
      rangeQueries.push(query);
      return {
        getRoutes() {
          return [paraisoRoute];
        },
      };
    },
  };

  return {
    metadata: {
      ...metadata,
      service_route_directory: {
        '725': directoryEntry('CARTAGO - PARAISO', [-501, -725], 725),
      },
    },
    stopsIndex: new StopsIndex([casaPatosStop, paraisoStop]),
    timetables: new Map([['habil', { routesPassingThrough: () => [timetableRoute] } as unknown as Timetable]]),
    routers: new Map([['habil', router as unknown as CachedSnapshot['routers'] extends Map<unknown, infer T> ? T : never]]),
  };
}

function makeQuircotLoopStartRangeSnapshot(params: {
  queries?: Query[];
  rangeQueries?: RangeQuery[];
} = {}): CachedSnapshot {
  const queries = params.queries ?? [];
  const rangeQueries = params.rangeQueries ?? [];
  const origin = { lat: 9.864429, lng: -83.919373 };
  const destination = { lat: 9.882739067077637, lng: -83.93372344970703 };
  const fillerStops = Array.from({ length: 10 }, (_, index) =>
    stopNear({
      id: 100 + index,
      sourceStopId: 1100 + index,
      name: `Centro filler ${index + 1}`,
      origin,
      eastMeters: index * 35,
    }),
  );
  const badLoopStop = stopNear({
    id: 210,
    sourceStopId: 201,
    name: 'Loop stop after target',
    origin,
    eastMeters: 390,
  });
  const loopStartStop = stopNear({
    id: 200,
    sourceStopId: 200,
    name: 'Terminal Taras Loop Start',
    origin,
    eastMeters: 550,
  });
  const destinationStop: Stop = {
    id: 202,
    sourceStopId: '202',
    name: 'DESPUES DE LA FERRETERIA QUIRCOT',
    lat: destination.lat,
    lon: destination.lng,
    children: [],
    locationType: 'SIMPLE_STOP_OR_PLATFORM',
  };
  const routeName = 'CARTAGO - EL CARMEN - QUIRCOT - COOPERROSALES';
  const loopRoute = new PublicRoute([
    {
      from: loopStartStop,
      to: destinationStop,
      route: { type: 'BUS', name: routeName },
      departureTime: 500,
      arrivalTime: 526,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
  ]);
  const timetableRoute = {
    stopRouteIndices(stopId: number) {
      if (stopId === loopStartStop.id) return [0];
      if (stopId === badLoopStop.id) return [1];
      if (stopId === destinationStop.id) return [2];
      return [];
    },
    getNbTrips() {
      return 1;
    },
    departureFrom(stopIndex: number) {
      return [500, 510, 526][stopIndex] ?? 0;
    },
    arrivalAt(stopIndex: number) {
      return [500, 510, 526][stopIndex] ?? 0;
    },
    serviceRoute() {
      return 900;
    },
  };
  const router = {
    route(query: Query) {
      queries.push(query);
      return {
        bestRoute() {
          return null;
        },
      };
    },
    rangeRoute(query: RangeQuery) {
      rangeQueries.push(query);
      return {
        getRoutes() {
          return query.from === loopStartStop.id ? [loopRoute] : [];
        },
      };
    },
  };

  return {
    metadata: {
      ...metadata,
      service_route_directory: {
        '900': directoryEntry(routeName, [200, 201, 202], 900),
      },
    },
    stopsIndex: new StopsIndex([...fillerStops, badLoopStop, loopStartStop, destinationStop]),
    timetables: new Map([['habil', { routesPassingThrough: () => [timetableRoute] } as unknown as Timetable]]),
    routers: new Map([['habil', router as unknown as CachedSnapshot['routers'] extends Map<unknown, infer T> ? T : never]]),
  };
}

function makeTarasParaisoTerminalSynthesisSnapshot(
  queries: Query[] = [],
  options: {
    branchRouteName?: string;
    destination?: { lat: number; lng: number };
    destinationStopName?: string;
  } = {},
): CachedSnapshot {
  const origin = { lat: 9.87829, lng: -83.9389683 };
  const destination = options.destination ?? { lat: 9.8392523, lng: -83.8664324 };
  const branchRouteName = options.branchRouteName ?? 'CARTAGO - PARAISO';
  const casaPatosStop = stopNear({
    id: 501,
    sourceStopId: -501,
    name: 'DIAGONAL A LA CASA DE LOS PATOS',
    origin,
    eastMeters: 100,
  });
  const sodaCarlaStop = stopNear({
    id: 502,
    sourceStopId: -502,
    name: 'FRENTE A SODA CARLA',
    origin,
    eastMeters: 420,
  });
  const plazaIglesiasStop: Stop = {
    id: 852,
    sourceStopId: '852',
    name: 'Parada Plaza Iglesias',
    lat: 9.862515,
    lon: -83.921168,
    children: [],
    locationType: 'SIMPLE_STOP_OR_PLATFORM',
  };
  const dulceNombreStop: Stop = {
    id: 138,
    sourceStopId: '138',
    name: 'Cartago - Dulce Nombre',
    lat: 9.862557,
    lon: -83.918789,
    children: [],
    locationType: 'SIMPLE_STOP_OR_PLATFORM',
  };
  const paraisoStop = stopNear({
    id: 725,
    sourceStopId: -725,
    name: options.destinationStopName ?? 'EN LA ENTRADA DE CASA BLANCA, FRENTE A GOLLO TIENDA',
    origin: destination,
    eastMeters: 40,
  });
  const walkingTransfer = { from: plazaIglesiasStop, to: dulceNombreStop, duration: 7 };
  const cachiTerminalRoute = new PublicRoute([
    {
      from: casaPatosStop,
      to: plazaIglesiasStop,
      route: { type: 'BUS', name: 'CARTAGO - TARAS - SAN NICOLAS' },
      departureTime: 500,
      arrivalTime: 520,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
    walkingTransfer,
    {
      from: dulceNombreStop,
      to: paraisoStop,
      route: { type: 'BUS', name: 'CARTAGO - CACHI' },
      departureTime: 530,
      arrivalTime: 560,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
  ]);
  const laAngelinaParaisoRoute = new PublicRoute([
    {
      from: sodaCarlaStop,
      to: plazaIglesiasStop,
      route: { type: 'BUS', name: 'LA ANGELINA - CARTAGO' },
      departureTime: 500,
      arrivalTime: 520,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
    walkingTransfer,
    {
      from: dulceNombreStop,
      to: paraisoStop,
      route: { type: 'BUS', name: branchRouteName },
      departureTime: 530,
      arrivalTime: 560,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
  ]);
  const router = {
    route(query: Query) {
      queries.push(query);
      return {
        bestRoute() {
          if ((query as unknown as { options?: { maxTransfers?: number } }).options?.maxTransfers === 0) {
            return null;
          }
          if (query.from === casaPatosStop.id) return cachiTerminalRoute;
          if (query.from === sodaCarlaStop.id) return laAngelinaParaisoRoute;
          return null;
        },
      };
    },
  };

  return {
    metadata: {
      ...metadata,
      service_route_directory: {
        '501': directoryEntry('CARTAGO - TARAS - SAN NICOLAS', [-501, 852], 501),
        '502': directoryEntry('LA ANGELINA - CARTAGO', [-502, 852], 502),
        '725': directoryEntry(branchRouteName, [138, -725], 725),
        '726': directoryEntry('CARTAGO - CACHI', [138, -725], 726),
      },
    },
    stopsIndex: new StopsIndex([
      casaPatosStop,
      sodaCarlaStop,
      plazaIglesiasStop,
      dulceNombreStop,
      paraisoStop,
    ]),
    timetables: new Map([['habil', { routesPassingThrough: () => [] } as unknown as Timetable]]),
    routers: new Map([['habil', router as unknown as CachedSnapshot['routers'] extends Map<unknown, infer T> ? T : never]]),
  };
}

function makeTarasLlanosTerminalDirectSynthesisSnapshot(params: {
  compatibleDestinationFillers?: number;
  destinationFillers?: number;
  queries?: Query[];
  rangeQueries?: RangeQuery[];
} = {}): CachedSnapshot {
  const queries = params.queries ?? [];
  const rangeQueries = params.rangeQueries ?? [];
  const origin = { lat: 9.87829, lng: -83.9389683 };
  const destination = { lat: 9.8421571, lng: -83.8829415 };
  const casaPatosStop = stopNear({
    id: 501,
    sourceStopId: -501,
    name: 'DIAGONAL A LA CASA DE LOS PATOS',
    origin,
    eastMeters: 100,
  });
  const plazaIglesiasStop: Stop = {
    id: 852,
    sourceStopId: '852',
    name: 'Parada Plaza Iglesias',
    lat: 9.862515,
    lon: -83.921168,
    children: [],
    locationType: 'SIMPLE_STOP_OR_PLATFORM',
  };
  const dulceNombreStop: Stop = {
    id: 138,
    sourceStopId: '138',
    name: 'Cartago - Dulce Nombre',
    lat: 9.862557,
    lon: -83.918789,
    children: [],
    locationType: 'SIMPLE_STOP_OR_PLATFORM',
  };
  const llanosStop = stopNear({
    id: 962,
    sourceStopId: -962,
    name: 'CONTIGUO PALI DE LLANOS DE SANTA LUCIA',
    origin: destination,
    eastMeters: 40,
  });
  const destinationFillers = Array.from({ length: params.destinationFillers ?? 0 }, (_, index) =>
    stopNear({
      id: 1_100 + index,
      sourceStopId: -1_100 - index,
      name: `Destination filler ${index + 1}`,
      origin: destination,
      eastMeters: 70 + index * 10,
    }),
  );
  const compatibleDestinationFillers = Array.from(
    { length: params.compatibleDestinationFillers ?? 0 },
    (_, index) =>
      stopNear({
        id: 1_200 + index,
        sourceStopId: -1_200 - index,
        name: `Compatible destination filler ${index + 1}`,
        origin: destination,
        eastMeters: 70 + index * 10,
      }),
  );
  const walkingTransfer = { from: plazaIglesiasStop, to: dulceNombreStop, duration: 7 };
  const cachiTerminalRoute = new PublicRoute([
    {
      from: casaPatosStop,
      to: plazaIglesiasStop,
      route: { type: 'BUS', name: 'CARTAGO - TARAS - SAN NICOLAS' },
      departureTime: 500,
      arrivalTime: 520,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
    walkingTransfer,
    {
      from: dulceNombreStop,
      to: llanosStop,
      route: { type: 'BUS', name: 'CARTAGO - CACHI' },
      departureTime: 530,
      arrivalTime: 560,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
  ]);
  const llanosTerminalRoute = new PublicRoute([
    {
      from: dulceNombreStop,
      to: llanosStop,
      route: { type: 'BUS', name: 'CARTAGO - LLANOS DE SANTA LUCIA' },
      departureTime: 540,
      arrivalTime: 575,
      pickUpType: 'REGULAR',
      dropOffType: 'REGULAR',
    },
  ]);
  const router = {
    route(query: Query) {
      queries.push(query);
      return {
        bestRoute() {
          if ((query as unknown as { options?: { maxTransfers?: number } }).options?.maxTransfers === 0) {
            return null;
          }
          if (query.from === casaPatosStop.id) return cachiTerminalRoute;
          return null;
        },
      };
    },
    rangeRoute(query: RangeQuery) {
      rangeQueries.push(query);
      return {
        getRoutes() {
          if (query.from === dulceNombreStop.id && query.to.has(llanosStop.id)) {
            return [llanosTerminalRoute];
          }
          return [];
        },
      };
    },
  };

  return {
    metadata: {
      ...metadata,
      service_route_directory: {
        '501': directoryEntry('CARTAGO - TARAS - SAN NICOLAS', [-501, 852], 501),
        '725': directoryEntry('CARTAGO - CACHI', [138, -962], 725),
        '962': directoryEntry('CARTAGO - LLANOS DE SANTA LUCIA', [138, -962], 962),
        ...Object.fromEntries(
          destinationFillers.map((stop, index) => [
            `filler-${index}`,
            directoryEntry(`DESTINATION FILLER ${index + 1}`, [Number(stop.sourceStopId)], 1_100 + index),
          ]),
        ),
        ...Object.fromEntries(
          compatibleDestinationFillers.map((stop, index) => [
            `compatible-filler-${index}`,
            directoryEntry(
              'CARTAGO - LLANOS DE SANTA LUCIA',
              [138, Number(stop.sourceStopId)],
              1_200 + index,
            ),
          ]),
        ),
      },
    },
    stopsIndex: new StopsIndex([
      casaPatosStop,
      plazaIglesiasStop,
      dulceNombreStop,
      llanosStop,
      ...destinationFillers,
      ...compatibleDestinationFillers,
    ]),
    timetables: new Map([['habil', { routesPassingThrough: () => [] } as unknown as Timetable]]),
    routers: new Map([['habil', router as unknown as CachedSnapshot['routers'] extends Map<unknown, infer T> ? T : never]]),
  };
}

function stopNear(params: {
  id: number;
  sourceStopId: number;
  name: string;
  origin: { lat: number; lng: number };
  eastMeters: number;
}): Stop {
  const metersPerLngDegree = 111_320 * Math.cos((params.origin.lat * Math.PI) / 180);
  return {
    id: params.id,
    sourceStopId: String(params.sourceStopId),
    name: params.name,
    lat: params.origin.lat,
    lon: params.origin.lng + params.eastMeters / metersPerLngDegree,
    children: [],
    locationType: 'SIMPLE_STOP_OR_PLATFORM',
  };
}

function directoryEntry(routeName: string, paradaIds: number[], patternId: number): SnapshotMetadata['service_route_directory'][string] {
  return {
    service_route_key: `pattern-${patternId}`,
    pattern_id: patternId,
    ruta_id: patternId,
    route_name: routeName,
    pattern_name: `${routeName} / IDA`,
    pattern_code: `test-${patternId}`,
    categoria_operativa: 'local',
    sub_arcs: [{ sub_arc_index: 0, reason: 'linear', stop_count: paradaIds.length, parada_ids: paradaIds }],
  };
}

function makeTerminalSanatorioSnapshot(queries: Query[] = []): CachedSnapshot {
  const terminal = { lat: 9.862138, lng: -83.923164 };
  const clusterStops = Array.from({ length: 20 }, (_, index) =>
    stopNear({
      id: index + 10,
      sourceStopId: 1000 + index,
      name: `Terminal cluster ${index + 1}`,
      origin: terminal,
      eastMeters: index * 20,
    }),
  );
  const escuelaDeSordos = stopNear({
    id: 2336,
    sourceStopId: -13676,
    name: 'AL COSTADO DE ESCUELA DE SORDOS',
    origin: terminal,
    eastMeters: 823,
  });
  const sanatorioTerminal: Stop = {
    id: 3000,
    sourceStopId: '-3000',
    name: 'TERMINAL SANATORIO DE DURAN',
    lat: 9.931869,
    lon: -83.880095,
    children: [],
    locationType: 'SIMPLE_STOP_OR_PLATFORM',
  };
  const stops = [...clusterStops, escuelaDeSordos, sanatorioTerminal];
  const serviceRouteDirectory: SnapshotMetadata['service_route_directory'] = {};

  clusterStops.forEach((stop, index) => {
    serviceRouteDirectory[String(index)] = directoryEntry(`Terminal Route ${index}`, [Number(stop.sourceStopId)], index);
  });
  serviceRouteDirectory['99'] = directoryEntry(
    'CARTAGO - TIERRA BLANCA - POTRERO CERRADO - SANATORIO',
    [-13676, -3000],
    99,
  );

  const router = {
    route(query: Query) {
      queries.push(query);
      return {
        bestRoute() {
          return null;
        },
      };
    },
  };

  return {
    metadata: {
      ...metadata,
      service_route_directory: serviceRouteDirectory,
    },
    stopsIndex: new StopsIndex(stops),
    timetables: new Map([['habil', {} as Timetable]]),
    routers: new Map([['habil', router as unknown as CachedSnapshot['routers'] extends Map<unknown, infer T> ? T : never]]),
  };
}

function makeCandidateJourney(params: {
  routeNames: string[];
  score: number;
  stopSeed: number;
  totalWalkMeters?: number;
}): PlannedJourney {
  const legs = params.routeNames.map((routeName, index) => ({
    routeId: params.stopSeed + index,
    routeName,
    routeCode: null,
    operator: 'RAPTOR local',
    boardStopId: params.stopSeed * 10 + index,
    boardStopName: `Board ${params.stopSeed}-${index}`,
    alightStopId: params.stopSeed * 10 + index + 1000,
    alightStopName: `Alight ${params.stopSeed}-${index}`,
  }));

  return {
    id: `candidate-${params.stopSeed}`,
    kind: legs.length > 1 ? 'transfer' : 'direct',
    routeId: legs[0]?.routeId ?? params.stopSeed,
    routeName: params.routeNames.join(' luego '),
    routeCode: null,
    operatorLabel: 'RAPTOR local',
    routeIds: legs.map((leg) => leg.routeId),
    routeCodes: [],
    legs,
    originWalkMeters: 20,
    destinationWalkMeters: params.totalWalkMeters ?? 20,
    transferWalkMeters: 0,
    totalWalkMeters: params.totalWalkMeters ?? 40,
    totalFare: null,
    score: params.score,
    boardStopName: legs[0]?.boardStopName ?? 'Board',
    dropStopName: legs.at(-1)?.alightStopName ?? 'Alight',
    transferLabel: legs.length > 1 ? 'Transbordo' : null,
  };
}

function makeNearbyCandidate(params: { distanceMeters: number; name: string; stopId: number }) {
  return {
    stopId: params.stopId,
    sourceStopId: String(params.stopId),
    paradaId: params.stopId,
    name: params.name,
    lat: 9.86,
    lng: -83.92,
    distanceMeters: params.distanceMeters,
  };
}

afterEach(() => {
  setSnapshotForTesting(null);
});

test('selectCandidatePairsForRouting bounds broad searches while preserving coverage and direct pairs', () => {
  const fromCandidates = Array.from({ length: 24 }, (_, index) =>
    makeNearbyCandidate({
      stopId: index + 1,
      name: `Origin ${index + 1}`,
      distanceMeters: index * 25,
    }),
  );
  const toCandidates = Array.from({ length: 24 }, (_, index) =>
    makeNearbyCandidate({
      stopId: index + 101,
      name: `Destination ${index + 1}`,
      distanceMeters: index * 25,
    }),
  );
  const routeNamesByStopId = new Map<number, ReadonlySet<string>>();
  routeNamesByStopId.set(fromCandidates[23].stopId, new Set(['SPECIAL-DIRECT']));
  routeNamesByStopId.set(toCandidates[0].stopId, new Set(['SPECIAL-DIRECT']));
  routeNamesByStopId.set(toCandidates[23].stopId, new Set(['SPECIAL-DIRECT']));

  const result = selectCandidatePairsForRouting({
    fromCandidates,
    toCandidates,
    maxCombinedAccessWalkMeters: 4000,
    routeNamesByStopId,
    budget: 100,
  });
  const pairKeys = new Set(result.pairs.map((pair) => `${pair.fromCandidate.stopId}:${pair.toCandidate.stopId}`));

  assert.equal(result.candidatePairs, 576);
  assert.equal(result.pairs.length, 100);
  assert.equal(pairKeys.has('1:101'), true);
  assert.equal(pairKeys.has('24:101'), true);
  assert.equal(pairKeys.has('1:124'), true);
  assert.equal(pairKeys.has('24:124'), true);
});

test('findJourneysWithRaptor queries nearby stop candidates and maps journeys', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(makeSnapshot(queries));

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.864, lng: -83.919 },
    destination: { lat: 9.865, lng: -83.918 },
    departureDate: new Date('2026-05-11T15:30:00.000Z'),
    walkRadiusMeters: 100,
  });

  assert.equal(result.source, 'raptor');
  assert.equal(result.journeys.length, 1);
  assert.equal(result.journeys[0].routeId, 500);
  assert.equal(result.journeys[0].routeName, 'Cartago Test');
  assert.equal(result.diagnostics?.candidatePairs, 1);
  assert.equal(queries[0].from, 1);
  assert.deepEqual(queries[0].to, new Set([2]));
});

test('findJourneysWithRaptor exposes opt-in perf diagnostics without changing results', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(makeSnapshot(queries));

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.864, lng: -83.919 },
    destination: { lat: 9.865, lng: -83.918 },
    departureDate: new Date('2026-05-11T15:30:00.000Z'),
    walkRadiusMeters: 100,
    perfDiagnostics: true,
  });

  assert.equal(result.source, 'raptor');
  assert.equal(result.journeys.length, 1);
  assert.equal(result.diagnostics?.fromCandidateCount, 1);
  assert.equal(result.diagnostics?.toCandidateCount, 1);
  assert.equal(result.diagnostics?.candidatePairs, 1);
  assert.equal(result.diagnostics?.candidatePairsSkippedSameStop, 0);
  assert.equal(result.diagnostics?.candidatePairsSkippedAccessWalk, 0);
  assert.equal(result.diagnostics?.routeCalls, 1);
  assert.equal(result.diagnostics?.directRouteCalls, 0);
  assert.equal(result.diagnostics?.routeCallDurationStatsMs?.count, 1);
  assert.equal(typeof result.diagnostics?.perfTimingsMs?.total, 'number');
  assert.equal(queries.length, 1);
});

test('findJourneysWithRaptor returns empty diagnostics when destination has no nearby stops', async () => {
  setSnapshotForTesting(makeSnapshot());

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.864, lng: -83.919 },
    destination: { lat: 10.5, lng: -84.5 },
    departureDate: new Date('2026-05-11T15:30:00.000Z'),
    walkRadiusMeters: 100,
  });

  assert.equal(result.source, 'raptor');
  assert.equal(result.journeys.length, 0);
  assert.equal(result.diagnostics?.fallbackReason, 'no_destination_candidates');
  assert.equal(result.diagnostics?.candidatePairs, 0);
});

test('findJourneysWithRaptor allows a wider default destination walk than boarding walk', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(makeSnapshot(queries));

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.864, lng: -83.919 },
    destination: { lat: 9.877, lng: -83.918 },
    departureDate: new Date('2026-05-11T15:30:00.000Z'),
    originWalkRadiusMeters: 50,
    maxStopCandidates: 1,
  });

  assert.equal(result.source, 'raptor');
  assert.equal(result.journeys.length, 1);
  assert.equal(result.diagnostics?.candidatePairs, 1);
  assert.equal(queries[0].from, 1);
  assert.deepEqual(queries[0].to, new Set([2]));
});

test('findJourneysWithRaptor starts RAPTOR after the access walk to the boarding stop', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(makeSnapshot(queries));

  await findJourneysWithRaptor({
    origin: { lat: 9.8595, lng: -83.919 },
    destination: { lat: 9.865, lng: -83.918 },
    departureDate: new Date('2026-05-11T15:30:00.000Z'),
    originWalkRadiusMeters: 700,
    maxStopCandidates: 1,
  });

  assert.equal(queries.length, 1);
  assert.equal(queries[0].departureTime, 576);
});

test('findJourneysWithRaptor skips candidate pairs with excessive combined access walking', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(makeSnapshot(queries));

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.7, lng: -83.919 },
    destination: { lat: 10.03, lng: -83.918 },
    departureDate: new Date('2026-05-11T15:30:00.000Z'),
    walkRadiusMeters: 25_000,
    maxStopCandidates: 2,
  });

  assert.equal(result.source, 'raptor');
  assert.equal(result.journeys.length, 0);
  assert.equal(queries.length, 0);
});

test('findJourneysWithRaptor preserves direct alternatives when transfer search is faster', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(makeDirectAndTransferSnapshot(queries));

  const result = await findJourneysWithRaptor({
    origin: { lat: stopA.lat ?? 0, lng: stopA.lon ?? 0 },
    destination: { lat: stopB.lat ?? 0, lng: stopB.lon ?? 0 },
    departureDate: new Date('2026-05-11T15:30:00.000Z'),
    walkRadiusMeters: 100,
    maxStopCandidates: 1,
    maxTransfers: 1,
  });

  assert.equal(queries.length, 2);
  assert.deepEqual(
    queries.map((query) => (query as unknown as { options?: { maxTransfers?: number } }).options?.maxTransfers),
    [1, 0],
  );
  assert.equal(
    result.journeys.some((journey) => journey.kind === 'direct' && journey.routeName === 'LOAIZA - CARTAGO'),
    true,
  );
  assert.equal(
    result.journeys.some((journey) => journey.kind === 'transfer' && journey.routeName?.includes('PENAS BLANCAS')),
    true,
  );
});

test('findJourneysWithRaptor bounds Llanos destination pair routing before range alternatives', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(
    makeBroadCandidateSnapshot({
      queries,
      origin: { lat: 9.87829, lng: -83.9389683 },
      destination: { lat: 9.8421571, lng: -83.8829415 },
    }),
  );

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.87829, lng: -83.9389683 },
    destination: { lat: 9.8421571, lng: -83.8829415 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
  });

  assert.equal(result.diagnostics?.candidatePairs, 576);
  assert.equal(result.diagnostics?.routedCandidatePairs, 32);
  assert.equal(queries.length, 32);
});

test('findJourneysWithRaptor bounds Paraiso destination pair routing before range alternatives', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(
    makeBroadCandidateSnapshot({
      queries,
      origin: { lat: 9.864429, lng: -83.919373 },
      destination: { lat: 9.838231, lng: -83.865581 },
    }),
  );

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.864429, lng: -83.919373 },
    destination: { lat: 9.838231, lng: -83.865581 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
  });

  assert.equal(result.diagnostics?.candidatePairs, 576);
  assert.equal(result.diagnostics?.routedCandidatePairs, 32);
  assert.equal(queries.length, 32);
});

test('findJourneysWithRaptor bounds default dense searches', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(
    makeBroadCandidateSnapshot({
      queries,
      origin: { lat: 9.864429, lng: -83.919373 },
      destination: { lat: 9.826, lng: -83.93 },
    }),
  );

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.864429, lng: -83.919373 },
    destination: { lat: 9.826, lng: -83.93 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
  });

  assert.equal(result.diagnostics?.candidatePairs, 576);
  assert.equal(result.diagnostics?.routedCandidatePairs, 64);
  assert.equal(queries.length, 64);
});

test('findJourneysWithRaptor bounds north local loop destination pair routing', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(
    makeBroadCandidateSnapshot({
      queries,
      origin: { lat: 9.864429, lng: -83.919373 },
      destination: { lat: 9.882739067077637, lng: -83.93372344970703 },
    }),
  );

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.864429, lng: -83.919373 },
    destination: { lat: 9.882739067077637, lng: -83.93372344970703 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
  });

  assert.equal(result.diagnostics?.candidatePairs, 576);
  assert.equal(result.diagnostics?.routedCandidatePairs, 40);
  assert.equal(queries.length, 40);
});

test('findJourneysWithRaptor gives El Carmen north local destinations a wider routing budget', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(
    makeBroadCandidateSnapshot({
      queries,
      origin: { lat: 9.864429, lng: -83.919373 },
      destination: { lat: 9.873766899108887, lng: -83.92220306396484 },
    }),
  );

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.864429, lng: -83.919373 },
    destination: { lat: 9.873766899108887, lng: -83.92220306396484 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
  });

  assert.equal(result.diagnostics?.candidatePairs, 576);
  assert.equal(result.diagnostics?.routedCandidatePairs, 68);
  assert.equal(queries.length, 68);
});

test('findJourneysWithRaptor bounds Guadalupe destination searches without narrowing Guadalupe returns', async () => {
  const destinationQueries: Query[] = [];
  setSnapshotForTesting(
    makeBroadCandidateSnapshot({
      queries: destinationQueries,
      origin: { lat: 9.864429, lng: -83.919373 },
      destination: { lat: 9.8660225, lng: -83.9244086 },
    }),
  );

  const destinationResult = await findJourneysWithRaptor({
    origin: { lat: 9.864429, lng: -83.919373 },
    destination: { lat: 9.8660225, lng: -83.9244086 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
  });

  assert.equal(destinationResult.diagnostics?.candidatePairs, 576);
  assert.equal(destinationResult.diagnostics?.routedCandidatePairs, 80);
  assert.equal(destinationQueries.length, 80);

  const returnQueries: Query[] = [];
  setSnapshotForTesting(
    makeBroadCandidateSnapshot({
      queries: returnQueries,
      origin: { lat: 9.8660225, lng: -83.9244086 },
      destination: { lat: 9.864429, lng: -83.919373 },
    }),
  );

  const returnResult = await findJourneysWithRaptor({
    origin: { lat: 9.8660225, lng: -83.9244086 },
    destination: { lat: 9.864429, lng: -83.919373 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
  });

  assert.equal(returnResult.diagnostics?.candidatePairs, 576);
  assert.equal(returnResult.diagnostics?.routedCandidatePairs, 240);
  assert.equal(returnQueries.length, 240);
});

test('findJourneysWithRaptor preserves short urban range alternatives with closer boarding', async () => {
  const queries: Query[] = [];
  const rangeQueries: RangeQuery[] = [];
  setSnapshotForTesting(makeShortUrbanRangeAlternativeSnapshot({ queries, rangeQueries }));

  const originLng = stopA.lon ?? 0;
  const destinationLng =
    originLng + 360 / (111_320 * Math.cos(((stopA.lat ?? 0) * Math.PI) / 180));
  const result = await findJourneysWithRaptor({
    origin: { lat: stopA.lat ?? 0, lng: originLng },
    destination: { lat: stopA.lat ?? 0, lng: destinationLng },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
    walkRadiusMeters: 500,
  });

  assert.equal(rangeQueries.length > 0, true);
  assert.equal(result.journeys[0]?.boardStopName, 'Origen');
  assert.equal(
    result.journeys.some((journey) => journey.boardStopName === 'Downstream board'),
    true,
  );
});

test('findJourneysWithRaptor preserves Llanos range alternatives beyond the short urban window', async () => {
  const queries: Query[] = [];
  const rangeQueries: RangeQuery[] = [];
  setSnapshotForTesting(makeLlanosRangeAlternativeSnapshot({ queries, rangeQueries }));

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.87829, lng: -83.9389683 },
    destination: { lat: 9.8421571, lng: -83.8829415 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
    walkRadiusMeters: 500,
  });

  assert.equal(queries.length > 0, true);
  assert.equal(rangeQueries.length > 0, true);
  assert.equal(rangeQueries.length <= 4, true);
  assert.equal(result.journeys.length, 1);
  assert.equal(result.journeys[0].routeName, 'CARTAGO - LLANOS DE SANTA LUCIA');
  assert.equal(result.journeys[0].boardStopName, 'DIAGONAL A LA CASA DE LOS PATOS');
});

test('findJourneysWithRaptor preserves Paraiso range alternatives beyond the short urban window', async () => {
  const queries: Query[] = [];
  const rangeQueries: RangeQuery[] = [];
  setSnapshotForTesting(makeParaisoRangeAlternativeSnapshot({ queries, rangeQueries }));

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.87829, lng: -83.9389683 },
    destination: { lat: 9.838231, lng: -83.865581 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
    walkRadiusMeters: 500,
  });

  assert.equal(queries.length > 0, true);
  assert.equal(rangeQueries.length > 0, true);
  assert.equal(rangeQueries.length <= 4, true);
  assert.equal(result.journeys.length, 1);
  assert.equal(result.journeys[0].routeName, 'CARTAGO - PARAISO');
  assert.equal(result.journeys[0].boardStopName, 'DIAGONAL A LA CASA DE LOS PATOS');
});

test('findJourneysWithRaptor preserves Quircot loop-start range alternatives', async () => {
  const queries: Query[] = [];
  const rangeQueries: RangeQuery[] = [];
  setSnapshotForTesting(makeQuircotLoopStartRangeSnapshot({ queries, rangeQueries }));

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.864429, lng: -83.919373 },
    destination: { lat: 9.882739067077637, lng: -83.93372344970703 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
    walkRadiusMeters: 1200,
    maxStopCandidates: 8,
  });

  assert.equal(queries.length > 0, true);
  assert.equal(rangeQueries.length <= 4, true);
  assert.equal(rangeQueries.some((query) => query.from === 200 && query.to.has(202)), true);
  assert.equal(result.journeys.length, 1);
  assert.equal(result.journeys[0].routeName, 'CARTAGO - EL CARMEN - QUIRCOT - COOPERROSALES');
  assert.equal(result.journeys[0].boardStopName, 'Terminal Taras Loop Start');
  assert.equal(Math.round(result.journeys[0].destinationWalkMeters), 0);
});

test('findJourneysWithRaptor preserves Taras Plaza Iglesias transfer to Cartago Paraiso when exposed through another feeder', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(makeTarasParaisoTerminalSynthesisSnapshot(queries));

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.87829, lng: -83.9389683 },
    destination: { lat: 9.8392523, lng: -83.8664324 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
    walkRadiusMeters: 1200,
  });

  assert.equal(queries.length > 0, true);
  assert.equal(
    result.journeys.some(
      (journey) =>
        journey.routeName === 'CARTAGO - TARAS - SAN NICOLAS luego CARTAGO - PARAISO' &&
        journey.boardStopName === 'DIAGONAL A LA CASA DE LOS PATOS' &&
        journey.legs[0]?.alightStopName === 'Parada Plaza Iglesias',
    ),
    true,
  );
});

test('findJourneysWithRaptor preserves Taras Plaza Iglesias transfer to exact Llanos branch when exposed through another feeder', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(
    makeTarasParaisoTerminalSynthesisSnapshot(queries, {
      branchRouteName: 'CARTAGO - LLANOS DE SANTA LUCIA',
      destination: { lat: 9.8421571, lng: -83.8829415 },
      destinationStopName: 'CONTIGUO PALI DE LLANOS DE SANTA LUCIA',
    }),
  );

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.87829, lng: -83.9389683 },
    destination: { lat: 9.8421571, lng: -83.8829415 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
    walkRadiusMeters: 1200,
  });

  assert.equal(queries.length > 0, true);
  assert.equal(
    result.journeys.some(
      (journey) =>
        journey.routeName === 'CARTAGO - TARAS - SAN NICOLAS luego CARTAGO - LLANOS DE SANTA LUCIA' &&
        journey.boardStopName === 'DIAGONAL A LA CASA DE LOS PATOS' &&
        journey.legs[0]?.alightStopName === 'Parada Plaza Iglesias',
    ),
    true,
  );
});

test('findJourneysWithRaptor synthesizes Taras Plaza Iglesias transfer when exact Llanos only exists from the terminal', async () => {
  const queries: Query[] = [];
  const rangeQueries: RangeQuery[] = [];
  setSnapshotForTesting(makeTarasLlanosTerminalDirectSynthesisSnapshot({ queries, rangeQueries }));

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.87829, lng: -83.9389683 },
    destination: { lat: 9.8421571, lng: -83.8829415 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
    walkRadiusMeters: 1200,
  });

  assert.equal(queries.length > 0, true);
  assert.equal(rangeQueries.some((query) => query.from === 138 && query.to.has(962)), true);
  assert.equal(
    result.journeys.some(
      (journey) =>
        journey.routeName === 'CARTAGO - TARAS - SAN NICOLAS luego CARTAGO - LLANOS DE SANTA LUCIA' &&
        journey.dropStopName === 'CONTIGUO PALI DE LLANOS DE SANTA LUCIA' &&
        journey.legs[0]?.alightStopName === 'Parada Plaza Iglesias',
    ),
    true,
  );
});

test('findJourneysWithRaptor prunes Taras east terminal branch range search to compatible destination stops', async () => {
  const queries: Query[] = [];
  const rangeQueries: RangeQuery[] = [];
  setSnapshotForTesting(
    makeTarasLlanosTerminalDirectSynthesisSnapshot({
      destinationFillers: 20,
      queries,
      rangeQueries,
    }),
  );

  await findJourneysWithRaptor({
    origin: { lat: 9.87829, lng: -83.9389683 },
    destination: { lat: 9.8421571, lng: -83.8829415 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
    walkRadiusMeters: 1200,
  });

  const terminalBranchQueries = rangeQueries.filter((query) => query.from === 138);

  assert.equal(terminalBranchQueries.length, 1);
  assert.equal(terminalBranchQueries[0].to.has(962), true);
});

test('findJourneysWithRaptor caps Taras east terminal branch range search to the nearest compatible stops', async () => {
  const queries: Query[] = [];
  const rangeQueries: RangeQuery[] = [];
  setSnapshotForTesting(
    makeTarasLlanosTerminalDirectSynthesisSnapshot({
      compatibleDestinationFillers: 6,
      queries,
      rangeQueries,
    }),
  );

  await findJourneysWithRaptor({
    origin: { lat: 9.87829, lng: -83.9389683 },
    destination: { lat: 9.8421571, lng: -83.8829415 },
    departureDate: new Date('2026-05-11T14:00:00.000Z'),
    walkRadiusMeters: 1200,
  });

  const terminalBranchQueries = rangeQueries.filter((query) => query.from === 138);

  assert.equal(terminalBranchQueries.length, 2);
  assert.equal(terminalBranchQueries[0].to.has(962), true);
});

test('findJourneysWithRaptor expands destination radius for Tapanti-style rural tourist destinations', async () => {
  const queries: Query[] = [];
  const tapantiDestination = { lat: 9.76586, lng: -83.78541 };
  const purisilStop = stopNear({
    id: 812,
    sourceStopId: -200014312,
    name: 'TERMINAL PURISIL',
    origin: tapantiDestination,
    eastMeters: 3850,
  });
  setSnapshotForTesting(
    makeTwoStopSnapshot({
      fromStop: stopA,
      toStop: purisilStop,
      queries,
      routeName: 'CARTAGO - OROSI - RIO MACHO - PURISIL',
    }),
  );

  const result = await findJourneysWithRaptor({
    origin: { lat: 9.864, lng: -83.919 },
    destination: tapantiDestination,
    departureDate: new Date('2026-05-11T15:30:00.000Z'),
  });

  assert.equal(result.source, 'raptor');
  assert.equal(result.journeys.length, 1);
  assert.equal(result.journeys[0].routeName, 'CARTAGO - OROSI - RIO MACHO - PURISIL');
  assert.ok(result.journeys[0].destinationWalkMeters > 2500);
  assert.ok(result.journeys[0].destinationWalkMeters < 4500);
  assert.equal(queries.length, 1);
});

test('findJourneysWithRaptor includes Escuela de Sordos when Sanatorio destination shares its route', async () => {
  const queries: Query[] = [];
  setSnapshotForTesting(makeTerminalSanatorioSnapshot(queries));

  await findJourneysWithRaptor({
    origin: { lat: 9.862138, lng: -83.923164 },
    destination: { lat: 9.931869, lng: -83.880095 },
    departureDate: new Date('2026-05-11T15:30:00.000Z'),
    originWalkRadiusMeters: 1200,
    destinationWalkRadiusMeters: 500,
    maxStopCandidates: 24,
  });

  assert.equal(queries.some((query) => query.from === 2336), true);
});

test('selectJourneyCandidatesForRanking keeps lower-score distinct route sequences', () => {
  const repeatedSantaElena = Array.from({ length: 12 }, (_, index) =>
    makeCandidateJourney({
      routeNames: ['SANTA ELENA ABAJO - CARTAGO POR PARQUE INDUSTRIAL'],
      score: index + 1,
      stopSeed: index + 1,
    }),
  );
  const santaElenaToTobosi = makeCandidateJourney({
    routeNames: [
      'SANTA ELENA ABAJO - CARTAGO POR PARQUE INDUSTRIAL',
      'CARTAGO - TOBOSI - QUEBRADILLAS',
    ],
    score: 40,
    stopSeed: 99,
  });

  const selected = selectJourneyCandidatesForRanking([...repeatedSantaElena, santaElenaToTobosi], {
    limit: 6,
    perRouteSequenceLimit: 3,
  });

  assert.equal(selected.length, 6);
  assert.equal(selected.some((journey) => journey.routeName?.includes('TOBOSI')), true);
  assert.equal(
    selected.filter((journey) => journey.routeName === 'SANTA ELENA ABAJO - CARTAGO POR PARQUE INDUSTRIAL').length,
    5,
  );
});

test('selectJourneyCandidatesForRanking fills remaining slots when diversity is exhausted', () => {
  const repeatedJourneys = Array.from({ length: 8 }, (_, index) =>
    makeCandidateJourney({
      routeNames: ['CARTAGO - TEST'],
      score: index + 1,
      stopSeed: index + 1,
    }),
  );

  const selected = selectJourneyCandidatesForRanking(repeatedJourneys, {
    limit: 6,
    perRouteSequenceLimit: 3,
  });

  assert.equal(selected.length, 6);
  assert.deepEqual(
    selected.map((journey) => journey.score),
    [1, 2, 3, 4, 5, 6],
  );
});

test('selectJourneyCandidatesForRanking preserves near-destination route-sequence diversity', () => {
  const farLowerScoreJourneys = Array.from({ length: 6 }, (_, index) =>
    makeCandidateJourney({
      routeNames: [`CARTAGO - FAR BRANCH ${index + 1}`],
      score: index + 1,
      stopSeed: index + 1,
      totalWalkMeters: 1600,
    }),
  );
  const nearbyLoaizaJourneys = Array.from({ length: 3 }, (_, index) =>
    makeCandidateJourney({
      routeNames: ['CARTAGO - LOAIZA'],
      score: 20 + index,
      stopSeed: 40 + index,
      totalWalkMeters: 20,
    }),
  );
  const nearExactBranch = makeCandidateJourney({
    routeNames: ['CARTAGO - OROSI - PALOMO - LA ALEGRIA'],
    score: 30,
    stopSeed: 80,
    totalWalkMeters: 20,
  });

  const selected = selectJourneyCandidatesForRanking(
    [...farLowerScoreJourneys, ...nearbyLoaizaJourneys, nearExactBranch],
    { limit: 6, perRouteSequenceLimit: 3 },
  );

  assert.equal(selected.length, 6);
  assert.equal(
    selected.some((journey) => journey.routeName === 'CARTAGO - OROSI - PALOMO - LA ALEGRIA'),
    true,
  );
});
