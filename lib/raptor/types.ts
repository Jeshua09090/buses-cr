import type { Router, StopsIndex, Timetable } from 'minotor';

import type { PlannedJourney } from '@/lib/journey-planner';
import type { RaptorRuntimeDecision } from './feature-flag';

export type DiaTipo = 'habil' | 'sabado' | 'domingo' | 'feriado';

export type LatLng = {
  lat: number;
  lng: number;
};

export type FindJourneysInput = {
  origin: LatLng;
  destination: LatLng;
  departureDate?: Date;
  walkRadiusMeters?: number;
  originWalkRadiusMeters?: number;
  destinationWalkRadiusMeters?: number;
  maxStopCandidates?: number;
  maxRoutedCandidatePairs?: number;
  maxTransfers?: number;
  maxInitialWaitingMinutes?: number;
  perfDiagnostics?: boolean;
};

export type FindJourneysResult = {
  source: 'raptor' | 'legacy';
  journeys: PlannedJourney[];
  diagnostics?: {
    diaTipo: DiaTipo;
    candidatePairs: number;
    routedCandidatePairs?: number;
    raptorJourneys: number;
    fallbackReason?: string;
    runtimeDecision?: RaptorRuntimeDecision;
    runtimeLatencyMs?: number;
    snapshotVersion?: string;
    fromCandidateCount?: number;
    toCandidateCount?: number;
    candidatePairsSkippedSameStop?: number;
    candidatePairsSkippedAccessWalk?: number;
    routeCalls?: number;
    directRouteCalls?: number;
    rangeRouteCalls?: number;
    perfTimingsMs?: {
      total?: number;
      snapshotAccess?: number;
      candidateSelection?: number;
      pairRouting?: number;
      routeCalls?: number;
      directRouteCalls?: number;
      resultMapping?: number;
      candidateSelectionForRanking?: number;
    };
    routeCallDurationStatsMs?: {
      count: number;
      p50: number;
      p95: number;
      max: number;
      total: number;
    };
    directRouteCallDurationStatsMs?: {
      count: number;
      p50: number;
      p95: number;
      max: number;
      total: number;
    };
  };
};

export type ServiceRouteDirectoryEntry = {
  service_route_key: string;
  pattern_id: number;
  ruta_id: number;
  route_name: string | null;
  pattern_name: string | null;
  pattern_code: string | null;
  categoria_operativa: string | null;
  sub_arcs: Array<{
    sub_arc_index: number;
    reason: 'linear' | 'loop' | 'revisit';
    stop_count: number;
    parada_ids?: number[];
  }>;
};

export type SnapshotMetadata = {
  version: string;
  generated_at: string;
  minotor_version: string;
  generator_version: string;
  schema_version: number;
  scope: 'cartago' | 'national';
  dia_tipos: DiaTipo[];
  byte_size: {
    raw: number;
    gzipped: number;
  };
  service_route_directory: Record<string, ServiceRouteDirectoryEntry>;
};

export type DecodedSnapshotBundle = {
  blobs: Map<string, Uint8Array>;
};

export type CachedSnapshot = {
  metadata: SnapshotMetadata;
  stopsIndex: StopsIndex;
  timetables: Map<DiaTipo, Timetable>;
  routers: Map<DiaTipo, Router>;
};

export type RouteNamesByStopId = ReadonlyMap<number, ReadonlySet<string>>;

export type FindNearestStopsParams = {
  stopsIndex: StopsIndex;
  point: LatLng;
  radiusMeters: number;
  limit: number;
  routeNamesByStopId?: RouteNamesByStopId;
  destinationRouteNames?: ReadonlySet<string>;
};

export type NearbyStopCandidate = {
  stopId: number;
  sourceStopId: string | null;
  paradaId: number | null;
  name: string;
  lat: number;
  lng: number;
  distanceMeters: number;
};

export type RaptorJourneyContext = {
  origin: LatLng;
  destination: LatLng;
  diaTipo: DiaTipo;
  departureMinutes: number;
  fromCandidate: NearbyStopCandidate;
  toCandidate: NearbyStopCandidate;
  maxTransfers: number;
};
