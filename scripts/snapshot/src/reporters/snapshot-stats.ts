import type { SnapshotMetadata } from '../types.ts';

export function renderSnapshotStats(metadata: SnapshotMetadata): string {
  const trips = Object.entries(metadata.output_counts.expanded_trips_per_dia_tipo)
    .map(([diaTipo, count]) => `- ${diaTipo}: ${count}`)
    .join('\n');

  return `# Snapshot Stats

## Source

- paradas: ${metadata.source_counts.paradas}
- route_patterns: ${metadata.source_counts.route_patterns}
- route_pattern_stops: ${metadata.source_counts.route_pattern_stops}
- transfer_edges: ${metadata.source_counts.transfer_edges}
- service_windows: ${metadata.source_counts.service_windows}

## Output

- minotor_version: ${metadata.minotor_version}
- generator_version: ${metadata.generator_version}
- schema_version: ${metadata.schema_version}
- minotor_routes: ${metadata.output_counts.minotor_routes}
- minotor_stops: ${metadata.output_counts.minotor_stops}
- minotor_transfers: ${metadata.output_counts.minotor_transfers}
- real_transfers: ${metadata.output_counts.real_transfers}
- synthetic_transfers: ${metadata.output_counts.synthetic_transfers}
- real_winning_on_conflict: ${metadata.output_counts.real_winning_on_conflict}
- discarded_transfer_edges: ${metadata.output_counts.discarded_transfer_edges}
- service_route_directory entries: ${Object.keys(metadata.service_route_directory).length}
- raw_bytes: ${metadata.byte_size.raw}
- gzipped_bytes: ${metadata.byte_size.gzipped}

## Expanded Trips

${trips}

## Linearization

- linear patterns/arcs: ${metadata.linearization.linear}
- loop patterns/arcs: ${metadata.linearization.loops}
- revisit patterns/arcs: ${metadata.linearization.revisits}
- total_sub_arcs: ${metadata.linearization.total_sub_arcs}
`;
}
