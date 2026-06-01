import pg from 'pg';
import { z } from 'zod';

import { getEnvValue } from './env.ts';
import type {
  DiaTipo,
  RawParadaRow,
  RawPatternRow,
  RawRoutePatternRow,
  RawServiceWindowRow,
  RawTransferEdgeRow,
  SnapshotSourceData,
} from './types.ts';

const PAGE_SIZE = 1000;

type ReadSnapshotOptions = {
  scope: 'cartago';
};

type BoardingPointRow = {
  id: number;
  linked_parada_id: number | null;
  metadata: Record<string, unknown> | null;
};

type RestRoutePatternRow = {
  id: number;
  ruta_id: number;
  nombre: string | null;
  pattern_code: string | null;
  categoria_operativa: string | null;
  activo: boolean;
};

type RestRutaRow = {
  id: number;
  nombre_ruta: string | null;
};

type RestTransferEdgeRow = Omit<RawTransferEdgeRow, 'from_parada_id' | 'to_parada_id'> & {
  metadata: Record<string, unknown> | null;
};

const diaTipoSchema = z.enum(['habil', 'sabado', 'domingo', 'feriado']);

const paradaSchema = z.object({
  id: z.coerce.number(),
  nombre: z.string().nullable().default('Parada sin nombre'),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  activo: z.boolean().optional(),
});

const routePatternSchema = z.object({
  id: z.coerce.number(),
  ruta_id: z.coerce.number(),
  nombre: z.string().nullable(),
  pattern_code: z.string().nullable(),
  categoria_operativa: z.string().nullable(),
  activo: z.boolean(),
});

const rutaSchema = z.object({
  id: z.coerce.number(),
  nombre_ruta: z.string().nullable(),
});

const patternStopSchema = z.object({
  pattern_id: z.coerce.number(),
  ruta_id: z.coerce.number().optional(),
  parada_id: z.coerce.number(),
  stop_sequence: z.coerce.number(),
  es_subida: z.boolean().nullable().default(true),
  es_bajada: z.boolean().nullable().default(true),
  pickup_type: z.coerce.number().nullable().default(0),
  drop_off_type: z.coerce.number().nullable().default(0),
  distancia_acumulada_m: z.coerce.number().nullable(),
  tiempo_estimado_desde_inicio_min: z.coerce.number().nullable(),
});

const boardingPointSchema = z.object({
  id: z.coerce.number(),
  linked_parada_id: z.coerce.number().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().default(null),
});

const transferEdgeSchema = z.object({
  from_boarding_point_id: z.coerce.number(),
  to_boarding_point_id: z.coerce.number(),
  from_area_id: z.coerce.number().nullable(),
  to_area_id: z.coerce.number().nullable(),
  distance_m: z.coerce.number(),
  walk_time_min: z.coerce.number(),
  transfer_type: z.enum(['nearby_walk', 'same_macro']),
  confidence: z.coerce.number(),
  activo: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable().default(null),
});

const serviceWindowSchema = z.object({
  pattern_id: z.coerce.number(),
  dia_tipo: diaTipoSchema,
  hora_inicio: z.string(),
  hora_fin: z.string(),
  frecuencia_promedio_min: z.coerce.number(),
  espera_promedio_min: z.coerce.number().nullable(),
  activo: z.boolean(),
});

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function metadataLinkedParada(edge: RestTransferEdgeRow, key: 'from_linked_parada_id' | 'to_linked_parada_id') {
  return toNumberOrNull(edge.metadata?.[key]);
}

function toRawParada(row: z.infer<typeof paradaSchema>): RawParadaRow {
  return {
    id: row.id,
    nombre: row.nombre ?? 'Parada sin nombre',
    lat: row.lat,
    lng: row.lng,
  };
}

function toRawPatternStop(row: z.infer<typeof patternStopSchema>, rutaId: number): RawPatternRow {
  return {
    pattern_id: row.pattern_id,
    ruta_id: row.ruta_id ?? rutaId,
    parada_id: row.parada_id,
    stop_sequence: row.stop_sequence,
    es_subida: row.es_subida ?? true,
    es_bajada: row.es_bajada ?? true,
    pickup_type: row.pickup_type ?? 0,
    drop_off_type: row.drop_off_type ?? 0,
    distancia_acumulada_m: row.distancia_acumulada_m,
    tiempo_estimado_desde_inicio_min: row.tiempo_estimado_desde_inicio_min,
  };
}

