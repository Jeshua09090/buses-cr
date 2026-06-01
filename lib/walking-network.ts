export type WalkingCoordinate = [number, number];

export type WalkingRouteStatus = 'ok' | 'no_route' | 'unavailable';

export type WalkingRouteResult = {
  provider: 'mapbox';
  status: WalkingRouteStatus;
  routeAvailable: boolean;
  straightLineMeters: number;
  networkDistanceMeters: number | null;
  networkDurationMinutes: number | null;
  detourRatio: number | null;
  coordinates: WalkingCoordinate[];
  failureReason: string | null;
};

type MapboxRouteResponse = {
  code?: string;
  message?: string;
  routes?: {
    distance?: number;
    duration?: number;
    geometry?: {
      coordinates?: unknown;
      type?: string;
    };
  }[];
};

const MAPBOX_WALKING_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
const WALKING_ROUTE_TIMEOUT_MS = 5500;
const walkingRouteCache = new Map<string, Promise<WalkingRouteResult>>();

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function walkingHaversineMeters(from: WalkingCoordinate, to: WalkingCoordinate) {
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

export function hasWalkingNetworkProvider() {
  return MAPBOX_WALKING_TOKEN.trim().length > 0;
}

function roundCoordinate(coordinate: WalkingCoordinate) {
  return `${coordinate[0].toFixed(5)},${coordinate[1].toFixed(5)}`;
}

function buildCacheKey(from: WalkingCoordinate, to: WalkingCoordinate) {
  return `${roundCoordinate(from)}>${roundCoordinate(to)}`;
}

function sanitizeCoordinates(value: unknown): WalkingCoordinate[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (coordinate): coordinate is [unknown, unknown] =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        Number.isFinite(Number(coordinate[0])) &&
        Number.isFinite(Number(coordinate[1])),
    )
    .map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])] as WalkingCoordinate);
}

function buildUnavailableResult(params: {
  failureReason: string;
  from: WalkingCoordinate;
  to: WalkingCoordinate;
}): WalkingRouteResult {
  const straightLineMeters = walkingHaversineMeters(params.from, params.to);

  return {
    provider: 'mapbox',
    status: 'unavailable',
    routeAvailable: false,
    straightLineMeters,
    networkDistanceMeters: null,
    networkDurationMinutes: null,
    detourRatio: null,
    coordinates: [],
    failureReason: params.failureReason,
  };
}

function buildNoRouteResult(params: {
  failureReason: string;
  from: WalkingCoordinate;
  to: WalkingCoordinate;
}): WalkingRouteResult {
  const straightLineMeters = walkingHaversineMeters(params.from, params.to);

  return {
    provider: 'mapbox',
    status: 'no_route',
    routeAvailable: false,
    straightLineMeters,
    networkDistanceMeters: null,
    networkDurationMinutes: null,
    detourRatio: null,
    coordinates: [],
    failureReason: params.failureReason,
  };
}

async function fetchWithTimeout(url: string) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), WALKING_ROUTE_TIMEOUT_MS) : null;

  try {
    return await fetch(url, controller ? { signal: controller.signal } : undefined);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function requestMapboxWalkingRoute(
  from: WalkingCoordinate,
  to: WalkingCoordinate,
): Promise<WalkingRouteResult> {
  if (!hasWalkingNetworkProvider()) {
    return buildUnavailableResult({
      from,
      to,
      failureReason: 'missing-mapbox-token',
    });
  }

  const straightLineMeters = walkingHaversineMeters(from, to);
  if (straightLineMeters <= 8) {
    return {
      provider: 'mapbox',
      status: 'ok',
      routeAvailable: true,
      straightLineMeters,
      networkDistanceMeters: 0,
      networkDurationMinutes: 0,
      detourRatio: 1,
      coordinates: [from, to],
      failureReason: null,
    };
  }

  const searchParams = new URLSearchParams({
    access_token: MAPBOX_WALKING_TOKEN,
    alternatives: 'false',
    geometries: 'geojson',
    overview: 'full',
    steps: 'false',
  });
  const coordinates = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?${searchParams.toString()}`;

  try {
    const response = await fetchWithTimeout(url);
    const payload = (await response.json().catch(() => null)) as MapboxRouteResponse | null;

    if (!response.ok) {
      return buildUnavailableResult({
        from,
        to,
        failureReason: payload?.message ?? `http-${response.status}`,
      });
    }

    if (payload?.code && payload.code !== 'Ok') {
      return payload.code === 'NoRoute'
        ? buildNoRouteResult({
            from,
            to,
            failureReason: payload.message ?? payload.code,
          })
        : buildUnavailableResult({
            from,
            to,
            failureReason: payload.message ?? payload.code,
          });
    }

    const route = payload?.routes?.[0];
    const networkDistanceMeters = Number(route?.distance);
    const networkDurationSeconds = Number(route?.duration);
    const routeCoordinates = sanitizeCoordinates(route?.geometry?.coordinates);

    if (!Number.isFinite(networkDistanceMeters) || routeCoordinates.length < 2) {
      return buildNoRouteResult({
        from,
        to,
        failureReason: 'empty-route',
      });
    }

    return {
      provider: 'mapbox',
      status: 'ok',
      routeAvailable: true,
      straightLineMeters,
      networkDistanceMeters,
      networkDurationMinutes: Number.isFinite(networkDurationSeconds)
        ? Math.max(0, Math.round(networkDurationSeconds / 60))
        : null,
      detourRatio: straightLineMeters > 0 ? networkDistanceMeters / straightLineMeters : null,
      coordinates: routeCoordinates,
      failureReason: null,
    };
  } catch (error) {
    return buildUnavailableResult({
      from,
      to,
      failureReason: error instanceof Error ? error.message : 'walking-route-request-failed',
    });
  }
}

export function getWalkingRoute(params: {
  from: WalkingCoordinate;
  to: WalkingCoordinate;
}): Promise<WalkingRouteResult> {
  const key = buildCacheKey(params.from, params.to);
  const cached = walkingRouteCache.get(key);
  if (cached) return cached;

  const request = requestMapboxWalkingRoute(params.from, params.to);
  walkingRouteCache.set(key, request);
  return request;
}
