import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

export type RouteTraceDirection = 'ida' | 'vuelta' | 'ambos' | 'sin_definir';
export type LocalRouteTraceStatus =
  | 'recording'
  | 'paused'
  | 'pending_sync'
  | 'syncing'
  | 'synced'
  | 'sync_error';

export type RouteTracePoint = {
  order: number;
  latitude: number;
  longitude: number;
  capturedAt: string;
  accuracyM?: number | null;
  speedMps?: number | null;
  headingDeg?: number | null;
  altitudeM?: number | null;
};

export type LocalRouteTrace = {
  localId: string;
  routeId: number | null;
  routeName: string;
  routeCode: string | null;
  direction: RouteTraceDirection;
  notes: string | null;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: LocalRouteTraceStatus;
  uploadedSessionId: number | null;
  lastError: string | null;
  points: RouteTracePoint[];
};

export type TraceRouteSearchResult = {
  id: number;
  nombreRuta: string;
  codigoCtp: string | null;
  operador: string | null;
};

export type RouteTraceSyncResult = {
  uploaded: number;
  failed: number;
};

const ROUTE_TRACE_STORAGE_KEY = '@busescr/route-traces:v1';

function createLocalId() {
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toNullableString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sanitizePoint(value: unknown): RouteTracePoint | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<RouteTracePoint>;
  if (!Number.isFinite(candidate.order)) return null;
  if (!Number.isFinite(candidate.latitude) || !Number.isFinite(candidate.longitude)) return null;
  if (!candidate.capturedAt) return null;

  return {
    order: Number(candidate.order),
    latitude: Number(candidate.latitude),
    longitude: Number(candidate.longitude),
    capturedAt: String(candidate.capturedAt),
    accuracyM: Number.isFinite(candidate.accuracyM) ? Number(candidate.accuracyM) : null,
    speedMps: Number.isFinite(candidate.speedMps) ? Number(candidate.speedMps) : null,
    headingDeg: Number.isFinite(candidate.headingDeg) ? Number(candidate.headingDeg) : null,
    altitudeM: Number.isFinite(candidate.altitudeM) ? Number(candidate.altitudeM) : null,
  };
}

function sanitizeTrace(value: unknown): LocalRouteTrace | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<LocalRouteTrace>;
  if (!candidate.localId || !candidate.routeName || !candidate.startedAt || !candidate.createdAt || !candidate.updatedAt) {
    return null;
  }

  const status = candidate.status;
  const normalizedStatus: LocalRouteTraceStatus =
    status === 'recording' ||
    status === 'paused' ||
    status === 'pending_sync' ||
    status === 'syncing' ||
    status === 'synced' ||
    status === 'sync_error'
      ? status
      : 'pending_sync';

  const direction = candidate.direction;
  const normalizedDirection: RouteTraceDirection =
    direction === 'ida' || direction === 'vuelta' || direction === 'ambos' || direction === 'sin_definir'
      ? direction
      : 'sin_definir';

  return {
    localId: String(candidate.localId),
    routeId: Number.isFinite(candidate.routeId) ? Number(candidate.routeId) : null,
    routeName: String(candidate.routeName),
    routeCode: candidate.routeCode ? String(candidate.routeCode) : null,
    direction: normalizedDirection,
    notes: candidate.notes ? String(candidate.notes) : null,
    startedAt: String(candidate.startedAt),
    endedAt: candidate.endedAt ? String(candidate.endedAt) : null,
    createdAt: String(candidate.createdAt),
    updatedAt: String(candidate.updatedAt),
    status: normalizedStatus,
    uploadedSessionId: Number.isFinite(candidate.uploadedSessionId) ? Number(candidate.uploadedSessionId) : null,
    lastError: candidate.lastError ? String(candidate.lastError) : null,
    points: Array.isArray(candidate.points)
      ? candidate.points
          .map(sanitizePoint)
          .filter((point): point is RouteTracePoint => Boolean(point))
          .sort((a, b) => a.order - b.order)
      : [],
  };
}

async function saveLocalRouteTraces(traces: LocalRouteTrace[]) {
  await AsyncStorage.setItem(ROUTE_TRACE_STORAGE_KEY, JSON.stringify(traces));
}

export async function loadLocalRouteTraces(): Promise<LocalRouteTrace[]> {
  try {
    const raw = await AsyncStorage.getItem(ROUTE_TRACE_STORAGE_KEY);
    if (!raw) return [];

    return (JSON.parse(raw) as unknown[])
      .map(sanitizeTrace)
      .filter((trace): trace is LocalRouteTrace => Boolean(trace))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  } catch {
    return [];
  }
}

export async function createLocalRouteTrace(params: {
  routeId?: number | null;
  routeName: string;
  routeCode?: string | null;
  direction?: RouteTraceDirection;
  notes?: string | null;
}) {
  const now = new Date().toISOString();
  const nextTrace: LocalRouteTrace = {
    localId: createLocalId(),
    routeId: Number.isFinite(params.routeId) ? Number(params.routeId) : null,
    routeName: params.routeName.trim(),
    routeCode: toNullableString(params.routeCode),
    direction: params.direction ?? 'sin_definir',
    notes: toNullableString(params.notes),
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
    status: 'recording',
    uploadedSessionId: null,
    lastError: null,
    points: [],
  };

  const current = await loadLocalRouteTraces();
  await saveLocalRouteTraces([nextTrace, ...current]);
  return nextTrace;
}