function buildRoutePatterns(
  patterns: RestRoutePatternRow[],
  rutas: RestRutaRow[],
): RawRoutePatternRow[] {
  const routeNameById = new Map(rutas.map((ruta) => [ruta.id, ruta.nombre_ruta ?? `Ruta ${ruta.id}`]));

  return patterns.map((pattern) => ({
    pattern_id: pattern.id,
    ruta_id: pattern.ruta_id,
    route_name: routeNameById.get(pattern.ruta_id) ?? pattern.nombre ?? `Ruta ${pattern.ruta_id}`,
    pattern_name: pattern.nombre ?? routeNameById.get(pattern.ruta_id) ?? `Pattern ${pattern.id}`,
    pattern_code: pattern.pattern_code ?? `pattern-${pattern.id}`,
    categoria_operativa: pattern.categoria_operativa ?? 'sin_clasificar',
  }));
}

function buildTransferEdges(
  edges: RestTransferEdgeRow[],
  boardingPoints: BoardingPointRow[],
): RawTransferEdgeRow[] {
  const boardingPointById = new Map(boardingPoints.map((point) => [point.id, point]));

  return edges.map((edge) => {
    const fromPoint =
      edge.from_boarding_point_id == null ? undefined : boardingPointById.get(edge.from_boarding_point_id);
    const toPoint =
      edge.to_boarding_point_id == null ? undefined : boardingPointById.get(edge.to_boarding_point_id);

    return {
      from_boarding_point_id: edge.from_boarding_point_id,
      to_boarding_point_id: edge.to_boarding_point_id,
      from_area_id: edge.from_area_id,
      to_area_id: edge.to_area_id,
      from_parada_id: fromPoint?.linked_parada_id ?? metadataLinkedParada(edge, 'from_linked_parada_id'),
      to_parada_id: toPoint?.linked_parada_id ?? metadataLinkedParada(edge, 'to_linked_parada_id'),
      distance_m: edge.distance_m,
      walk_time_min: edge.walk_time_min,
        transfer_type: edge.transfer_type,
        confidence: edge.confidence,
        activo: edge.activo,
        source: 'planner_transfer_edges',
      };
  });
}

async function getPgClient() {
  const connectionString = getEnvValue('SNAPSHOT_DATABASE_URL', 'DATABASE_URL', 'SUPABASE_DB_URL');
  if (!connectionString) return null;

  const client = new pg.Client({ connectionString });
  await client.connect();
  return client;
}

async function pgRows<T>(client: pg.Client, sql: string): Promise<T[]> {
  const result = await client.query(sql);
  return result.rows as T[];
}

export function buildPgRoutePatterns(routePatternRows: unknown[]): RawRoutePatternRow[] {
  return routePatternRows.map((row) => {
    const data = row as RestRoutePatternRow & { nombre_ruta?: string | null };
    const pattern = routePatternSchema.parse(data);

    return {
      pattern_id: pattern.id,
      ruta_id: pattern.ruta_id,
      route_name: data.nombre_ruta ?? pattern.nombre ?? `Ruta ${pattern.ruta_id}`,
      pattern_name: pattern.nombre ?? data.nombre_ruta ?? `Pattern ${pattern.id}`,
      pattern_code: pattern.pattern_code ?? `pattern-${pattern.id}`,
      categoria_operativa: pattern.categoria_operativa ?? 'sin_clasificar',
    };
  });
}

