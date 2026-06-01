export type DiaTipo = 'habil' | 'sabado' | 'domingo' | 'feriado';

export interface RawParadaRow {
  id: number;
  nombre: string;
  lat: number;
  lng: number;
}

export interface ParadaCoord {
  id: number;
  lat: number;
  lng: number;
}

export interface RawRoutePatternRow {
  pattern_id: number;
  ruta_id: number;
  route_name: string;
  pattern_name: string;
  pattern_code: string;
  categoria_operativa: string;
}

export interface RawPatternRow {
  pattern_id: number;
  ruta_id: number;
  parada_id: number;
  stop_sequence: number;
  es_subida: boolean;
  es_bajada: boolean;
  pickup_type: number;
  drop_off_type: number;
  distancia_acumulada_m: number | null;
  tiempo_estimado_desde_inicio_min: number | null;
}

export interface RawTransferEdgeRow {
  from_boarding_point_id: number | null;
  to_boarding_point_id: number | null;
  from_area_id: number | null;
  to_area_id: number | null;
  from_parada_id: number | null;
  to_parada_id: number | null;
  distance_m: number;
  walk_time_min: number;
  transfer_type: 'nearby_walk' | 'same_macro';
  confidence: number;
  activo: boolean;
  source?: 'planner_transfer_edges' | 'auto_synthesized';
}

export interface RawServiceWindowRow {
  pattern_id: number;
  dia_tipo: DiaTipo;
  hora_inicio: string;
  hora_fin: string;
  frecuencia_promedio_min: number;
  espera_promedio_min: number | null;
  activo: boolean;
}

export interface LinearizedSubPattern {
  pattern_id: number;
  ruta_id: number;
  sub_arc_index: number;
  service_route_key: string;
  stops: number[];
  source_seq_range: [number, number];
  reason: 'linear' | 'loop' | 'revisit';
}

export interface LinearizedSubPatternWithRows extends LinearizedSubPattern {
  rows: RawPatternRow[];
}

export interface ExpandedTripStop {
  stopId: number;
  arrivalMin: number;
  departureMin: number;
  pickupType: number;
  dropOffType: number;
}

export interface ExpandedTrip {
  dia_tipo: DiaTipo;
  routeId: number;
  serviceRouteId: number;
  subPattern: LinearizedSubPatternWithRows;
  stops: ExpandedTripStop[];
}

export interface ServiceRouteDirectoryEntry {
  service_route_key: string;
  pattern_id: number;
  ruta_id: number;
  route_name: string;
  pattern_name: string;
  pattern_code: string;
  categoria_operativa: string;
  sub_arcs: Array<{
    sub_arc_index: number;
    reason: LinearizedSubPattern['reason'];
    stop_count: number;
    parada_ids: number[];
  }>;
}

export interface SnapshotMetadata {
  version: string;
  generated_at: string;
  minotor_version: string;
  generator_version: string;
  schema_version: number;
  scope: 'cartago' | 'national';
  source_counts: {
    paradas: number;
    route_patterns: number;
    route_pattern_stops: number;
    transfer_edges: number;
    service_windows: number;
  };
  output_counts: {
    minotor_routes: number;
    minotor_stops: number;
    minotor_transfers: number;
    real_transfers: number;
    synthetic_transfers: number;
    real_winning_on_conflict: number;
    discarded_transfer_edges: number;
    expanded_trips_per_dia_tipo: Record<string, number>;
  };
  dia_tipos: string[];
  byte_size: { raw: number; gzipped: number };
  linearization: {
    linear: number;
    loops: number;
    revisits: number;
    total_sub_arcs: number;
  };
  reports: {
    linearization_report: string;
    snapshot_stats: string;
  };
  service_route_directory: Record<string, ServiceRouteDirectoryEntry>;
  verify_pairs?: Array<{
    dia_tipo: DiaTipo;
    from_stop_id: number;
    to_stop_id: number;
    from_parada_id: number;
    to_parada_id: number;
    route_id: number;
  }>;
}

export interface SnapshotSourceData {
  paradas: RawParadaRow[];
  routePatterns: RawRoutePatternRow[];
  patternStops: RawPatternRow[];
  transferEdges: RawTransferEdgeRow[];
  serviceWindows: RawServiceWindowRow[];
  validation: {
    discardedRows: Record<string, number>;
  };
}

export interface BuiltSnapshot {
  version: string;
  generatedAt: string;
  scope: 'cartago';
  source: SnapshotSourceData;
  linearized: LinearizedSubPatternWithRows[];
  blobs: Map<string, Uint8Array>;
  metadata: SnapshotMetadata;
}
