export type RouteStop = {
  id: string;
  name: string;
  coordinate: [number, number];
};

export type RouteDefinition = {
  id: string;
  name: string;
  routeCode: string;
  path: [number, number][];
  stops: RouteStop[];
};

export type NearbyRouteStop = {
  id: string;
  stopName: string;
  routeId: string;
  routeName: string;
  routeCode: string;
  coordinate: [number, number];
  distanceMeters: number;
};

const CARTAGO_TARAS_STOPS: RouteStop[] = [
  { id: 'taras_stop_1', name: 'Las Ruinas', coordinate: [-83.9189, 9.8648] },
  { id: 'taras_stop_2', name: 'Paseo Metrópoli', coordinate: [-83.9256, 9.8667] },
  { id: 'taras_stop_3', name: 'Entrada Taras', coordinate: [-83.9365, 9.8784] },
  { id: 'taras_stop_4', name: 'Taras Centro', coordinate: [-83.9389, 9.8812] },
];

const CARTAGO_PARAISO_PATH: [number, number][] = [
  [-83.9189, 9.8648],
  [-83.9132, 9.8624],
  [-83.9071, 9.8605],
  [-83.8997, 9.8586],
  [-83.8912, 9.8572],
  [-83.8836, 9.8579],
  [-83.8758, 9.8598],
  [-83.8699, 9.8621],
];

const CARTAGO_PARAISO_STOPS: RouteStop[] = [
  { id: 'paraiso_stop_1', name: 'Tribunal Cartago', coordinate: [-83.9189, 9.8648] },
  { id: 'paraiso_stop_2', name: 'Basílica de Los Ángeles', coordinate: [-83.9071, 9.8605] },
  { id: 'paraiso_stop_3', name: 'Llanos de Santa Lucía', coordinate: [-83.8912, 9.8572] },
  { id: 'paraiso_stop_4', name: 'Paraíso Centro', coordinate: [-83.8699, 9.8621] },
];

const LUMACA_SJ_PATH: [number, number][] = [
  [-83.9189, 9.8648],
  [-83.9244, 9.8681],
  [-83.9325, 9.8747],
  [-83.9448, 9.8842],
  [-83.9583, 9.8926],
  [-83.9727, 9.8981],
  [-83.9878, 9.9024],
];

const LUMACA_SJ_STOPS: RouteStop[] = [
  { id: 'lumaca_stop_1', name: 'Cartago Centro', coordinate: [-83.9189, 9.8648] },
  { id: 'lumaca_stop_2', name: 'Zona Industrial', coordinate: [-83.9448, 9.8842] },
  { id: 'lumaca_stop_3', name: 'Peaje Florencio', coordinate: [-83.9727, 9.8981] },
  { id: 'lumaca_stop_4', name: 'Terminal Lumaca', coordinate: [-83.9878, 9.9024] },
];

export const CARTAGO_TARAS_ROUTE: [number, number][] = [
  [-83.9189, 9.8648], // Las Ruinas (Centro)
  [-83.9214, 9.8646], // Hacia el oeste
  [-83.9241, 9.8644], // Por San Pacho
  [-83.9248, 9.8656], // Doblando al norte
  [-83.9256, 9.8667], // Por Paseo Metrópoli
  [-83.9272, 9.8688], // Autopista Florencio del Castillo
  [-83.9304, 9.8722], // Autopista
  [-83.9332, 9.8753], // Autopista
  [-83.9365, 9.8784], // Entrada a Taras
  [-83.9389, 9.8812], // Taras Centro
];

export const ROUTE_DEFINITIONS: RouteDefinition[] = [
  {
    id: 'cartago_taras',
    name: 'Cartago - Taras',
    routeCode: '300',
    path: CARTAGO_TARAS_ROUTE,
    stops: CARTAGO_TARAS_STOPS,
  },
  {
    id: 'cartago_paraiso',
    routeCode: '304',
    name: 'Cartago - Paraíso',
    path: CARTAGO_PARAISO_PATH,
    stops: CARTAGO_PARAISO_STOPS,
  },
  {
    id: 'lumaca_sanjose',
    routeCode: 'Lumaca',
    name: 'Lumaca - San José',
    path: LUMACA_SJ_PATH,
    stops: LUMACA_SJ_STOPS,
  },
];

export function resolveRoute(routeId?: string | null, routeName?: string | null): RouteDefinition {
  const normalizeMatch = (value?: string | null) =>
    (value ?? '')
      .trim()
      .toLocaleLowerCase('es-CR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');

  if (routeId) {
    const byId = ROUTE_DEFINITIONS.find((route) => route.id === routeId);
    if (byId) return byId;
  }

  if (routeName) {
    const routeNameNormalized = routeName.trim().toLowerCase();
    const byName = ROUTE_DEFINITIONS.find(
      (route) => route.name.trim().toLowerCase() === routeNameNormalized,
    );
    if (byName) return byName;

    const fuzzyName = normalizeMatch(routeName);
    const byFuzzyName = ROUTE_DEFINITIONS.find((route) => {
      const normalizedRouteName = normalizeMatch(route.name);
      const normalizedRouteCode = normalizeMatch(route.routeCode);
      return (
        normalizedRouteName.includes(fuzzyName) ||
        fuzzyName.includes(normalizedRouteName) ||
        normalizedRouteCode === fuzzyName
      );
    });
    if (byFuzzyName) return byFuzzyName;
  }

  return ROUTE_DEFINITIONS[0];
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineMeters(from: [number, number], to: [number, number]) {
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

export function findNearbyStops(userCoordinate: [number, number], limit = 4): NearbyRouteStop[] {
  return ROUTE_DEFINITIONS.flatMap((route) =>
    route.stops.map((stop) => ({
      id: `${route.id}:${stop.id}`,
      stopName: stop.name,
      routeId: route.id,
      routeName: route.name,
      routeCode: route.routeCode,
      coordinate: stop.coordinate,
      distanceMeters: haversineMeters(userCoordinate, stop.coordinate),
    })),
  )
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

// Función para generar puntos intermedios y hacer que el movimiento sea fluido
export function interpolateRoute(route: number[][], steps: number = 10): number[][] {
  const detailed: number[][] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const start = route[i];
    const end = route[i + 1];
    for (let j = 0; j < steps; j++) {
      const fraction = j / steps;
      const lng = start[0] + (end[0] - start[0]) * fraction;
      const lat = start[1] + (end[1] - start[1]) * fraction;
      detailed.push([lng, lat]);
    }
  }
  detailed.push(route[route.length - 1]);
  return detailed;
}

export const DETAILED_ROUTE = interpolateRoute(CARTAGO_TARAS_ROUTE, 15); // 15 puntos entre cada parada principal
