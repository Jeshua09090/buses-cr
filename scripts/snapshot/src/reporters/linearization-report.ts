import type { LinearizedSubPatternWithRows, RawPatternRow, RawRoutePatternRow } from '../types.ts';

function groupByPatternId<T extends { pattern_id: number }>(rows: T[]): Map<number, T[]> {
  const groups = new Map<number, T[]>();

  for (const row of rows) {
    const current = groups.get(row.pattern_id) ?? [];
    current.push(row);
    groups.set(row.pattern_id, current);
  }

  return groups;
}

export function renderLinearizationReport(params: {
  routePatterns: RawRoutePatternRow[];
  patternStops: RawPatternRow[];
  linearized: LinearizedSubPatternWithRows[];
}): string {
  const routePatternById = new Map(params.routePatterns.map((pattern) => [pattern.pattern_id, pattern]));
  const originalStopCountByPattern = groupByPatternId(params.patternStops);
  const arcsByPattern = groupByPatternId(params.linearized);
  const lines: string[] = [
    '# Linearization Report',
    '',
    '| pattern_id | ruta_id | route_name | original_stops | sub_arcs | reason |',
    '| --- | ---: | --- | ---: | ---: | --- |',
  ];

  for (const [patternId, arcs] of Array.from(arcsByPattern.entries()).sort(([a], [b]) => a - b)) {
    const pattern = routePatternById.get(patternId);
    const reason = arcs.some((arc) => arc.reason === 'revisit')
      ? 'revisit'
      : arcs.some((arc) => arc.reason === 'loop')
        ? 'loop'
        : 'linear';

    lines.push(
      `| ${patternId} | ${pattern?.ruta_id ?? arcs[0]?.ruta_id ?? ''} | ${pattern?.route_name ?? 'Sin ruta'} | ${
        originalStopCountByPattern.get(patternId)?.length ?? 0
      } | ${arcs.length} | ${reason} |`,
    );
  }

  const nonLinear = params.linearized.filter((arc) => arc.reason !== 'linear');
  if (nonLinear.length > 0) {
    lines.push('', '## Non-Linear Patterns', '');

    for (const arc of nonLinear) {
      const pattern = routePatternById.get(arc.pattern_id);
      lines.push(
        `- pattern ${arc.pattern_id} / arc ${arc.sub_arc_index} (${pattern?.route_name ?? 'Sin ruta'}): ${arc.stops.join(
          ' -> ',
        )}`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}