async function readViaPg(client: pg.Client): Promise<SnapshotSourceData> {
  const [paradaRows, routePatternRows, patternStopRows, transferRows, serviceRows] = await Promise.all([
    pgRows<unknown>(
      client,
      `select id, nombre, lat, lng, activo from paradas where coalesce(activo, true) = true order by id`,
    ),
    pgRows<unknown>(
      client,
      `select rp.id, rp.ruta_id, rp.nombre, rp.pattern_code, rp.categoria_operativa, rp.activo, r.nombre_ruta
       from route_patterns rp
       left join rutas r on r.id = rp.ruta_id
       where coalesce(rp.activo, true) = true
       order by rp.id`,
    ),
    pgRows<unknown>(
      client,
      `select rps.pattern_id, rp.ruta_id, rps.parada_id, rps.stop_sequence, rps.es_subida, rps.es_bajada,
              rps.pickup_type, rps.drop_off_type, rps.distancia_acumulada_m, rps.tiempo_estimado_desde_inicio_min
       from route_pattern_stops rps
       join route_patterns rp on rp.id = rps.pattern_id
       where coalesce(rp.activo, true) = true
       order by rps.pattern_id, rps.stop_sequence`,
    ),
    pgRows<unknown>(
      client,
      `select pte.from_boarding_point_id, pte.to_boarding_point_id, pte.from_area_id, pte.to_area_id,
              coalesce(fbp.linked_parada_id, (pte.metadata->>'from_linked_parada_id')::bigint) as from_parada_id,
              coalesce(tbp.linked_parada_id, (pte.metadata->>'to_linked_parada_id')::bigint) as to_parada_id,
              pte.distance_m, pte.walk_time_min, pte.transfer_type, pte.confidence, pte.activo
       from planner_transfer_edges pte
       left join planner_boarding_points fbp on fbp.id = pte.from_boarding_point_id
       left join planner_boarding_points tbp on tbp.id = pte.to_boarding_point_id
       where coalesce(pte.activo, true) = true
       order by pte.id`,
    ),
    pgRows<unknown>(
      client,
      `select pattern_id, dia_tipo, hora_inicio::text, hora_fin::text, frecuencia_promedio_min, espera_promedio_min, activo
       from service_windows
       where coalesce(activo, true) = true
       order by pattern_id, dia_tipo, hora_inicio`,
    ),
  ]);

  const routePatterns = buildPgRoutePatterns(routePatternRows);
  const rutaIdByPattern = new Map(routePatterns.map((pattern) => [pattern.pattern_id, pattern.ruta_id]));

  return {
    paradas: paradaRows.map((row) => toRawParada(paradaSchema.parse(row))),
    routePatterns,
    patternStops: patternStopRows.map((row) => {
      const parsed = patternStopSchema.parse(row);
      return toRawPatternStop(parsed, rutaIdByPattern.get(parsed.pattern_id) ?? 0);
    }),
    transferEdges: transferRows.map((row) => {
      const transfer = row as RawTransferEdgeRow;
      return {
        ...transfer,
        from_boarding_point_id: Number(transfer.from_boarding_point_id),
        to_boarding_point_id: Number(transfer.to_boarding_point_id),
        from_area_id: toNumberOrNull(transfer.from_area_id),
        to_area_id: toNumberOrNull(transfer.to_area_id),
        from_parada_id: toNumberOrNull(transfer.from_parada_id),
        to_parada_id: toNumberOrNull(transfer.to_parada_id),
        distance_m: Number(transfer.distance_m),
        walk_time_min: Number(transfer.walk_time_min),
        confidence: Number(transfer.confidence),
        activo: Boolean(transfer.activo),
        source: 'planner_transfer_edges',
      };
    }),
    serviceWindows: serviceRows.map((row) => serviceWindowSchema.parse(row) as RawServiceWindowRow),
    validation: { discardedRows: {} },
  };
}

function getRestConfig() {
  const supabaseUrl = getEnvValue('SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
  const anonKey = getEnvValue('SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing SNAPSHOT_DATABASE_URL or SUPABASE_URL/SUPABASE_ANON_KEY for snapshot source reads.');
  }

  return {
    baseUrl: `${supabaseUrl.replace(/\/$/, '')}/rest/v1`,
    anonKey,
  };
}

