import {
  getParadasPorRuta,
  isCtpPreviewEnabled,
  isCtpPreviewRouteStopRouteId,
  Parada,
} from '@/lib/paradas';
import { supabase } from '@/lib/supabase';
import {
  getWalkingRoute,
  hasWalkingNetworkProvider,
  type WalkingRouteResult,
} from '@/lib/walking-network';
import {
  computeWalkNetworkPenalty,
  WALK_NETWORK_DETOUR_RATIO_LIMIT,
  WALK_NETWORK_SOFT_LIMIT_METERS,
} from '@/lib/walking-network-scoring';

export type NearbyRoute = {
  ruta_id: number;
  operador: string | null;
  nombre_ruta: string | null;
  codigo_ctp: string | null;
  dist_origen: number;
  dist_destino: number;
  tarifa_regular?: number | null;
  tarifa_adulto_mayor?: number | null;
  tarifa_vigencia?: string | null;
};

export type JourneyLeg = {
  routeId: number;
  routeName: string | null;
  routeCode: string | null;
  operator: string | null;
  direction?: string | null;
  boardStopId?: number | null;
  boardStopName?: string | null;
  alightStopId?: number | null;
  alightStopName?: string | null;
  boardStop?: Parada;
  alightStop?: Parada;
  scheduledWaitMinutes?: number | null;
  scheduledFrequencyMinutes?: number | null;
};

export type JourneyGeoMetrics = {
  baseScore: number | null;
  scoreAdjustment: number | null;
  confidenceScore: number | null;
  qualityFlags: string[];
  straightLineMeters: number | null;
  originWalkMeters: number | null;
  transferWalkMeters: number | null;
  finalWalkMeters: number | null;
  totalWalkMeters: number | null;
  firstLegDestinationDistanceMeters: number | null;
  finalStopDestinationDistanceMeters: number | null;
  firstLegProgressMeters: number | null;
  firstLegProgressRatio: number | null;
  finalStopProgressMeters: number | null;
  finalStopProgressRatio: number | null;
  firstLegBacktrackMeters: number | null;
  finalStopBacktrackMeters: number | null;
  transferGainMeters: number | null;
  transferGainRatio: number | null;
  totalWalkRatio: number | null;
  transferWalkRatio: number | null;
  boardShapeDistanceMeters: number | null;
  firstAlightShapeDistanceMeters: number | null;
  secondBoardShapeDistanceMeters: number | null;
  finalAlightShapeDistanceMeters: number | null;
  maxShapeStopDistanceMeters: number | null;
  routeDestinationAlignment: number | null;
  transferQualityLabel: string | null;
  transferQualityScore: number | null;
  finalWalkStraightMeters: number | null;
  finalWalkNetworkMeters: number | null;
  finalWalkNetworkMinutes: number | null;
  walkDetourRatio: number | null;
  walkRouteAvailable: boolean | null;
  walkNetworkPenalty: number | null;
  walkNetworkStatus: WalkingRouteResult['status'] | null;
  finalWalkBacktrackDot: number | null;
  finalWalkBacktrackPenalty: number | null;
  finalWalkStartsAgainstBus: boolean | null;
  finalWalkRouteCoordinates?: [number, number][] | null;
};

export type PlannedJourney = {
  id: string;
  kind: 'direct' | 'transfer';
  routeId: number;
  routeName: string | null;
  routeCode: string | null;
  operatorLabel: string;
  routeIds: number[];
  routeCodes: string[];
  legs: JourneyLeg[];
  originWalkMeters: number;
  destinationWalkMeters: number;
  transferWalkMeters: number;
  totalWalkMeters: number;
  totalFare: number | null;
  score: number;
  boardStopName: string;
  dropStopName: string;
  transferLabel: string | null;
  geoMetrics?: JourneyGeoMetrics | null;
};

export type JourneyProgressMetrics = {
  straightLineDistanceMeters: number;
  firstLegDestinationDistanceMeters: number | null;
  finalStopDestinationDistanceMeters: number | null;
  firstLegProgressMeters: number | null;
  firstLegProgressRatio: number | null;
  firstLegBacktrackMeters: number;
  finalStopProgressMeters: number | null;
  finalStopProgressRatio: number | null;
  finalStopBacktrackMeters: number;
  totalWalkRatio: number | null;
  transferWalkRatio: number | null;
  hasStopGeometry: boolean;
};

export type JourneyContextPenaltyReason = {
  id: string;
  label: string;
  penalty: number;
};

export type JourneyContextPenaltyBreakdown = {
  totalPenalty: number;
  reasons: JourneyContextPenaltyReason[];
  metrics: JourneyProgressMetrics | null;
};

export type NearbyTransitStop = {
  id: string;
  stopName: string;
  routeId: number;
  routeName: string;
  routeCode: string;
  distanceMeters: number;
};

type NearbyPreviewStopRow = {
  id?: string | null;
  stop_name?: string | null;
  route_id?: number | null;
  route_name?: string | null;
  route_code?: string | null;
  distance_m?: number | null;
};

type TarifaRow = {
  id: number;
  codigo_ruta: string | null;
  tarifa_regular: number | null;
  fecha_vigencia: string | null;
};

type RoutePointRow = {
  lat: number;
  lng: number;
  segmento_id: number | null;
  orden?: number | null;
};

type PreviewRouteGeometry = {
  type?: string | null;
  coordinates?: unknown;
} | null;

type PlannerLocationContextRow = {
  hub_key?: string | null;
  hub_name?: string | null;
  hub_type?: string | null;
  resolved_lat?: number | string | null;
  resolved_lng?: number | string | null;
  radius_m?: number | null;
  planner_radius_override_m?: number | null;
  arrival_stop_ids?: (number | string)[] | null;
  departure_stop_ids?: (number | string)[] | null;
};

type PlannerLocationContext = {
  hubKey: string;
  hubName: string;
  hubType: string | null;
  resolvedCoords: [number, number];
  radiusMeters: number;
  plannerRadiusOverrideMeters: number | null;
  arrivalStopIds: number[];
  departureStopIds: number[];
};

type PlannerServiceGroupCandidateRow = {
  origin_hub_key?: string | null;
  origin_hub_name?: string | null;
  destination_hub_key?: string | null;
  destination_hub_name?: string | null;
  group_key?: string | null;
  group_name?: string | null;
  group_type?: string | null;
  route_code?: string | null;
  product_route_id?: number | string | null;
  preview_route_id?: number | string | null;
  variant_family_code?: string | null;
  variant_code?: string | null;
  member_label?: string | null;
  member_priority?: number | string | null;
  directness_rank?: number | string | null;
  effective_priority?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

type PlannerServiceGroupCandidate = {
  originHubKey: string | null;
  destinationHubKey: string | null;
  groupKey: string;
  groupName: string;
  routeCode: string | null;
  productRouteId: number | null;
  previewRouteId: number | null;
  variantFamilyCode: string | null;
  variantCode: string | null;
  memberLabel: string;
  memberPriority: number;
  directnessRank: number;
  effectivePriority: number;
  metadata: Record<string, unknown> | null;
};

type NearestStopMatch = {
  stop: Parada;
  distanceMeters: number;
};

type IndexedStopMatch = NearestStopMatch & {
  index: number;
};

type OrderedDirectStopPair = {
  boardStop: IndexedStopMatch;
  dropStop: IndexedStopMatch;
  heuristicScore: number;
};

type TransferPair = {
  originTransferStop: Parada;
  destinationTransferStop: Parada;
  transferWalkMeters: number;
  heuristicScore: number;
};

type JourneyChainBucket = {
  key: string;
  journeys: PlannedJourney[];
};

type JourneyRpcRow = {
  tipo_viaje?: string | null;
  transbordos?: number | null;
  score?: number | string | null;
  ruta_1_id?: number | null;
  ruta_1_nombre?: string | null;
  ruta_1_codigo?: string | null;
  ruta_1_operador?: string | null;
  sentido_1?: string | null;
  subida_1_parada_id?: number | null;
  subida_1_parada_nombre?: string | null;
  subida_1_distancia_m?: number | null;
  bajada_1_parada_id?: number | null;
  bajada_1_parada_nombre?: string | null;
  ruta_2_id?: number | null;
  ruta_2_nombre?: string | null;
  ruta_2_codigo?: string | null;
  ruta_2_operador?: string | null;
  sentido_2?: string | null;
  subida_2_parada_id?: number | null;
  subida_2_parada_nombre?: string | null;
  bajada_2_parada_id?: number | null;
  bajada_2_parada_nombre?: string | null;
  transbordo_distancia_m?: number | null;
  destino_distancia_final_m?: number | null;
  caminata_total_m?: number | null;
  espera_1_min?: number | null;
  espera_2_min?: number | null;
  espera_total_min?: number | null;
  frecuencia_1_min?: number | null;
  frecuencia_2_min?: number | null;
  tarifa_total?: number | null;
};

const DEFAULT_RADIUS_METERS = 600;
const MAX_TRANSFER_WALK_METERS = 180;
const MIN_MEANINGFUL_TRIP_METERS = 220;
const LOCAL_CONTEXT_DISTANCE_THRESHOLD_METERS = 5_500;
const LEGACY_RETRY_RADII = [600, 900, 1200, 1600] as const;
const STRONG_INTERURBAN_HINTS = [
  'SAN JOSE',
  'PASO CANOAS',
  'LIMON',
  'PUNTARENAS',
  'ALAJUELA',
  'HEREDIA',
  'TURRIALBA',
  'NICOYA',
  'LIBERIA',
  'UPALA',
];
const MEDIUM_INTERURBAN_HINTS = ['TRES RIOS', 'ZAPOTE', 'DESAMPARADOS', 'ASERRI', 'QUEPOS'];
const RPC_TIMEOUT_RETRY_RADII = [600, 450, 300] as const;
const RPC_TIMEOUT_RETRY_TRANSFER_WALKS = [180, 150, 120] as const;
const RPC_TIMEOUT_BACKOFF_MS = 5 * 60_000;
const RPC_MISSING_BACKOFF_MS = 30 * 60_000;
const PREVIEW_TIMEOUT_BACKOFF_MS = 2 * 60_000;
const PLANNER_LOCATION_CONTEXT_BACKOFF_MS = 5 * 60_000;
const PLANNER_SERVICE_GROUP_BACKOFF_MS = 5 * 60_000;
const WALK_NETWORK_VALIDATION_LIMIT = 24;
const PARTIAL_PLANNER_PROJECT_REFS: string[] = String(process.env.EXPO_PUBLIC_PARTIAL_PLANNER_PROJECT_REFS ?? '')
  .split(',')
  .map((projectRef: string) => projectRef.trim())
  .filter(Boolean);
const stopCache = new Map<number, Promise<Parada[]>>();
const stopByIdCache = new Map<number, Parada>();
const trajectoryCache = new Map<number, Promise<[number, number][][]>>();
let rpcTimeoutBackoffUntil = 0;
let rpcMissingBackoffUntil = 0;
let previewTimeoutBackoffUntil = 0;
let plannerLocationContextBackoffUntil = 0;
let plannerServiceGroupBackoffUntil = 0;

function isRpcPlannerBackedOff(now = Date.now()) {
  return rpcTimeoutBackoffUntil > now || rpcMissingBackoffUntil > now;
}

function isPlannerLocationContextBackedOff(now = Date.now()) {
  return plannerLocationContextBackoffUntil > now;
}

function isPlannerServiceGroupBackedOff(now = Date.now()) {
  return plannerServiceGroupBackoffUntil > now;
}

function shouldAllowLegacyFallbackOnEmptyRpc() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  return PARTIAL_PLANNER_PROJECT_REFS.some((projectRef) => supabaseUrl.includes(projectRef));
}

