import type {
  LinearizedSubPatternWithRows,
  RawRoutePatternRow,
  ServiceRouteDirectoryEntry,
} from './types.ts';

export function buildServiceRouteDirectory(params: {
  linearized: LinearizedSubPatternWithRows[];
  routePatterns: RawRoutePatternRow[];
  serviceRouteIdByKey: Map<string, number>;
}): Record<string, ServiceRouteDirectoryEntry> {
  const patternById = new Map(params.routePatterns.map((pattern) => [pattern.pattern_id, pattern]));
  const arcsByKey = new Map<string, LinearizedSubPatternWithRows[]>();

  for (const arc of params.linearized) {
    const current = arcsByKey.get(arc.service_route_key) ?? [];
    current.push(arc);
    arcsByKey.set(arc.service_route_key, current);
  }

  const directory: Record<string, ServiceRouteDirectoryEntry> = {};

  for (const [serviceRouteKey, serviceRouteId] of params.serviceRouteIdByKey.entries()) {
    const arcs = arcsByKey.get(serviceRouteKey);
    if (!arcs?.length) continue;

    const sortedArcs = arcs.slice().sort((a, b) => a.sub_arc_index - b.sub_arc_index);
    const firstArc = sortedArcs[0];
    const pattern = patternById.get(firstArc.pattern_id);
    if (!pattern) continue;

    directory[String(serviceRouteId)] = {
      service_route_key: serviceRouteKey,
      pattern_id: firstArc.pattern_id,
      ruta_id: firstArc.ruta_id,
      route_name: pattern.route_name,
      pattern_name: pattern.pattern_name,
      pattern_code: pattern.pattern_code,
      categoria_operativa: pattern.categoria_operativa,
      sub_arcs: sortedArcs.map((arc) => ({
        sub_arc_index: arc.sub_arc_index,
        reason: arc.reason,
        stop_count: arc.stops.length,
        parada_ids: arc.stops.slice(),
      })),
    };
  }

  return directory;
}