async function updateTrace(localId: string, updater: (trace: LocalRouteTrace) => LocalRouteTrace) {
  const traces = await loadLocalRouteTraces();
  const next = traces.map((trace) => (trace.localId === localId ? updater(trace) : trace));
  await saveLocalRouteTraces(next);
  return next.find((trace) => trace.localId === localId) ?? null;
}

export async function appendPointToLocalRouteTrace(localId: string, point: Omit<RouteTracePoint, 'order'>) {
  return updateTrace(localId, (trace) => {
    const nextPoint: RouteTracePoint = {
      order: trace.points.length,
      ...point,
    };

    return {
      ...trace,
      points: [...trace.points, nextPoint],
      updatedAt: new Date().toISOString(),
      status: 'recording',
      lastError: null,
    };
  });
}

export async function pauseLocalRouteTrace(localId: string) {
  return updateTrace(localId, (trace) => ({
    ...trace,
    status: 'paused',
    updatedAt: new Date().toISOString(),
  }));
}

export async function resumeLocalRouteTrace(localId: string) {
  return updateTrace(localId, (trace) => ({
    ...trace,
    status: 'recording',
    updatedAt: new Date().toISOString(),
  }));
}

export async function finishLocalRouteTrace(localId: string, notes?: string | null) {
  return updateTrace(localId, (trace) => ({
    ...trace,
    endedAt: new Date().toISOString(),
    notes: toNullableString(notes) ?? trace.notes,
    status: trace.points.length >= 2 ? 'pending_sync' : 'sync_error',
    updatedAt: new Date().toISOString(),
    lastError: trace.points.length >= 2 ? null : 'Necesitas al menos 2 puntos para subir la traza.',
  }));
}

export async function deleteLocalRouteTrace(localId: string) {
  const traces = await loadLocalRouteTraces();
  const next = traces.filter((trace) => trace.localId !== localId);
  await saveLocalRouteTraces(next);
  return next;
}

export async function searchRoutesForTrace(query: string, limit = 8): Promise<TraceRouteSearchResult[]> {
  const search = query.trim();
  if (!search) return [];

  const normalized = search.replace(/[%_]/g, '').trim();
  if (!normalized) return [];

  const { data, error } = await supabase
    .from('rutas')
    .select('id, nombre_ruta, codigo_ctp, operador')
    .or(`nombre_ruta.ilike.%${normalized}%,codigo_ctp.ilike.%${normalized}%,operador.ilike.%${normalized}%`)
    .order('nombre_ruta', { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    nombreRuta: row.nombre_ruta ? String(row.nombre_ruta) : 'Ruta sin nombre',
    codigoCtp: row.codigo_ctp ? String(row.codigo_ctp) : null,
    operador: row.operador ? String(row.operador) : null,
  }));
}

async function syncOneTrace(trace: LocalRouteTrace, userId: string) {
  const sessionPayload = {
    client_trace_id: trace.localId,
    user_id: userId,
    ruta_id: trace.routeId,
    route_name: trace.routeName,
    route_code: trace.routeCode,
    direction: trace.direction,
    notes: trace.notes,
    status: 'pending_review',
    source: 'mobile_trace',
    metadata: {
      point_count: trace.points.length,
      local_updated_at: trace.updatedAt,
    },
    started_at: trace.startedAt,
    ended_at: trace.endedAt ?? trace.updatedAt,
  };

  const { data: sessionRow, error: sessionError } = await supabase
    .from('route_trace_sessions')
    .upsert(sessionPayload, { onConflict: 'client_trace_id' })
    .select('id')
    .single();

  if (sessionError) {
    throw sessionError;
  }

  const sessionId = Number(sessionRow.id);
  const pointRows = trace.points.map((point) => ({
    trace_session_id: sessionId,
    point_order: point.order,
    captured_at: point.capturedAt,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy_m: point.accuracyM ?? null,
    speed_mps: point.speedMps ?? null,
    heading_deg: point.headingDeg ?? null,
    altitude_m: point.altitudeM ?? null,
  }));

  const { error: pointError } = await supabase
    .from('route_trace_points')
    .upsert(pointRows, { onConflict: 'trace_session_id,point_order' });

  if (pointError) {
    throw pointError;
  }

  return sessionId;
}

export async function syncPendingRouteTraces(userId?: string | null): Promise<RouteTraceSyncResult> {
  if (!userId) return { uploaded: 0, failed: 0 };

  const traces = await loadLocalRouteTraces();
  let uploaded = 0;
  let failed = 0;
  const next: LocalRouteTrace[] = [];

  for (const trace of traces) {
    if (trace.status === 'recording' || trace.status === 'paused') {
      next.push(trace);
      continue;
    }

    if (trace.points.length < 2) {
      next.push({
        ...trace,
        status: 'sync_error',
        lastError: 'Necesitas al menos 2 puntos para subir la traza.',
        updatedAt: new Date().toISOString(),
      });
      failed += 1;
      continue;
    }

    try {
      const syncingTrace: LocalRouteTrace = {
        ...trace,
        status: 'syncing',
        updatedAt: new Date().toISOString(),
        lastError: null,
      };
      const sessionId = await syncOneTrace(syncingTrace, userId);
      next.push({
        ...syncingTrace,
        status: 'synced',
        uploadedSessionId: sessionId,
        updatedAt: new Date().toISOString(),
      });
      uploaded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No pudimos subir la traza.';
      next.push({
        ...trace,
        status: 'sync_error',
        lastError: message,
        updatedAt: new Date().toISOString(),
      });
      failed += 1;
    }
  }

  await saveLocalRouteTraces(next);
  return { uploaded, failed };
}