function normalizeRouteCode(value?: string | null): string {
  return (value ?? '').trim().toUpperCase();
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineMeters(from: [number, number], to: [number, number]) {
  const [lngFrom, latFrom] = from;
  const [lngTo, latTo] = to;
  const deltaLat = toRadians(latTo - latFrom);
  const deltaLng = toRadians(lngTo - lngFrom);
  const latFromRad = toRadians(latFrom);
  const latToRad = toRadians(latTo);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(latFromRad) * Math.cos(latToRad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6_371_000 * c;
}

function walkMinutesFromMeters(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return 1;
  return Math.max(1, Math.round(meters / 80));
}

function formatRouteName(value?: string | null) {
  if (!value) return 'Ruta disponible';
  return value
    .toLocaleLowerCase('es-CR')
    .replace(/(^|[\s/-])([a-z])/g, (_, prefix: string, letter: string) => {
      return `${prefix}${letter.toLocaleUpperCase('es-CR')}`;
    });
}

function normalizePlannerText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function uniqueByRouteId(routes: NearbyRoute[]) {
  const byRouteId = new Map<number, NearbyRoute>();
  routes.forEach((route) => {
    if (!byRouteId.has(route.ruta_id)) {
      byRouteId.set(route.ruta_id, route);
    }
  });
  return [...byRouteId.values()];
}

function toStopCoordinate(stop: Parada): [number, number] {
  return [Number(stop.lng), Number(stop.lat)];
}

function toOptionalStopCoordinate(stop?: Parada | null): [number, number] | null {
  if (!stop) return null;
  if (!Number.isFinite(Number(stop.lng)) || !Number.isFinite(Number(stop.lat))) return null;
  return [Number(stop.lng), Number(stop.lat)];
}

function computeLegSegmentDistance(leg: JourneyLeg): number | null {
  const boardCoordinate = toOptionalStopCoordinate(leg.boardStop);
  const alightCoordinate = toOptionalStopCoordinate(leg.alightStop);
  if (!boardCoordinate || !alightCoordinate) return null;
  return haversineMeters(boardCoordinate, alightCoordinate);
}

function findNearestStop(stops: Parada[], coordinate: [number, number]): NearestStopMatch | null {
  let best: NearestStopMatch | null = null;

  stops.forEach((stop) => {
    const distanceMeters = haversineMeters(coordinate, toStopCoordinate(stop));
    if (!best || distanceMeters < best.distanceMeters) {
      best = { stop, distanceMeters };
    }
  });

  return best;
}

function rankStopsByDistance(
  stops: Parada[],
  coordinate: [number, number],
  options?: {
    limit?: number;
    minIndex?: number;
    maxIndex?: number;
  },
): IndexedStopMatch[] {
  const { limit = stops.length, maxIndex = stops.length - 1, minIndex = 0 } = options ?? {};

  return stops
    .map((stop, index) => ({
      stop,
      index,
      distanceMeters: haversineMeters(coordinate, toStopCoordinate(stop)),
    }))
    .filter((match) => match.index >= minIndex && match.index <= maxIndex)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, Math.max(1, limit));
}

function pickOrderedDirectStopPair(params: {
  stops: Parada[];
  origin: [number, number];
  destination: [number, number];
}): OrderedDirectStopPair | null {
  const { destination, origin, stops } = params;
  if (stops.length === 0) return null;

  const straightLineMeters = haversineMeters(origin, destination);
  const minIndexGap =
    straightLineMeters >= 1_000 ? 2 : straightLineMeters > MIN_MEANINGFUL_TRIP_METERS ? 1 : 0;
  const boardCandidates = rankStopsByDistance(stops, origin, {
    limit: Math.min(6, stops.length),
  });
  const dropCandidates = rankStopsByDistance(stops, destination, {
    limit: Math.min(12, stops.length),
  });

  let bestPair: OrderedDirectStopPair | null = null;

  boardCandidates.forEach((boardStop) => {
    dropCandidates.forEach((dropStop) => {
      if (dropStop.index < boardStop.index + minIndexGap) return;

      const routeSpanMeters = haversineMeters(
        toStopCoordinate(boardStop.stop),
        toStopCoordinate(dropStop.stop),
      );
      const indexGap = dropStop.index - boardStop.index;

      let heuristicScore = boardStop.distanceMeters * 1.05 + dropStop.distanceMeters * 1.45;
      heuristicScore -= Math.min(indexGap, 18) * 12;

      if (straightLineMeters > MIN_MEANINGFUL_TRIP_METERS) {
        if (dropStop.stop.parada_id === boardStop.stop.parada_id) {
          heuristicScore += 2_500;
        }

        if (indexGap < 2 && straightLineMeters >= 600) {
          heuristicScore += 900;
        }

        if (routeSpanMeters < Math.min(220, straightLineMeters * 0.18)) {
          heuristicScore += 700;
        }
      }

      if (!bestPair || heuristicScore < bestPair.heuristicScore) {
        bestPair = {
          boardStop,
          dropStop,
          heuristicScore,
        };
      }
    });
  });

  return bestPair;
}

function pickTransferPair(
  originStops: Parada[],
  destinationStops: Parada[],
  boardStop: IndexedStopMatch,
  finalStop: IndexedStopMatch,
): TransferPair | null {
  let bestPair: TransferPair | null = null;

  originStops.forEach((originTransferStop, originTransferIndex) => {
    if (originTransferIndex < boardStop.index) return;

    const boardToTransferMeters = haversineMeters(
      toStopCoordinate(boardStop.stop),
      toStopCoordinate(originTransferStop),
    );

    destinationStops.forEach((destinationTransferStop, destinationTransferIndex) => {
      if (destinationTransferIndex > finalStop.index) return;

      const transferWalkMeters = haversineMeters(
        toStopCoordinate(originTransferStop),
        toStopCoordinate(destinationTransferStop),
      );

      if (transferWalkMeters > MAX_TRANSFER_WALK_METERS) return;

      const transferToDropMeters = haversineMeters(
        toStopCoordinate(destinationTransferStop),
        toStopCoordinate(finalStop.stop),
      );
      const heuristicScore =
        boardToTransferMeters * 0.35 + transferWalkMeters * 1.4 + transferToDropMeters * 0.35;

      if (!bestPair || heuristicScore < bestPair.heuristicScore) {
        bestPair = {
          originTransferStop,
          destinationTransferStop,
          transferWalkMeters,
          heuristicScore,
        };
      }
    });
  });

  return bestPair;
}

async function fetchFareMap(routeCodes: string[]) {
  const normalizedCodes = Array.from(
    new Set(routeCodes.map((code) => normalizeRouteCode(code)).filter(Boolean)),
  );
  const fareMap = new Map<string, TarifaRow>();

  if (normalizedCodes.length === 0) return fareMap;

  const { data, error } = await supabase
    .from('tarifas')
    .select('id, codigo_ruta, tarifa_regular, fecha_vigencia')
    .in('codigo_ruta', normalizedCodes)
    .order('fecha_vigencia', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false });

  if (error) return fareMap;

  ((data as TarifaRow[] | null) ?? []).forEach((tarifa) => {
    const routeCode = normalizeRouteCode(tarifa.codigo_ruta);
    if (routeCode && !fareMap.has(routeCode)) {
      fareMap.set(routeCode, tarifa);
    }
  });

  return fareMap;
}

async function fetchNearbyRoutesForPoint(
  coordinate: [number, number],
  radioMeters = DEFAULT_RADIUS_METERS,
) {
  const [lng, lat] = coordinate;
  if (__DEV__) {
    console.warn('Legacy nearby query', { lng, lat, radioMeters });
  }
  const { data, error } = await supabase.rpc('buscar_rutas_cercanas', {
    lat_origen: lat,
    lng_origen: lng,
    lat_destino: lat,
    lng_destino: lng,
    radio_metros: radioMeters,
  });

  if (error) {
    console.error('Error cargando rutas cerca del punto:', error);
    return [];
  }

  return uniqueByRouteId((data ?? []) as NearbyRoute[]);
}

async function fetchDirectRoutes(
  origin: [number, number],
  destination: [number, number],
  radioMeters = DEFAULT_RADIUS_METERS,
) {
  const [originLng, originLat] = origin;
  const [destinationLng, destinationLat] = destination;

  if (__DEV__) {
    console.warn('Legacy direct query', {
      originLng,
      originLat,
      destinationLng,
      destinationLat,
      radioMeters,
    });
  }

  const { data, error } = await supabase.rpc('buscar_rutas_cercanas', {
    lat_origen: originLat,
    lng_origen: originLng,
    lat_destino: destinationLat,
    lng_destino: destinationLng,
    radio_metros: radioMeters,
  });

  if (error) {
    console.error('Error cargando rutas directas:', error);
    return [];
  }

  return uniqueByRouteId((data ?? []) as NearbyRoute[]);
}

async function getRouteStopsCached(routeId: number) {
  if (isCtpPreviewEnabled() && isCtpPreviewRouteStopRouteId(routeId)) {
    return getParadasPorRuta(routeId)
      .then((stops) =>
        stops.filter((stop) => Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng))),
      )
      .catch(() => []);
  }

  const cached = stopCache.get(routeId);
  if (cached) return cached;

  const request = getParadasPorRuta(routeId)
    .then((stops) => stops.filter((stop) => Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng))))
    .catch(() => []);

  stopCache.set(routeId, request);
  return request;
}

async function fetchStopsByIds(stopIds: number[]) {
  const uniqueIds = Array.from(
    new Set(stopIds.filter((stopId) => Number.isFinite(stopId))),
  );
  const stopMap = new Map<number, Parada>();

  uniqueIds.forEach((stopId) => {
    const cachedStop = stopByIdCache.get(stopId);
    if (cachedStop) {
      stopMap.set(stopId, cachedStop);
    }
  });

  const missingIds = uniqueIds.filter((stopId) => !stopByIdCache.has(stopId));
  if (missingIds.length === 0) return stopMap;

  const { data, error } = await supabase
    .from('paradas')
    .select('id, nombre, lat, lng, tiene_techo, accesible')
    .in('id', missingIds);

  if (error) {
    console.error('Error cargando paradas por id:', error);
    return stopMap;
  }

  ((data ?? []) as {
    id?: number | null;
    nombre?: string | null;
    lat?: number | null;
    lng?: number | null;
    tiene_techo?: boolean | null;
    accesible?: boolean | null;
  }[]).forEach((row) => {
    const stopId = Number(row.id);
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(stopId) || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const stop: Parada = {
      parada_id: stopId,
      nombre: row.nombre ?? null,
      lat,
      lng,
      tiene_techo: row.tiene_techo ?? null,
      accesible: row.accesible ?? null,
    };

    stopByIdCache.set(stopId, stop);
    stopMap.set(stopId, stop);
  });

  return stopMap;
}

