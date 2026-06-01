export type EtaConfidence = 'alta' | 'media' | 'baja';

export type EtaModel = {
  etaMinutes: number;
  walkMinutes: number;
  waitMinutes: number;
  confidence: EtaConfidence;
  reason: string;
  matchedBuses: number;
  freshBuses: number;
  staleBuses: number;
};

export type EtaRouteInput = {
  ruta_id: number;
  nombre_ruta?: string | null;
  codigo_ctp?: string | null;
  dist_origen: number;
};

export type LiveFleetBusSnapshot = {
  id: string;
  route: string;
  routeId?: string | null;
  lastUpdate: number;
};

export type LiveFleetSnapshot = {
  buses: LiveFleetBusSnapshot[];
  freshWindowMs: number;
};

function normalize(value?: string | null): string {
  return (value ?? '')
    .toLocaleLowerCase('es-CR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function estimateWalkMinutes(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 1;
  return Math.max(1, Math.round(meters / 80));
}

function estimateWaitTime(freshBuses: number, staleBuses: number): Pick<EtaModel, 'waitMinutes' | 'confidence' | 'reason'> {
  if (freshBuses >= 3) {
    return { waitMinutes: 2, confidence: 'alta', reason: 'Buena cobertura en vivo' };
  }

  if (freshBuses === 2) {
    return { waitMinutes: 4, confidence: 'alta', reason: 'Dos unidades frescas detectadas' };
  }

  if (freshBuses === 1) {
    return { waitMinutes: 6, confidence: 'media', reason: 'Una unidad fresca detectada' };
  }

  if (staleBuses > 0) {
    return { waitMinutes: 10, confidence: 'baja', reason: 'Solo senales recientes, sin posicion fresca' };
  }

  return { waitMinutes: 14, confidence: 'baja', reason: 'Sin unidades reportando en vivo' };
}

export function computeEta(route: EtaRouteInput, fleetSnapshot: LiveFleetSnapshot, nowTimestamp = Date.now()): EtaModel {
  const routeIdKey = String(route.ruta_id);
  const routeNameKey = normalize(route.nombre_ruta);
  const routeCodeKey = normalize(route.codigo_ctp);

  const matched = fleetSnapshot.buses.filter((bus) => {
    const busRouteIdKey = normalize(bus.routeId);
    const busRouteNameKey = normalize(bus.route);

    if (busRouteIdKey && busRouteIdKey === routeIdKey) return true;
    if (routeCodeKey && busRouteNameKey.includes(routeCodeKey)) return true;
    if (routeNameKey && busRouteNameKey === routeNameKey) return true;
    return false;
  });

  const freshBuses = matched.filter((bus) => nowTimestamp - bus.lastUpdate <= fleetSnapshot.freshWindowMs).length;
  const staleBuses = Math.max(0, matched.length - freshBuses);
  const walkMinutes = estimateWalkMinutes(route.dist_origen);
  const wait = estimateWaitTime(freshBuses, staleBuses);

  return {
    etaMinutes: walkMinutes + wait.waitMinutes,
    walkMinutes,
    waitMinutes: wait.waitMinutes,
    confidence: wait.confidence,
    reason: wait.reason,
    matchedBuses: matched.length,
    freshBuses,
    staleBuses,
  };
}
