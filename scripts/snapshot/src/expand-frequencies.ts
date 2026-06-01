import type { DiaTipo, ExpandedTrip, ExpandedTripStop, LinearizedSubPatternWithRows, RawServiceWindowRow } from './types.ts';

export type ExpansionDiagnostics = {
  skippedWindows: number;
  discardedTrips: number;
  tripsPerDiaTipo: Record<DiaTipo, number>;
};

export type ExpansionResult = {
  tripsByDiaTipo: Map<DiaTipo, ExpandedTrip[]>;
  diagnostics: ExpansionDiagnostics;
  serviceRouteIdByKey: Map<string, number>;
};

type SubPatternEntry = {
  routeId: number;
  subPattern: LinearizedSubPatternWithRows;
};

type PatternBase = {
  time: number | null;
  distance: number | null;
};

const DIA_TIPOS: DiaTipo[] = ['habil', 'sabado', 'domingo', 'feriado'];
const FALLBACK_AVERAGE_SPEED_M_PER_MIN = 25_000 / 60;

function parseTimeToMinutes(value: string): number {
  const [hours, minutes, seconds] = value.split(':').map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error(`Invalid service window time: ${value}`);
  }

  return hours * 60 + minutes + Math.floor((Number.isFinite(seconds) ? seconds : 0) / 60);
}

function groupSubPatternsByPattern(subPatterns: LinearizedSubPatternWithRows[]): Map<number, SubPatternEntry[]> {
  const groups = new Map<number, SubPatternEntry[]>();

  for (let routeId = 0; routeId < subPatterns.length; routeId += 1) {
    const subPattern = subPatterns[routeId];
    const current = groups.get(subPattern.pattern_id) ?? [];
    current.push({ routeId, subPattern });
    groups.set(subPattern.pattern_id, current);
  }

  for (const entries of groups.values()) {
    entries.sort((a, b) => a.subPattern.sub_arc_index - b.subPattern.sub_arc_index);
  }

  return groups;
}

function getPatternBase(entries: SubPatternEntry[]): PatternBase | null {
  const first = entries[0]?.subPattern.rows[0];
  if (!first) return null;

  return {
    time: first.tiempo_estimado_desde_inicio_min,
    distance: first.distancia_acumulada_m,
  };
}

function getStopOffsetMinutes(subPattern: LinearizedSubPatternWithRows, base: PatternBase): number[] | null {
  const offsets: number[] = [];

  for (let index = 0; index < subPattern.rows.length; index += 1) {
    const row = subPattern.rows[index];
    let offset: number | null = null;

    if (
      base.time != null &&
      row.tiempo_estimado_desde_inicio_min != null &&
      row.tiempo_estimado_desde_inicio_min >= base.time
    ) {
      offset = row.tiempo_estimado_desde_inicio_min - base.time;
    } else if (base.distance != null && row.distancia_acumulada_m != null && row.distancia_acumulada_m >= base.distance) {
      offset = Math.round((row.distancia_acumulada_m - base.distance) / FALLBACK_AVERAGE_SPEED_M_PER_MIN);
    }

    const previous = offsets.at(-1);
    if (offset == null || !Number.isFinite(offset)) {
      offset = previous == null ? 0 : previous + 2;
    }

    if (previous != null && offset <= previous) {
      offset = previous + 1;
    }

    offsets.push(offset);
  }

  return offsets;
}

function isMonotonic(stops: ExpandedTripStop[]): boolean {
  for (let index = 1; index < stops.length; index += 1) {
    if (stops[index].arrivalMin <= stops[index - 1].arrivalMin) {
      return false;
    }
  }

  return true;
}

export function expandFrequencies(
  subPatterns: LinearizedSubPatternWithRows[],
  serviceWindows: RawServiceWindowRow[],
): ExpansionResult {
  const tripsByDiaTipo = new Map<DiaTipo, ExpandedTrip[]>(DIA_TIPOS.map((diaTipo) => [diaTipo, []]));
  const windowsByPattern = new Map<number, RawServiceWindowRow[]>();
  const serviceRouteIdByKey = new Map<string, number>();
  const diagnostics: ExpansionDiagnostics = {
    skippedWindows: 0,
    discardedTrips: 0,
    tripsPerDiaTipo: {
      habil: 0,
      sabado: 0,
      domingo: 0,
      feriado: 0,
    },
  };

  for (const window of serviceWindows) {
    if (!window.activo) continue;
    const current = windowsByPattern.get(window.pattern_id) ?? [];
    current.push(window);
    windowsByPattern.set(window.pattern_id, current);
  }

  for (const [patternId, entries] of groupSubPatternsByPattern(subPatterns).entries()) {
    const windows = windowsByPattern.get(patternId) ?? [];
    const base = getPatternBase(entries);

    if (!base) {
      diagnostics.skippedWindows += windows.length;
      continue;
    }

    for (const window of windows) {
      const headway = Math.max(1, Math.round(window.frecuencia_promedio_min));
      let start = parseTimeToMinutes(window.hora_inicio);
      let end = parseTimeToMinutes(window.hora_fin);

      if (end < start) {
        end += 24 * 60;
      }

      if (end <= start) {
        diagnostics.skippedWindows += 1;
        continue;
      }

      for (let departure = start; departure <= end; departure += headway) {
        for (const { routeId, subPattern } of entries) {
          const offsets = getStopOffsetMinutes(subPattern, base);

          if (subPattern.rows.length < 2 || !offsets || offsets.length !== subPattern.rows.length) {
            diagnostics.discardedTrips += 1;
            continue;
          }

          let serviceRouteId = serviceRouteIdByKey.get(subPattern.service_route_key);
          if (serviceRouteId == null) {
            serviceRouteId = serviceRouteIdByKey.size;
            serviceRouteIdByKey.set(subPattern.service_route_key, serviceRouteId);
          }

          const stops = subPattern.rows.map((row, index) => {
            const arrivalMin = departure + offsets[index];
            return {
              stopId: row.parada_id,
              arrivalMin,
              departureMin: arrivalMin,
              pickupType: row.pickup_type,
              dropOffType: row.drop_off_type,
            };
          });

          if (!isMonotonic(stops)) {
            diagnostics.discardedTrips += 1;
            continue;
          }

          tripsByDiaTipo.get(window.dia_tipo)?.push({
            dia_tipo: window.dia_tipo,
            routeId,
            serviceRouteId,
            subPattern,
            stops,
          });
          diagnostics.tripsPerDiaTipo[window.dia_tipo] += 1;
        }
      }
    }
  }

  return { tripsByDiaTipo, diagnostics, serviceRouteIdByKey };
}