function calculateJourneyFare(routeCodes: string[], fareMap: Map<string, TarifaRow>) {
  const fares = routeCodes
    .map((routeCode) => fareMap.get(normalizeRouteCode(routeCode))?.tarifa_regular ?? null)
    .filter((fare): fare is number => typeof fare === 'number' && Number.isFinite(fare));

  if (fares.length === 0) return null;
  return fares.reduce((total, fare) => total + fare, 0);
}

function buildRouteTitle(routeCodes: string[], routeNames: (string | null)[]) {
  const routeLabels = Array.from(
    new Set(
      routeNames
        .map((routeName, index) => {
          const formattedRouteName = formatRouteName(routeName).trim();
          if (formattedRouteName && formattedRouteName !== 'Ruta disponible') {
            return formattedRouteName;
          }

          return routeCodes[index]?.trim() || null;
        })
        .filter((label): label is string => Boolean(label)),
    ),
  );

  if (routeLabels.length > 0) {
    return routeLabels.join(' luego ');
  }

  const compactCodes = Array.from(new Set(routeCodes.map((routeCode) => routeCode.trim()).filter(Boolean)));
  if (compactCodes.length > 0) {
    return compactCodes.join(' luego ');
  }

  return 'Ruta disponible';
}

function buildJourneyChainKey(journey: PlannedJourney) {
  const chainToken =
    journey.routeIds.length > 0
      ? journey.routeIds.join('>')
      : journey.legs
          .map((leg) => leg.routeId ?? leg.routeCode ?? 'sin-ruta')
          .join('>');

  return `${journey.kind}:${chainToken}`;
}

function selectDiverseJourneys(journeys: PlannedJourney[], limit = 6): PlannedJourney[] {
  if (journeys.length <= limit) {
    return [...journeys].sort((a, b) => a.score - b.score);
  }

  const sorted = [...journeys].sort((a, b) => a.score - b.score);
  const bucketsByKey = new Map<string, JourneyChainBucket>();

  sorted.forEach((journey) => {
    const key = buildJourneyChainKey(journey);
    const existing = bucketsByKey.get(key);
    if (existing) {
      existing.journeys.push(journey);
      return;
    }

    bucketsByKey.set(key, {
      key,
      journeys: [journey],
    });
  });

  const orderedBuckets = [...bucketsByKey.values()].sort(
    (a, b) => (a.journeys[0]?.score ?? 9_999) - (b.journeys[0]?.score ?? 9_999),
  );
  const selected: PlannedJourney[] = [];
  const selectedIds = new Set<string>();

  orderedBuckets.forEach((bucket) => {
    const bestJourney = bucket.journeys[0];
    if (!bestJourney || selected.length >= limit) return;
    selected.push(bestJourney);
    selectedIds.add(bestJourney.id);
  });

  if (selected.length >= limit) {
    return selected.slice(0, limit);
  }

  const leftovers = orderedBuckets
    .flatMap((bucket) => bucket.journeys.slice(1))
    .sort((a, b) => a.score - b.score);

  leftovers.forEach((journey) => {
    if (selected.length >= limit || selectedIds.has(journey.id)) return;
    selected.push(journey);
    selectedIds.add(journey.id);
  });

  return selected.slice(0, limit);
}

function buildOperatorLabel(operators: (string | null | undefined)[]) {
  const uniqueOperators = Array.from(
    new Set(operators.map((operator) => (operator ?? '').trim()).filter(Boolean)),
  );

  if (uniqueOperators.length === 0) return 'Operador local';
  if (uniqueOperators.length === 1) return uniqueOperators[0];
  return 'Operadores multiples';
}

function shouldDiscardLowValueTransferPlan(params: {
  journey: PlannedJourney;
  origin: [number, number];
  destination: [number, number];
}) {
  const { destination, journey, origin } = params;
  if (journey.kind !== 'transfer' || journey.legs.length < 2) return false;

  const metrics = computeJourneyProgressMetrics({
    journey,
    origin,
    destination,
  });

  if (metrics.straightLineDistanceMeters > 12_000) {
    return false;
  }

  const firstLegRouteText = normalizePlannerText(
    journey.legs[0]?.routeName ?? journey.legs[0]?.routeCode ?? '',
  );
  const secondLegRouteText = normalizePlannerText(
    journey.legs[1]?.routeName ?? journey.legs[1]?.routeCode ?? '',
  );
  const firstLegLooksInterurban =
    STRONG_INTERURBAN_HINTS.some((hint) => firstLegRouteText.includes(hint)) ||
    MEDIUM_INTERURBAN_HINTS.some((hint) => firstLegRouteText.includes(hint));
  const secondLegLooksLocal =
    secondLegRouteText.length > 0 &&
    !STRONG_INTERURBAN_HINTS.some((hint) => secondLegRouteText.includes(hint)) &&
    !MEDIUM_INTERURBAN_HINTS.some((hint) => secondLegRouteText.includes(hint));

  if (!firstLegLooksInterurban || !secondLegLooksLocal) {
    return false;
  }

  const transferProgressGainMeters =
    metrics.firstLegDestinationDistanceMeters !== null &&
    metrics.finalStopDestinationDistanceMeters !== null
      ? metrics.firstLegDestinationDistanceMeters - metrics.finalStopDestinationDistanceMeters
      : null;
  const firstLegAlreadyNearDestination =
    metrics.firstLegDestinationDistanceMeters !== null &&
    metrics.firstLegDestinationDistanceMeters <= Math.min(360, metrics.straightLineDistanceMeters * 0.24);
  const cleanupTransferGainIsTiny =
    transferProgressGainMeters !== null &&
    transferProgressGainMeters <= Math.max(180, metrics.straightLineDistanceMeters * 0.12);
  const secondLegDistanceMeters = computeLegSegmentDistance(journey.legs[1]);
  const secondLegIsShort =
    secondLegDistanceMeters !== null && secondLegDistanceMeters <= Math.max(1_200, metrics.straightLineDistanceMeters * 0.2);

  if (firstLegAlreadyNearDestination && secondLegIsShort) {
    return true;
  }

  if (cleanupTransferGainIsTiny && secondLegIsShort && journey.transferWalkMeters <= 120) {
    return true;
  }

  return false;
}