async function fetchRestPage<T>(table: string, params: URLSearchParams, offset: number): Promise<T[]> {
  const { baseUrl, anonKey } = getRestConfig();
  const pageParams = new URLSearchParams(params);
  pageParams.set('limit', String(PAGE_SIZE));
  pageParams.set('offset', String(offset));

  const response = await fetch(`${baseUrl}/${table}?${pageParams.toString()}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`PostgREST read failed for ${table}: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T[];
}

async function fetchAllRest<T>(table: string, params: URLSearchParams): Promise<T[]> {
  const rows: T[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchRestPage<T>(table, params, offset);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function readViaRest(): Promise<SnapshotSourceData> {
  const [paradaRows, routePatternRows, rutaRows, patternStopRows, boardingPointRows, transferRows, serviceRows] =
    await Promise.all([
      fetchAllRest<unknown>(
        'paradas',
        new URLSearchParams('select=id,nombre,lat,lng,activo&activo=eq.true&order=id.asc'),
      ),
      fetchAllRest<unknown>(
        'route_patterns',
        new URLSearchParams(
          'select=id,ruta_id,nombre,pattern_code,categoria_operativa,activo&activo=eq.true&order=id.asc',
        ),
      ),
      fetchAllRest<unknown>('rutas', new URLSearchParams('select=id,nombre_ruta&order=id.asc')),
      fetchAllRest<unknown>(
        'route_pattern_stops',
        new URLSearchParams(
          'select=pattern_id,parada_id,stop_sequence,es_subida,es_bajada,pickup_type,drop_off_type,distancia_acumulada_m,tiempo_estimado_desde_inicio_min&order=pattern_id.asc,stop_sequence.asc',
        ),
      ),
      fetchAllRest<unknown>(
        'planner_boarding_points',
        new URLSearchParams('select=id,linked_parada_id,metadata&activo=eq.true&order=id.asc'),
      ),
      fetchAllRest<unknown>(
        'planner_transfer_edges',
        new URLSearchParams(
          'select=from_boarding_point_id,to_boarding_point_id,from_area_id,to_area_id,distance_m,walk_time_min,transfer_type,confidence,activo,metadata&activo=eq.true&order=id.asc',
        ),
      ),
      fetchAllRest<unknown>(
        'service_windows',
        new URLSearchParams(
          'select=pattern_id,dia_tipo,hora_inicio,hora_fin,frecuencia_promedio_min,espera_promedio_min,activo&activo=eq.true&order=pattern_id.asc,dia_tipo.asc,hora_inicio.asc',
        ),
      ),
    ]);

  const parsedPatterns = routePatternRows.map((row) => routePatternSchema.parse(row));
  const routePatterns = buildRoutePatterns(
    parsedPatterns,
    rutaRows.map((row) => rutaSchema.parse(row)),
  );
  const activePatternIds = new Set(routePatterns.map((pattern) => pattern.pattern_id));
  const rutaIdByPattern = new Map(routePatterns.map((pattern) => [pattern.pattern_id, pattern.ruta_id]));
  const parsedPatternStops = patternStopRows
    .map((row) => patternStopSchema.parse(row))
    .filter((row) => activePatternIds.has(row.pattern_id));

  return {
    paradas: paradaRows.map((row) => toRawParada(paradaSchema.parse(row))),
    routePatterns,
    patternStops: parsedPatternStops.map((row) => toRawPatternStop(row, rutaIdByPattern.get(row.pattern_id) ?? 0)),
    transferEdges: buildTransferEdges(
      transferRows.map((row) => transferEdgeSchema.parse(row)),
      boardingPointRows.map((row) => boardingPointSchema.parse(row)),
    ),
    serviceWindows: serviceRows.map((row) => serviceWindowSchema.parse(row) as RawServiceWindowRow),
    validation: {
      discardedRows: {
        pattern_stops_inactive_pattern: patternStopRows.length - parsedPatternStops.length,
      },
    },
  };
}

export async function readSnapshotSourceData(options: ReadSnapshotOptions): Promise<SnapshotSourceData> {
  if (options.scope !== 'cartago') {
    throw new Error('Wave 1 snapshot generator is local-only/cartago-only.');
  }

  const client = await getPgClient();
  if (!client) {
    return readViaRest();
  }

  try {
    return await readViaPg(client);
  } finally {
    await client.end();
  }
}