async function fetchNearbyPreviewStops(
  origin: [number, number],
  limit = 4,
): Promise<NearbyTransitStop[]> {
  if (!isCtpPreviewEnabled()) return [];
  if (previewTimeoutBackoffUntil > Date.now()) return [];

  const [lng, lat] = origin;
  const { data, error } = await supabase.rpc('ctp_preview_nearby_stops', {
    p_lat: lat,
    p_lng: lng,
    p_limit: Math.max(limit * 2, 6),
    p_radius_m: DEFAULT_RADIUS_METERS,
  });

  if (error) {
    if (isStatementTimeoutError(error)) {
      previewTimeoutBackoffUntil = Date.now() + PREVIEW_TIMEOUT_BACKOFF_MS;
      if (__DEV__) {
        console.warn('CTP preview nearby query timed out; backing off temporarily.', error);
      }
      return [];
    }

    if (__DEV__) {
      console.warn('CTP preview nearby query failed', error);
    }
    return [];
  }

  previewTimeoutBackoffUntil = 0;

  return ((data ?? []) as NearbyPreviewStopRow[])
    .filter(
      (row) => Number.isFinite(Number(row?.route_id)) && Number.isFinite(Number(row?.distance_m)),
    )
    .map((row) => ({
      id: row.id?.trim() || `ctp:${Number(row.route_id)}:${row.stop_name ?? 'parada'}`,
      stopName: row.stop_name?.trim() || 'Parada oficial CTP',
      routeId: Number(row.route_id),
      routeName: row.route_name?.trim() || 'Ruta oficial CTP',
      routeCode: row.route_code?.trim() || String(Number(row.route_id)),
      distanceMeters: Number(row.distance_m),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export async function findNearbyTransitStops(
  origin: [number, number],
  limit = 4,
): Promise<NearbyTransitStop[]> {
  const previewStops = await fetchNearbyPreviewStops(origin, limit);
  const nearbyRoutes = await fetchNearbyRoutesForPoint(origin);

  if (nearbyRoutes.length === 0) {
    return previewStops.slice(0, limit);
  }

  const routesWithStops = await Promise.all(
    nearbyRoutes.map(async (route) => ({
      route,
      stops: await getRouteStopsCached(route.ruta_id),
    })),
  );

  const legacyStops = routesWithStops.flatMap(({ route, stops }) =>
    stops.map((stop) => ({
      id: `${route.ruta_id}:${stop.parada_id}`,
      stopName: stop.nombre ?? 'Parada',
      routeId: route.ruta_id,
      routeName: formatRouteName(route.nombre_ruta),
      routeCode: route.codigo_ctp?.trim() || String(route.ruta_id),
      distanceMeters: haversineMeters(origin, toStopCoordinate(stop)),
    })),
  );

  const mergedStops = [...previewStops];
  const seenStops = new Set(
    previewStops.map((stop) => `${stop.routeId}:${normalizePlannerText(stop.stopName)}`),
  );

  legacyStops.forEach((stop) => {
    const stopKey = `${stop.routeId}:${normalizePlannerText(stop.stopName)}`;
    if (seenStops.has(stopKey)) return;
    seenStops.add(stopKey);
    mergedStops.push(stop);
  });

  return mergedStops.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, limit);
}
function toFiniteNumber(value: number | string | null | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStopName(value?: string | null): string {
  return value?.trim() || 'Parada de buses';
}

function buildTransferLabelFromRpc(row: JourneyRpcRow): string | null {
  const firstAlight = normalizeStopName(row.bajada_1_parada_nombre);
  const secondBoard = normalizeStopName(row.subida_2_parada_nombre);

  if (!row.ruta_2_id) return null;
  if (firstAlight === secondBoard) return `Transbordo en ${firstAlight}`;
  return `Transbordo en ${firstAlight} / ${secondBoard}`;
}

function buildJourneyIdentity(kind: PlannedJourney['kind'], legs: JourneyLeg[]) {
  const legTokens = legs.map((leg, index) => {
    const directionToken = (leg.direction ?? '').trim() || 'sin-sentido';
    const codeToken = (leg.routeCode ?? '').trim() || 'sin-codigo';
    const boardToken = leg.boardStopId ?? `board-${normalizeStopName(leg.boardStopName)}`;
    const alightToken = leg.alightStopId ?? `alight-${normalizeStopName(leg.alightStopName)}`;

    return [index + 1, leg.routeId, directionToken, codeToken, boardToken, alightToken].join(':');
  });

  return `rpc:${kind}:${legTokens.join('|')}`;
}

async function attachStopDetailsToJourneys(plans: PlannedJourney[]) {
  if (plans.length === 0) return plans;

  const stopIds = plans
    .flatMap((plan) =>
      plan.legs.flatMap((leg) => [leg.boardStopId ?? null, leg.alightStopId ?? null]),
    )
    .filter((stopId): stopId is number => typeof stopId === 'number' && Number.isFinite(stopId));

  if (stopIds.length === 0) return plans;

  const stopMap = await fetchStopsByIds(stopIds);
  if (stopMap.size === 0) return plans;

  return plans.map((plan) => ({
    ...plan,
    legs: plan.legs.map((leg) => ({
      ...leg,
      boardStop:
        leg.boardStop ?? (leg.boardStopId ? stopMap.get(leg.boardStopId) ?? undefined : undefined),
      alightStop:
        leg.alightStop ?? (leg.alightStopId ? stopMap.get(leg.alightStopId) ?? undefined : undefined),
    })),
  }));
}

export function computeJourneyProgressMetrics(params: {
  journey: PlannedJourney;
  origin: [number, number];
  destination: [number, number];
}): JourneyProgressMetrics {
  const { destination, journey, origin } = params;
  const straightLineDistanceMeters = haversineMeters(origin, destination);
  const firstLegAlightCoordinate = toOptionalStopCoordinate(journey.legs[0]?.alightStop);
  const finalLegAlightCoordinate = toOptionalStopCoordinate(journey.legs[journey.legs.length - 1]?.alightStop);
  const firstLegDestinationDistanceMeters = firstLegAlightCoordinate
    ? haversineMeters(firstLegAlightCoordinate, destination)
    : null;
  const finalStopDestinationDistanceMeters = finalLegAlightCoordinate
    ? haversineMeters(finalLegAlightCoordinate, destination)
    : null;
  const firstLegProgressMeters =
    firstLegDestinationDistanceMeters !== null
      ? straightLineDistanceMeters - firstLegDestinationDistanceMeters
      : null;
  const firstLegProgressRatio =
    firstLegProgressMeters !== null && straightLineDistanceMeters > 0
      ? firstLegProgressMeters / straightLineDistanceMeters
      : null;
  const firstLegBacktrackMeters =
    firstLegDestinationDistanceMeters !== null
      ? Math.max(0, firstLegDestinationDistanceMeters - straightLineDistanceMeters)
      : 0;
  const finalStopProgressMeters =
    finalStopDestinationDistanceMeters !== null
      ? straightLineDistanceMeters - finalStopDestinationDistanceMeters
      : null;
  const finalStopProgressRatio =
    finalStopProgressMeters !== null && straightLineDistanceMeters > 0
      ? finalStopProgressMeters / straightLineDistanceMeters
      : null;
  const finalStopBacktrackMeters =
    finalStopDestinationDistanceMeters !== null
      ? Math.max(0, finalStopDestinationDistanceMeters - straightLineDistanceMeters)
      : 0;
  const totalWalkRatio =
    straightLineDistanceMeters > 0 ? journey.totalWalkMeters / straightLineDistanceMeters : null;
  const transferWalkRatio =
    straightLineDistanceMeters > 0 ? journey.transferWalkMeters / straightLineDistanceMeters : null;

  return {
    straightLineDistanceMeters,
    firstLegDestinationDistanceMeters,
    finalStopDestinationDistanceMeters,
    firstLegProgressMeters,
    firstLegProgressRatio,
    firstLegBacktrackMeters,
    finalStopProgressMeters,
    finalStopProgressRatio,
    finalStopBacktrackMeters,
    totalWalkRatio,
    transferWalkRatio,
    hasStopGeometry: Boolean(firstLegAlightCoordinate || finalLegAlightCoordinate),
  };
}

export function computeJourneyContextPenaltyBreakdown(params: {
  journey: PlannedJourney;
  origin: [number, number] | null;
  destination: [number, number] | null;
  destinationName?: string | null;
}) {
  const { destination, destinationName, journey, origin } = params;
  const reasons: JourneyContextPenaltyReason[] = [];
  let penalty = 0;
  let metrics: JourneyProgressMetrics | null = null;
  const addPenalty = (id: string, label: string, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    penalty += amount;
    reasons.push({ id, label, penalty: amount });
  };

  if (origin && destination) {
    metrics = computeJourneyProgressMetrics({
      journey,
      origin,
      destination,
    });
    const isShortLocalTrip = metrics.straightLineDistanceMeters <= 3_000;
    const firstLegProgressRatio = metrics.firstLegProgressRatio ?? 1;
    const finalStopProgressRatio = metrics.finalStopProgressRatio ?? firstLegProgressRatio;
    const transferProgressGainRatio =
      metrics.finalStopProgressRatio !== null && metrics.firstLegProgressRatio !== null
        ? metrics.finalStopProgressRatio - metrics.firstLegProgressRatio
        : null;
    const transferProgressGainMeters =
      metrics.firstLegDestinationDistanceMeters !== null &&
      metrics.finalStopDestinationDistanceMeters !== null
        ? metrics.firstLegDestinationDistanceMeters - metrics.finalStopDestinationDistanceMeters
        : null;
    const firstLegAlreadyNearDestination =
      metrics.firstLegDestinationDistanceMeters !== null &&
      metrics.firstLegDestinationDistanceMeters <= Math.min(320, metrics.straightLineDistanceMeters * 0.22);
    const cleanupTransferGainIsTiny =
      transferProgressGainMeters !== null &&
      transferProgressGainMeters <= Math.max(140, metrics.straightLineDistanceMeters * 0.1);
    const firstLegRouteText = normalizePlannerText(
      journey.legs[0]?.routeName ?? journey.legs[0]?.routeCode ?? '',
    );
    const secondLegRouteText = normalizePlannerText(
      journey.legs[1]?.routeName ?? journey.legs[1]?.routeCode ?? '',
    );
    const firstLegLooksInterurban =
      STRONG_INTERURBAN_HINTS.some((hint) => firstLegRouteText.includes(hint)) ||
      MEDIUM_INTERURBAN_HINTS.some((hint) => firstLegRouteText.includes(hint));
    const secondLegLooksLocal =
      secondLegRouteText.length > 0 &&
      !STRONG_INTERURBAN_HINTS.some((hint) => secondLegRouteText.includes(hint)) &&
      !MEDIUM_INTERURBAN_HINTS.some((hint) => secondLegRouteText.includes(hint));

    if (metrics.straightLineDistanceMeters <= LOCAL_CONTEXT_DISTANCE_THRESHOLD_METERS) {
      if (metrics.firstLegBacktrackMeters >= 250) {
        addPenalty(
          'first-leg-backtrack-high',
          'El primer tramo se aleja demasiado del destino.',
          isShortLocalTrip ? 28 : 18,
        );
      } else if (firstLegProgressRatio < 0.08) {
        addPenalty(
          'first-leg-progress-very-low',
          'El primer tramo aporta muy poco progreso real.',
          isShortLocalTrip ? 18 : 12,
        );
      } else if (firstLegProgressRatio < 0.18) {
        addPenalty(
          'first-leg-progress-low',
          'El primer tramo avanza poco para una distancia corta.',
          isShortLocalTrip ? 10 : 6,
        );
      }

      if (metrics.finalStopBacktrackMeters >= 180) {
        addPenalty(
          'final-stop-backtrack-high',
          'La parada final se pasa y obliga a retroceder.',
          isShortLocalTrip ? 14 : 9,
        );
      } else if (finalStopProgressRatio < 0.32) {
        addPenalty(
          'final-stop-progress-very-low',
          'La bajada final queda lejos del destino.',
          isShortLocalTrip ? 12 : 8,
        );
      } else if (finalStopProgressRatio < 0.52) {
        addPenalty(
          'final-stop-progress-low',
          'La bajada final mejora, pero sigue dejando bastante caminata.',
          isShortLocalTrip ? 6 : 4,
        );
      }

      if ((metrics.totalWalkRatio ?? 0) > 0.42 && journey.totalWalkMeters >= 550) {
        addPenalty(
          'total-walk-high',
          'La caminata total es alta para este viaje.',
          isShortLocalTrip ? 8 : 5,
        );
      }

      if (journey.kind === 'direct' && firstLegProgressRatio < 0.16 && finalStopProgressRatio < 0.4) {
        addPenalty(
          'direct-progress-poor',
          'La opcion directa deja poco progreso util.',
          isShortLocalTrip ? 6 : 4,
        );
      }

      if (
        journey.kind === 'transfer' &&
        (
          firstLegProgressRatio < 0.22 ||
          (finalStopProgressRatio < 0.58 && (transferProgressGainRatio ?? 1) < 0.16) ||
          ((metrics.transferWalkRatio ?? 0) > 0.16 && journey.transferWalkMeters >= 120)
        )
      ) {
        addPenalty(
          'transfer-low-value',
          'El transbordo agrega complejidad sin una mejora clara.',
          isShortLocalTrip ? 10 : 6,
        );
      }

      if (journey.kind === 'transfer') {
        if (firstLegAlreadyNearDestination && journey.transferWalkMeters >= 50) {
          addPenalty(
            'cleanup-transfer-after-near-destination',
            'El primer bus ya te deja casi en el destino y el transbordo solo limpia unos metros.',
            isShortLocalTrip ? 22 : 12,
          );
        } else if (cleanupTransferGainIsTiny && journey.transferWalkMeters >= 60) {
          addPenalty(
            'cleanup-transfer-gain-tiny',
            'El segundo bus gana muy poco frente a la caminata adicional.',
            isShortLocalTrip ? 16 : 9,
          );
        } else if (
          transferProgressGainMeters !== null &&
          transferProgressGainMeters <= 240 &&
          journey.transferWalkMeters >= 90
        ) {
          addPenalty(
            'cleanup-transfer-gain-limited',
            'El transbordo mejora algo, pero no lo suficiente para el esfuerzo extra.',
            isShortLocalTrip ? 10 : 6,
          );
        }

        if (
          firstLegLooksInterurban &&
          secondLegLooksLocal &&
          (firstLegAlreadyNearDestination || cleanupTransferGainIsTiny)
        ) {
          addPenalty(
            'interurban-plus-local-cleanup',
            'Combina un tramo interurbano con un bus local corto cerca del final.',
            isShortLocalTrip ? 18 : 10,
          );
        }
      }
    }
  }

  const normalizedDestination = normalizePlannerText(destinationName);
  const routeText = normalizePlannerText(
    journey.legs.map((leg) => leg.routeName ?? leg.routeCode ?? '').join(' '),
  );
  const straightLineDistanceMeters =
    origin && destination ? haversineMeters(origin, destination) : null;
  const isLocalOrShortRegionalTrip = straightLineDistanceMeters !== null && straightLineDistanceMeters <= 10_000;

  STRONG_INTERURBAN_HINTS.forEach((hint) => {
    if (routeText.includes(hint) && !normalizedDestination.includes(hint)) {
      addPenalty(
        `strong-interurban-${hint}`,
        `La ruta menciona ${hint} aunque el destino no va en esa direccion.`,
        isLocalOrShortRegionalTrip ? 7 : 3,
      );
    }
  });

  MEDIUM_INTERURBAN_HINTS.forEach((hint) => {
    if (routeText.includes(hint) && !normalizedDestination.includes(hint)) {
      addPenalty(
        `medium-interurban-${hint}`,
        `La ruta se desvia hacia ${hint} sin que el destino lo pida.`,
        isLocalOrShortRegionalTrip ? 3 : 1.5,
      );
    }
  });

  return {
    totalPenalty: penalty,
    reasons,
    metrics,
  } satisfies JourneyContextPenaltyBreakdown;
}

export function computeJourneyContextPenalty(params: {
  journey: PlannedJourney;
  origin: [number, number] | null;
  destination: [number, number] | null;
  destinationName?: string | null;
}) {
  return computeJourneyContextPenaltyBreakdown(params).totalPenalty;
}

export function computeJourneyDisplayScore(params: {
  journey: PlannedJourney;
  etaWaitMinutes?: number | null;
  origin: [number, number] | null;
  destination: [number, number] | null;
  destinationName?: string | null;
}) {
  const { destination, destinationName, etaWaitMinutes = 0, journey, origin } = params;
  const contextPenalty = computeJourneyContextPenaltyBreakdown({
    journey,
    origin,
    destination,
    destinationName,
  }).totalPenalty;

  return journey.score + (etaWaitMinutes ?? 0) * 1.4 + contextPenalty;
}

function buildEmptyGeoMetrics(journey: PlannedJourney): JourneyGeoMetrics {
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
    firstLegDestinationDistanceMeters:
      journey.geoMetrics?.firstLegDestinationDistanceMeters ?? null,
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

function uniqueQualityFlags(flags: string[]) {
  return Array.from(new Set(flags.filter(Boolean)));
}

function buildWalkNetworkFlags(walkingRoute: WalkingRouteResult) {
  if (walkingRoute.status === 'unavailable') return [];
  if (walkingRoute.status === 'no_route') return ['final_walk_no_network_route'];

  const flags: string[] = [];
  if (
    walkingRoute.detourRatio !== null &&
    walkingRoute.detourRatio > WALK_NETWORK_DETOUR_RATIO_LIMIT &&
    (walkingRoute.networkDistanceMeters ?? 0) >= 700
  ) {
    flags.push('final_walk_detour_high');
  }
  if ((walkingRoute.networkDistanceMeters ?? 0) > WALK_NETWORK_SOFT_LIMIT_METERS) {
    flags.push('final_walk_network_long');
  }
  return flags;
}

function applyWalkingRouteToJourney(params: {
  journey: PlannedJourney;
  walkingRoute: WalkingRouteResult;
}) {
  const { journey, walkingRoute } = params;
  if (walkingRoute.status === 'unavailable') return journey;

  const walkNetworkPenalty = computeWalkNetworkPenalty(walkingRoute);
  const existingMetrics = buildEmptyGeoMetrics(journey);
  const networkDistanceMeters =
    walkingRoute.status === 'ok' && walkingRoute.networkDistanceMeters !== null
      ? walkingRoute.networkDistanceMeters
      : null;
  const finalWalkMeters = networkDistanceMeters ?? journey.destinationWalkMeters;
  const nextTotalWalkMeters =
    networkDistanceMeters !== null
      ? Math.max(0, journey.totalWalkMeters - journey.destinationWalkMeters + networkDistanceMeters)
      : journey.totalWalkMeters;
  const nextFlags = uniqueQualityFlags([
    ...existingMetrics.qualityFlags,
    ...buildWalkNetworkFlags(walkingRoute),
  ]);
  const confidenceDrop =
    walkingRoute.status === 'no_route' ? 0.32 : walkNetworkPenalty >= 1_500 ? 0.22 : walkNetworkPenalty > 0 ? 0.12 : 0;
  const confidenceScore =
    existingMetrics.confidenceScore !== null
      ? Math.max(0, existingMetrics.confidenceScore - confidenceDrop)
      : walkingRoute.status === 'ok'
        ? Math.max(0, 1 - confidenceDrop)
        : 0.45;
  const scoreAdjustment = (existingMetrics.scoreAdjustment ?? 0) + walkNetworkPenalty;

  return {
    ...journey,
    destinationWalkMeters: finalWalkMeters,
    totalWalkMeters: nextTotalWalkMeters,
    score: journey.score + walkNetworkPenalty,
    geoMetrics: {
      ...existingMetrics,
      confidenceScore,
      qualityFlags: nextFlags,
      scoreAdjustment,
      finalWalkMeters,
      totalWalkMeters: nextTotalWalkMeters,
      finalWalkStraightMeters: walkingRoute.straightLineMeters,
      finalWalkNetworkMeters: networkDistanceMeters,
      finalWalkNetworkMinutes: walkingRoute.networkDurationMinutes,
      walkDetourRatio: walkingRoute.detourRatio,
      walkRouteAvailable: walkingRoute.routeAvailable,
      walkNetworkPenalty,
      walkNetworkStatus: walkingRoute.status,
      finalWalkRouteCoordinates: walkingRoute.coordinates.length > 0 ? walkingRoute.coordinates : null,
    },
  } satisfies PlannedJourney;
}

function shouldDiscardIncoherentJourneyAfterWalking(params: {
  journey: PlannedJourney;
  origin: [number, number];
  destination: [number, number];
}) {
  const { destination, journey, origin } = params;
  const metrics = computeJourneyProgressMetrics({ journey, origin, destination });

  if (metrics.straightLineDistanceMeters > 12_000) return false;

  const finalStopProgressRatio = metrics.finalStopProgressRatio ?? 0;
  const firstLegBacktracksBadly =
    metrics.firstLegBacktrackMeters >= Math.max(800, metrics.straightLineDistanceMeters * 0.25);

  if (journey.kind === 'transfer' && firstLegBacktracksBadly && finalStopProgressRatio < 0.78) {
    return true;
  }

  const finalWalkNetworkMeters = journey.geoMetrics?.finalWalkNetworkMeters ?? journey.destinationWalkMeters;
  const routeText = normalizePlannerText(
    journey.legs.map((leg) => leg.routeName ?? leg.routeCode ?? '').join(' '),
  );
  const routeLooksInterurban =
    STRONG_INTERURBAN_HINTS.some((hint) => routeText.includes(hint)) ||
    MEDIUM_INTERURBAN_HINTS.some((hint) => routeText.includes(hint));

  return (
    routeLooksInterurban &&
    finalWalkNetworkMeters >= 1_500 &&
    finalStopProgressRatio < 0.7
  );
}

export function filterIncoherentJourneysAfterWalking(params: {
  journeys: PlannedJourney[];
  origin: [number, number];
  destination: [number, number];
}) {
  const { destination, journeys, origin } = params;
  const filtered = journeys.filter(
    (journey) =>
      !shouldDiscardIncoherentJourneyAfterWalking({
        journey,
        origin,
        destination,
      }),
  );

  return filtered.length > 0 ? filtered : journeys;
}

export async function applyWalkingNetworkValidationToJourneys(params: {
  destination: [number, number];
  journeys: PlannedJourney[];
}) {
  const { destination, journeys } = params;
  if (!hasWalkingNetworkProvider() || journeys.length === 0) return journeys;

  const candidates = [...journeys]
    .sort((a, b) => a.score - b.score)
    .slice(0, WALK_NETWORK_VALIDATION_LIMIT);
  const candidateIds = new Set(candidates.map((journey) => journey.id));
  const walkingAnalysesByJourneyId = new Map<string, WalkingRouteResult>();

  await Promise.all(
    candidates.map(async (journey) => {
      const finalAlightCoordinate = toOptionalStopCoordinate(
        journey.legs[journey.legs.length - 1]?.alightStop,
      );
      if (!finalAlightCoordinate) return;

      const walkingRoute = await getWalkingRoute({
        from: finalAlightCoordinate,
        to: destination,
      });
      walkingAnalysesByJourneyId.set(journey.id, walkingRoute);
    }),
  );

  return journeys
    .map((journey) => {
      if (!candidateIds.has(journey.id)) return journey;

      const walkingRoute = walkingAnalysesByJourneyId.get(journey.id);
      if (!walkingRoute) return journey;

      return applyWalkingRouteToJourney({ journey, walkingRoute });
    })
    .sort((a, b) => a.score - b.score);
}

function isStatementTimeoutError(error: { code?: string | null; message?: string | null } | null | undefined) {
  if (!error) return false;
  if (error.code === '57014') return true;
  return /statement timeout/i.test(error.message ?? '');
}

function isMissingRpcFunctionError(
  error: { code?: string | null; details?: string | null; message?: string | null } | null | undefined,
  functionPattern = /buscar_viajes_0_1_transbordo_v2/i,
) {
  if (!error) return false;
  if (error.code !== 'PGRST202') return false;

  const combinedMessage = [error.message ?? '', error.details ?? ''].join(' ');
  return functionPattern.test(combinedMessage);
}

function buildRpcRetrySequence(radioMeters: number) {
  const baseRadius = Math.max(200, Math.round(radioMeters));
  const radii = [baseRadius, ...RPC_TIMEOUT_RETRY_RADII]
    .filter((radius) => radius <= baseRadius)
    .filter((radius, index, values) => values.indexOf(radius) === index);

  return radii.map((radius, index) => ({
    radius,
    transferWalkMeters: RPC_TIMEOUT_RETRY_TRANSFER_WALKS[Math.min(index, RPC_TIMEOUT_RETRY_TRANSFER_WALKS.length - 1)],
  }));
}

function toNumericIdArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

async function resolvePlannerLocationContext(
  coords: [number, number],
): Promise<PlannerLocationContext | null> {
  const now = Date.now();
  if (isPlannerLocationContextBackedOff(now)) {
    return null;
  }

  const [lng, lat] = coords;
  const { data, error } = await supabase.rpc('planner_resolve_location_context', {
    p_lat: lat,
    p_lng: lng,
  });

  if (error) {
    if (
      isMissingRpcFunctionError(error, /planner_resolve_location_context/i) ||
      isStatementTimeoutError(error)
    ) {
      plannerLocationContextBackoffUntil = now + PLANNER_LOCATION_CONTEXT_BACKOFF_MS;
      return null;
    }

    if (__DEV__) {
      console.warn('No pudimos resolver contexto de hub/landmark para el planner.', error);
    }
    return null;
  }

  plannerLocationContextBackoffUntil = 0;

  const row = Array.isArray(data) ? (data[0] as PlannerLocationContextRow | undefined) : (data as PlannerLocationContextRow | null);
  if (!row) return null;

  const resolvedLat = Number(row.resolved_lat);
  const resolvedLng = Number(row.resolved_lng);
  if (!Number.isFinite(resolvedLat) || !Number.isFinite(resolvedLng) || !row.hub_key) {
    return null;
  }

  return {
    hubKey: row.hub_key,
    hubName: row.hub_name?.trim() || row.hub_key,
    hubType: row.hub_type ?? null,
    resolvedCoords: [resolvedLng, resolvedLat],
    radiusMeters: Number(row.radius_m) || DEFAULT_RADIUS_METERS,
    plannerRadiusOverrideMeters: Number.isFinite(Number(row.planner_radius_override_m))
      ? Number(row.planner_radius_override_m)
      : null,
    arrivalStopIds: toNumericIdArray(row.arrival_stop_ids),
    departureStopIds: toNumericIdArray(row.departure_stop_ids),
  };
}

async function resolvePlannerServiceGroupCandidates(
  origin: [number, number],
  destination: [number, number],
): Promise<PlannerServiceGroupCandidate[]> {
  const now = Date.now();
  if (isPlannerServiceGroupBackedOff(now)) {
    return [];
  }

  const [originLng, originLat] = origin;
  const [destinationLng, destinationLat] = destination;
  const { data, error } = await supabase.rpc('planner_resolve_service_group_candidates', {
    p_origin_lat: originLat,
    p_origin_lng: originLng,
    p_destination_lat: destinationLat,
    p_destination_lng: destinationLng,
  });

  if (error) {
    if (
      isMissingRpcFunctionError(error, /planner_resolve_service_group_candidates/i) ||
      isStatementTimeoutError(error)
    ) {
      plannerServiceGroupBackoffUntil = now + PLANNER_SERVICE_GROUP_BACKOFF_MS;
      return [];
    }

    if (__DEV__) {
      console.warn('No pudimos resolver grupos de servicio del planner.', error);
    }
    return [];
  }

  plannerServiceGroupBackoffUntil = 0;

  const rows = Array.isArray(data) ? (data as PlannerServiceGroupCandidateRow[]) : [];
  return rows
    .map((row) => {
      const groupKey = row.group_key?.trim();
      const groupName = row.group_name?.trim();
      const memberLabel = row.member_label?.trim();
      const effectivePriority = Number(row.effective_priority);

      if (!groupKey || !groupName || !memberLabel || !Number.isFinite(effectivePriority)) {
        return null;
      }

      const productRouteId = Number(row.product_route_id);
      const previewRouteId = Number(row.preview_route_id);
      const memberPriority = Number(row.member_priority);
      const directnessRank = Number(row.directness_rank);

      return {
        originHubKey: row.origin_hub_key?.trim() || null,
        destinationHubKey: row.destination_hub_key?.trim() || null,
        groupKey,
        groupName,
        routeCode: row.route_code?.trim() || null,
        productRouteId: Number.isFinite(productRouteId) ? productRouteId : null,
        previewRouteId: Number.isFinite(previewRouteId) ? previewRouteId : null,
        variantFamilyCode: row.variant_family_code?.trim() || null,
        variantCode: row.variant_code?.trim() || null,
        memberLabel,
        memberPriority: Number.isFinite(memberPriority) ? memberPriority : 100,
        directnessRank: Number.isFinite(directnessRank) ? directnessRank : 100,
        effectivePriority,
        metadata: row.metadata ?? null,
      } satisfies PlannerServiceGroupCandidate;
    })
    .filter((candidate): candidate is PlannerServiceGroupCandidate => Boolean(candidate));
}

async function applyPlannerServiceGroupBias(params: {
  journeys: PlannedJourney[];
  origin: [number, number];
  destination: [number, number];
}) {
  const { destination, journeys, origin } = params;
  if (journeys.length === 0) return journeys;

  const candidates = await resolvePlannerServiceGroupCandidates(origin, destination);
  if (candidates.length === 0) return journeys;

  const bestByRouteId = new Map<number, PlannerServiceGroupCandidate>();
  candidates.forEach((candidate) => {
    const routeIds = [candidate.productRouteId, candidate.previewRouteId].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );

    routeIds.forEach((routeId) => {
      const existing = bestByRouteId.get(routeId);
      if (!existing || candidate.effectivePriority < existing.effectivePriority) {
        bestByRouteId.set(routeId, candidate);
      }
    });
  });

  let touched = false;
  const biasedJourneys = journeys.map((journey) => {
    const matchingCandidates = journey.routeIds
      .map((routeId) => bestByRouteId.get(routeId))
      .filter((candidate): candidate is PlannerServiceGroupCandidate => Boolean(candidate))
      .sort((a, b) => a.effectivePriority - b.effectivePriority);

    const bestCandidate = matchingCandidates[0];
    if (!bestCandidate) {
      return journey;
    }

    const candidateRouteIds = [bestCandidate.productRouteId, bestCandidate.previewRouteId].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );
    const matchedLegIndex = journey.legs.findIndex((leg) => candidateRouteIds.includes(leg.routeId));
    const metrics = computeJourneyProgressMetrics({
      journey,
      origin,
      destination,
    });
    const transferProgressGainMeters =
      metrics.firstLegDestinationDistanceMeters !== null &&
      metrics.finalStopDestinationDistanceMeters !== null
        ? metrics.firstLegDestinationDistanceMeters - metrics.finalStopDestinationDistanceMeters
        : null;
    const firstLegAlreadyNearDestination =
      metrics.firstLegDestinationDistanceMeters !== null &&
      metrics.firstLegDestinationDistanceMeters <= Math.min(320, metrics.straightLineDistanceMeters * 0.22);
    const cleanupTransferGainIsTiny =
      transferProgressGainMeters !== null &&
      transferProgressGainMeters <= Math.max(140, metrics.straightLineDistanceMeters * 0.1);
    const firstLegRouteText = normalizePlannerText(
      journey.legs[0]?.routeName ?? journey.legs[0]?.routeCode ?? '',
    );
    const firstLegLooksInterurban =
      STRONG_INTERURBAN_HINTS.some((hint) => firstLegRouteText.includes(hint)) ||
      MEDIUM_INTERURBAN_HINTS.some((hint) => firstLegRouteText.includes(hint));

    let biasMultiplier = 1;
    if (journey.kind === 'transfer' && matchedLegIndex > 0) {
      biasMultiplier = 0.4;

      if (
        firstLegLooksInterurban &&
        (firstLegAlreadyNearDestination || cleanupTransferGainIsTiny)
      ) {
        biasMultiplier = 0;
      }
    }

    const baseBoost = Math.max(
      6,
      Math.round((180 - Math.min(bestCandidate.effectivePriority, 160)) / 4),
    );
    const directnessBoost = Math.max(
      0,
      12 - Math.round(Math.min(bestCandidate.directnessRank, 60) / 6),
    );
    const totalBoost = Math.round((baseBoost + directnessBoost) * biasMultiplier);
    if (totalBoost <= 0) {
      return journey;
    }

    const biasedScore = Math.max(0, journey.score - totalBoost);
    if (biasedScore !== journey.score) {
      touched = true;
    }

    return {
      ...journey,
      score: biasedScore,
    };
  });

  if (!touched) return journeys;
  return biasedJourneys.sort((a, b) => a.score - b.score);
}

function buildJourneyFromRpcRow(row: JourneyRpcRow): PlannedJourney | null {
  const primaryRouteId = toNullableNumber(row.ruta_1_id);
  if (!primaryRouteId) return null;

  const kind: PlannedJourney['kind'] = row.tipo_viaje === 'transbordo' || toFiniteNumber(row.transbordos) > 0
    ? 'transfer'
    : 'direct';
  const route2Id = toNullableNumber(row.ruta_2_id);
  const legOne: JourneyLeg = {
    routeId: primaryRouteId,
    routeName: row.ruta_1_nombre ?? null,
    routeCode: row.ruta_1_codigo?.trim() || null,
    operator: row.ruta_1_operador ?? null,
    direction: row.sentido_1 ?? null,
    boardStopId: toNullableNumber(row.subida_1_parada_id),
    boardStopName: normalizeStopName(row.subida_1_parada_nombre),
    alightStopId: toNullableNumber(row.bajada_1_parada_id),
    alightStopName: normalizeStopName(row.bajada_1_parada_nombre),
    scheduledWaitMinutes: toNullableNumber(row.espera_1_min),
    scheduledFrequencyMinutes: toNullableNumber(row.frecuencia_1_min),
  };

  const legs: JourneyLeg[] = [legOne];
  if (kind === 'transfer' && route2Id) {
    legs.push({
      routeId: route2Id,
      routeName: row.ruta_2_nombre ?? null,
      routeCode: row.ruta_2_codigo?.trim() || null,
      operator: row.ruta_2_operador ?? null,
      direction: row.sentido_2 ?? null,
      boardStopId: toNullableNumber(row.subida_2_parada_id),
      boardStopName: normalizeStopName(row.subida_2_parada_nombre),
      alightStopId: toNullableNumber(row.bajada_2_parada_id),
      alightStopName: normalizeStopName(row.bajada_2_parada_nombre),
      scheduledWaitMinutes: toNullableNumber(row.espera_2_min),
      scheduledFrequencyMinutes: toNullableNumber(row.frecuencia_2_min),
    });
  }

  const routeCodesByLeg = legs.map((leg) => leg.routeCode?.trim() || '');
  const routeCodes = routeCodesByLeg.filter(Boolean);
  const routeIds = legs.map((leg) => leg.routeId);
  const routeName = kind === 'transfer'
    ? buildRouteTitle(routeCodesByLeg, legs.map((leg) => leg.routeName))
    : row.ruta_1_nombre ?? null;
  const routeCode = routeCodes.length > 1 ? routeCodes.join(' + ') : routeCodes[0] ?? null;
  const originWalkMeters = toFiniteNumber(row.subida_1_distancia_m);
  const destinationWalkMeters = toFiniteNumber(row.destino_distancia_final_m);
  const transferWalkMeters = kind === 'transfer' ? toFiniteNumber(row.transbordo_distancia_m) : 0;
  const totalWalkMeters = toFiniteNumber(
    row.caminata_total_m,
    originWalkMeters + destinationWalkMeters + transferWalkMeters,
  );
  const totalFare = toNullableNumber(row.tarifa_total);
  const boardStopName = normalizeStopName(row.subida_1_parada_nombre);
  const dropStopName = kind === 'transfer'
    ? normalizeStopName(row.bajada_2_parada_nombre)
    : normalizeStopName(row.bajada_1_parada_nombre);
  const transferLabel = kind === 'transfer' ? buildTransferLabelFromRpc(row) : null;
  const journeyIdentity = buildJourneyIdentity(kind, legs);

  return {
    id: journeyIdentity,
    kind,
    routeId: primaryRouteId,
    routeName,
    routeCode,
    operatorLabel: buildOperatorLabel(legs.map((leg) => leg.operator)),
    routeIds,
    routeCodes,
    legs,
    originWalkMeters,
    destinationWalkMeters,
    transferWalkMeters,
    totalWalkMeters,
    totalFare,
    score: toFiniteNumber(row.score, 9_999),
    boardStopName,
    dropStopName,
    transferLabel,
  };
}

async function fetchJourneyPlansFromRpc(params: {
  origin: [number, number];
  destination: [number, number];
  radioMeters: number;
}): Promise<PlannedJourney[] | null> {
  const now = Date.now();
  if (isRpcPlannerBackedOff(now)) {
    return null;
  }

  const { destination, origin, radioMeters } = params;
  const [originLng, originLat] = origin;
  const destinationContext = await resolvePlannerLocationContext(destination);
  const [effectiveDestinationLng, effectiveDestinationLat] = destinationContext?.resolvedCoords ?? destination;
  const retrySequence = buildRpcRetrySequence(radioMeters);

  for (let attemptIndex = 0; attemptIndex < retrySequence.length; attemptIndex += 1) {
    const attempt = retrySequence[attemptIndex];
    const destinationRadius = Math.max(
      attempt.radius,
      destinationContext?.radiusMeters ?? 0,
      destinationContext?.plannerRadiusOverrideMeters ?? 0,
    );
    const { data, error } = await supabase.rpc('buscar_viajes_0_1_transbordo_v2', {
      p_origen_lat: originLat,
      p_origen_lng: originLng,
      p_destino_lat: effectiveDestinationLat,
      p_destino_lng: effectiveDestinationLng,
      p_radio_origen_m: attempt.radius,
      p_radio_destino_m: destinationRadius,
      p_max_caminar_transbordo_m: attempt.transferWalkMeters,
      p_max_resultados: 12,
      p_sentido: null,
      p_fecha_hora: new Date().toISOString(),
      p_es_feriado: false,
      p_espera_default_min: 12,
    });

    if (error) {
      if (isMissingRpcFunctionError(error)) {
        rpcMissingBackoffUntil = Date.now() + RPC_MISSING_BACKOFF_MS;
        if (__DEV__) {
          console.warn('RPC planner no existe en este proyecto; usando planner legacy temporalmente.');
        }
        return null;
      }

      if (isStatementTimeoutError(error)) {
        if (attemptIndex < retrySequence.length - 1) {
          console.warn(
            `RPC timeout buscando itinerarios; reintentando con radio ${retrySequence[attemptIndex + 1].radius}m`,
          );
          continue;
        }

        rpcTimeoutBackoffUntil = Date.now() + RPC_TIMEOUT_BACKOFF_MS;
        console.warn('RPC timeout persistente; usando planner local temporalmente.');
        return null;
      }

      console.error('Error cargando itinerarios desde RPC:', error);
      return null;
    }

    rpcTimeoutBackoffUntil = 0;
    rpcMissingBackoffUntil = 0;

    const plans = ((data ?? []) as JourneyRpcRow[])
      .map(buildJourneyFromRpcRow)
      .filter((plan): plan is PlannedJourney => Boolean(plan));

    const bestByChain = new Map<string, PlannedJourney>();
    plans.forEach((plan) => {
      const dedupeKey = `${plan.routeIds.join('>')}|${plan.boardStopName}|${plan.dropStopName}|${
        plan.transferLabel ?? ''
      }`;
      const existing = bestByChain.get(dedupeKey);
      if (!existing || plan.score < existing.score) {
        bestByChain.set(dedupeKey, plan);
      }
    });

    const dedupedPlans = [...bestByChain.values()].sort((a, b) => a.score - b.score).slice(0, 12);

    try {
      return await attachStopDetailsToJourneys(dedupedPlans);
    } catch (attachError) {
      console.error('No pudimos enriquecer paradas del itinerario RPC; devolviendo plan base.', attachError);
      return dedupedPlans;
    }
  }

  return null;
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  );
}

function sanitizeCoordinateSequence(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isCoordinatePair)
    .map((pair) => [Number(pair[0]), Number(pair[1])] as [number, number]);
}

function parsePreviewRouteGeometry(value: unknown): [number, number][][] {
  if (!value || typeof value !== 'object') return [];

  const geometry = value as PreviewRouteGeometry;
  if (geometry?.type === 'LineString') {
    const line = sanitizeCoordinateSequence(geometry.coordinates);
    return line.length >= 2 ? [line] : [];
  }

  if (geometry?.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .map((segment) => sanitizeCoordinateSequence(segment))
      .filter((segment) => segment.length >= 2);
  }

  return [];
}

async function fetchPreviewRouteTrajectory(routeId: number): Promise<[number, number][][]> {
  if (!isCtpPreviewEnabled()) return [];

  const { data, error } = await supabase.rpc('ctp_preview_route_geometry', {
    p_ruta_id: routeId,
  });

  if (error || !data) return [];

  try {
    const geometry = typeof data === 'string' ? JSON.parse(data) : data;
    return parsePreviewRouteGeometry(geometry);
  } catch {
    return [];
  }
}

async function planJourneysLegacy(params: {
  origin: [number, number];
  destination: [number, number];
  radioMeters?: number;
}): Promise<PlannedJourney[]> {
  const { destination, origin, radioMeters = DEFAULT_RADIUS_METERS } = params;
  const [directRoutes, originRoutes, destinationRoutes] = await Promise.all([
    fetchDirectRoutes(origin, destination, radioMeters),
    fetchNearbyRoutesForPoint(origin, radioMeters),
    fetchNearbyRoutesForPoint(destination, radioMeters),
  ]);

  if (__DEV__) {
    console.warn(
      `Legacy planner radio=${radioMeters}m direct=${directRoutes.length} origin=${originRoutes.length} destination=${destinationRoutes.length}`,
    );
  }

  const routeCatalog = new Map<number, NearbyRoute>();
  [...directRoutes, ...originRoutes, ...destinationRoutes].forEach((route) => {
    if (!routeCatalog.has(route.ruta_id)) routeCatalog.set(route.ruta_id, route);
  });

  const routeEntries = [...routeCatalog.values()];
  if (routeEntries.length === 0) return [];

  const routeStopsEntries = await Promise.all(
    routeEntries.map(async (route) => ({
      route,
      stops: await getRouteStopsCached(route.ruta_id),
    })),
  );
  const stopsByRoute = new Map(routeStopsEntries.map((entry) => [entry.route.ruta_id, entry.stops]));
  const fareMap = await fetchFareMap(
    routeEntries.map((route) => route.codigo_ctp).filter((code): code is string => Boolean(code)),
  );

  const directPlans: PlannedJourney[] = [];

  directRoutes.forEach((route) => {
    const routeStops = stopsByRoute.get(route.ruta_id) ?? [];
    if (routeStops.length === 0) return;

    const orderedStopPair = pickOrderedDirectStopPair({
      stops: routeStops,
      origin,
      destination,
    });
    const boardStop = orderedStopPair?.boardStop ?? null;
    const dropStop = orderedStopPair?.dropStop ?? null;

    if (!boardStop || !dropStop) {
      const fallbackBoardStop = findNearestStop(routeStops, origin);
      const fallbackDropStop = findNearestStop(routeStops, destination);
      if (!fallbackBoardStop || !fallbackDropStop) return;

      directPlans.push({
        id: `direct:${route.ruta_id}`,
        kind: 'direct',
        routeId: route.ruta_id,
        routeName: route.nombre_ruta,
        routeCode: route.codigo_ctp?.trim() || null,
        operatorLabel: buildOperatorLabel([route.operador]),
        routeIds: [route.ruta_id],
        routeCodes: route.codigo_ctp?.trim() ? [route.codigo_ctp.trim()] : [],
        legs: [
          {
            routeId: route.ruta_id,
            routeName: route.nombre_ruta,
            routeCode: route.codigo_ctp?.trim() || null,
            operator: route.operador,
            boardStopId: fallbackBoardStop.stop.parada_id,
            boardStopName: fallbackBoardStop.stop.nombre ?? 'Parada cercana',
            alightStopId: fallbackDropStop.stop.parada_id,
            alightStopName: fallbackDropStop.stop.nombre ?? 'Parada de llegada',
            boardStop: fallbackBoardStop.stop,
            alightStop: fallbackDropStop.stop,
          },
        ],
        originWalkMeters: fallbackBoardStop.distanceMeters,
        destinationWalkMeters: fallbackDropStop.distanceMeters,
        transferWalkMeters: 0,
        totalWalkMeters: fallbackBoardStop.distanceMeters + fallbackDropStop.distanceMeters,
        totalFare: calculateJourneyFare(
          route.codigo_ctp?.trim() ? [route.codigo_ctp.trim()] : [],
          fareMap,
        ),
        score:
          walkMinutesFromMeters(fallbackBoardStop.distanceMeters + fallbackDropStop.distanceMeters) * 5 +
          (calculateJourneyFare(route.codigo_ctp?.trim() ? [route.codigo_ctp.trim()] : [], fareMap)
            ? (calculateJourneyFare(route.codigo_ctp?.trim() ? [route.codigo_ctp.trim()] : [], fareMap) ?? 0) / 120
            : 0) +
          haversineMeters(
            toStopCoordinate(fallbackBoardStop.stop),
            toStopCoordinate(fallbackDropStop.stop),
          ) / 2500,
        boardStopName: fallbackBoardStop.stop.nombre ?? 'Parada cercana',
        dropStopName: fallbackDropStop.stop.nombre ?? 'Parada de llegada',
        transferLabel: null,
      });
      return;
    }

    const routeTripMeters = haversineMeters(toStopCoordinate(boardStop.stop), toStopCoordinate(dropStop.stop));
    if (
      boardStop.stop.parada_id === dropStop.stop.parada_id &&
      haversineMeters(origin, destination) > MIN_MEANINGFUL_TRIP_METERS
    ) {
      return;
    }

    const routeCodes = route.codigo_ctp?.trim() ? [route.codigo_ctp.trim()] : [];
    const totalFare = calculateJourneyFare(routeCodes, fareMap);
    const totalWalkMeters = boardStop.distanceMeters + dropStop.distanceMeters;
    const score =
      walkMinutesFromMeters(totalWalkMeters) * 5 +
      (totalFare ? totalFare / 120 : 0) +
      routeTripMeters / 2500;

    directPlans.push({
      id: `direct:${route.ruta_id}`,
      kind: 'direct',
      routeId: route.ruta_id,
      routeName: route.nombre_ruta,
      routeCode: route.codigo_ctp?.trim() || null,
      operatorLabel: buildOperatorLabel([route.operador]),
      routeIds: [route.ruta_id],
      routeCodes,
      legs: [
        {
          routeId: route.ruta_id,
          routeName: route.nombre_ruta,
          routeCode: route.codigo_ctp?.trim() || null,
          operator: route.operador,
          boardStopId: boardStop.stop.parada_id,
          boardStopName: boardStop.stop.nombre ?? 'Parada cercana',
          alightStopId: dropStop.stop.parada_id,
          alightStopName: dropStop.stop.nombre ?? 'Parada de llegada',
          boardStop: boardStop.stop,
          alightStop: dropStop.stop,
        },
      ],
      originWalkMeters: boardStop.distanceMeters,
      destinationWalkMeters: dropStop.distanceMeters,
      transferWalkMeters: 0,
      totalWalkMeters,
      totalFare,
      score,
      boardStopName: boardStop.stop.nombre ?? 'Parada cercana',
      dropStopName: dropStop.stop.nombre ?? 'Parada de llegada',
      transferLabel: null,
    });
  });

  const transferPlans: PlannedJourney[] = [];
  const destinationById = new Map(destinationRoutes.map((route) => [route.ruta_id, route]));

  originRoutes.forEach((originRoute) => {
    const originStops = stopsByRoute.get(originRoute.ruta_id) ?? [];
    if (originStops.length === 0) return;

    const boardCandidates = rankStopsByDistance(originStops, origin, {
      limit: Math.min(5, originStops.length),
    });
    if (boardCandidates.length === 0) return;

    destinationRoutes.forEach((destinationRoute) => {
      if (destinationRoute.ruta_id === originRoute.ruta_id) return;

      const destinationStops = stopsByRoute.get(destinationRoute.ruta_id) ?? [];
      if (destinationStops.length === 0) return;

      const finalCandidates = rankStopsByDistance(destinationStops, destination, {
        limit: Math.min(8, destinationStops.length),
      });
      if (finalCandidates.length === 0) return;

      boardCandidates.forEach((boardStop) => {
        finalCandidates.forEach((finalStop) => {
          const transferPair = pickTransferPair(
            originStops,
            destinationStops,
            boardStop,
            finalStop,
          );
          if (!transferPair) return;

          const routeCodes = [
            originRoute.codigo_ctp?.trim() || '',
            destinationRoute.codigo_ctp?.trim() || '',
          ].filter(Boolean);
          const totalFare = calculateJourneyFare(routeCodes, fareMap);
          const totalWalkMeters =
            boardStop.distanceMeters +
            finalStop.distanceMeters +
            transferPair.transferWalkMeters;
          const routeTravelMeters =
            haversineMeters(
              toStopCoordinate(boardStop.stop),
              toStopCoordinate(transferPair.originTransferStop),
            ) +
            haversineMeters(
              toStopCoordinate(transferPair.destinationTransferStop),
              toStopCoordinate(finalStop.stop),
            );
          const score =
            walkMinutesFromMeters(totalWalkMeters) * 5 +
            9 +
            walkMinutesFromMeters(transferPair.transferWalkMeters) * 2 +
            (totalFare ? totalFare / 120 : 0) +
            routeTravelMeters / 2800;
          const transferName =
            transferPair.originTransferStop.nombre &&
            transferPair.destinationTransferStop.nombre &&
            transferPair.originTransferStop.nombre === transferPair.destinationTransferStop.nombre
              ? transferPair.originTransferStop.nombre
              : `${transferPair.originTransferStop.nombre ?? 'Parada'} / ${
                  transferPair.destinationTransferStop.nombre ?? 'Parada'
                }`;

          const candidatePlan: PlannedJourney = {
            id: `transfer:${originRoute.ruta_id}:${destinationRoute.ruta_id}:${transferPair.originTransferStop.parada_id}:${transferPair.destinationTransferStop.parada_id}:${boardStop.stop.parada_id}:${finalStop.stop.parada_id}`,
            kind: 'transfer',
            routeId: originRoute.ruta_id,
            routeName: buildRouteTitle(
              routeCodes,
              [originRoute.nombre_ruta, destinationRoute.nombre_ruta],
            ),
            routeCode:
              routeCodes.length > 1 ? routeCodes.join(' + ') : routeCodes[0] ?? null,
            operatorLabel: buildOperatorLabel([
              originRoute.operador,
              destinationById.get(destinationRoute.ruta_id)?.operador,
            ]),
            routeIds: [originRoute.ruta_id, destinationRoute.ruta_id],
            routeCodes,
            legs: [
              {
                routeId: originRoute.ruta_id,
                routeName: originRoute.nombre_ruta,
                routeCode: originRoute.codigo_ctp?.trim() || null,
                operator: originRoute.operador,
                boardStopId: boardStop.stop.parada_id,
                boardStopName: boardStop.stop.nombre ?? 'Parada cercana',
                alightStopId: transferPair.originTransferStop.parada_id,
                alightStopName: transferPair.originTransferStop.nombre ?? 'Parada de transferencia',
                boardStop: boardStop.stop,
                alightStop: transferPair.originTransferStop,
              },
              {
                routeId: destinationRoute.ruta_id,
                routeName: destinationRoute.nombre_ruta,
                routeCode: destinationRoute.codigo_ctp?.trim() || null,
                operator: destinationRoute.operador,
                boardStopId: transferPair.destinationTransferStop.parada_id,
                boardStopName: transferPair.destinationTransferStop.nombre ?? 'Parada de transferencia',
                alightStopId: finalStop.stop.parada_id,
                alightStopName: finalStop.stop.nombre ?? 'Parada de llegada',
                boardStop: transferPair.destinationTransferStop,
                alightStop: finalStop.stop,
              },
            ],
            originWalkMeters: boardStop.distanceMeters,
            destinationWalkMeters: finalStop.distanceMeters,
            transferWalkMeters: transferPair.transferWalkMeters,
            totalWalkMeters,
            totalFare,
            score,
            boardStopName: boardStop.stop.nombre ?? 'Parada cercana',
            dropStopName: finalStop.stop.nombre ?? 'Parada de llegada',
            transferLabel: `Transbordo en ${transferName}`,
          };

          if (
            shouldDiscardLowValueTransferPlan({
              journey: candidatePlan,
              origin,
              destination,
            })
          ) {
            return;
          }

          transferPlans.push(candidatePlan);
        });
      });
    });
  });

  const allPlans = [...directPlans, ...transferPlans];
  const bestByChain = new Map<string, PlannedJourney>();

  allPlans.forEach((plan) => {
    const dedupeKey = `${plan.routeIds.join('>')}|${plan.boardStopName}|${plan.dropStopName}|${
      plan.transferLabel ?? ''
    }`;
    const existing = bestByChain.get(dedupeKey);
    if (!existing || plan.score < existing.score) {
      bestByChain.set(dedupeKey, plan);
    }
  });

  return [...bestByChain.values()].sort((a, b) => a.score - b.score).slice(0, 16);
}

async function planJourneysLegacyWithRetry(params: {
  origin: [number, number];
  destination: [number, number];
  radioMeters?: number;
}) {
  const baseRadius = Math.max(300, Math.round(params.radioMeters ?? DEFAULT_RADIUS_METERS));
  const retryRadii = [baseRadius, ...LEGACY_RETRY_RADII]
    .filter((radius) => radius >= baseRadius || radius === baseRadius)
    .filter((radius, index, values) => values.indexOf(radius) === index);

  for (const radius of retryRadii) {
    const plans = await planJourneysLegacy({
      origin: params.origin,
      destination: params.destination,
      radioMeters: radius,
    });

    if (plans.length > 0) {
      if (__DEV__ && radius !== baseRadius) {
        console.warn(`Legacy planner encontro itinerarios ampliando radio a ${radius}m.`);
      }
      return plans;
    }
  }

  return [];
}

export async function planJourneys(params: {
  origin: [number, number];
  destination: [number, number];
  radioMeters?: number;
}): Promise<PlannedJourney[]> {
  const { radioMeters = DEFAULT_RADIUS_METERS } = params;
  const rpcPlans = await fetchJourneyPlansFromRpc({
    origin: params.origin,
    destination: params.destination,
    radioMeters,
  });

  if (rpcPlans && rpcPlans.length > 0) {
    if (__DEV__) {
      console.warn('RPC planner devolvio itinerarios; omitiendo complemento legacy para priorizar paradas reales.');
    }

    const biasedJourneys = await applyPlannerServiceGroupBias({
      journeys: rpcPlans,
      origin: params.origin,
      destination: params.destination,
    });
    return selectDiverseJourneys(biasedJourneys, 6);
  }

  if (rpcPlans && rpcPlans.length === 0) {
    if (shouldAllowLegacyFallbackOnEmptyRpc()) {
      if (__DEV__) {
        console.warn('RPC moderna sin cobertura para este corredor en Prueba; usando legacy temporalmente.');
      }
      const legacyPlans = await planJourneysLegacyWithRetry(params);
      const biasedJourneys = await applyPlannerServiceGroupBias({
        journeys: legacyPlans,
        origin: params.origin,
        destination: params.destination,
      });
      return selectDiverseJourneys(biasedJourneys, 6);
    }

    console.warn('RPC planner no devolvio itinerarios; omitiendo fallback legacy para evitar sugerencias basadas en la ruta.');
    return [];
  }

  if (__DEV__ && !isRpcPlannerBackedOff()) {
    console.warn('RPC planner no disponible; usando planner legacy como fallback temporal.');
  }
  const legacyPlans = await planJourneysLegacyWithRetry(params);
  const biasedJourneys = await applyPlannerServiceGroupBias({
    journeys: legacyPlans,
    origin: params.origin,
    destination: params.destination,
  });
  return selectDiverseJourneys(biasedJourneys, 6);
}

export async function getRouteTrajectory(routeId: number): Promise<[number, number][][]> {
  const cached = trajectoryCache.get(routeId);
  if (cached) return cached;

  const request = (async () => {
    const previewSegments = await fetchPreviewRouteTrajectory(routeId);
    if (previewSegments.length > 0) {
      return previewSegments;
    }

    const { data, error } = await supabase
      .from('ruta_puntos')
      .select('lat, lng, segmento_id, orden')
      .eq('ruta_id', routeId)
      .order('segmento_id', { ascending: true })
      .order('orden', { ascending: true });

    if (error || !data?.length) return [];

    const points = data as RoutePointRow[];
    const maxJump = 0.05;
    const segments: [number, number][][] = [];
    let currentSegment: [number, number][] = [];
    let lastSegmentId = points[0].segmento_id;
    let lastLat = points[0].lat;
    let lastLng = points[0].lng;

    points.forEach((point) => {
      const dLat = Math.abs(point.lat - lastLat);
      const dLng = Math.abs(point.lng - lastLng);
      const jumped = dLat > maxJump || dLng > maxJump;
      const segmentChanged = point.segmento_id !== lastSegmentId;

      if ((jumped || segmentChanged) && currentSegment.length >= 2) {
        segments.push(currentSegment);
        currentSegment = [];
      }

      currentSegment.push([point.lng, point.lat]);
      lastLat = point.lat;
      lastLng = point.lng;
      lastSegmentId = point.segmento_id;
    });

    if (currentSegment.length >= 2) {
      segments.push(currentSegment);
    }

    return segments;
  })();

  trajectoryCache.set(routeId, request);
  return request;
}

export async function getActualRouteStops(routeId: number) {
  return getRouteStopsCached(routeId);
}
