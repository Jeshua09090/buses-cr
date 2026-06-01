import path from 'node:path';

import { buildMinotorSnapshot } from './build-minotor.ts';
import { expandFrequencies } from './expand-frequencies.ts';
import { getRepoRoot } from './env.ts';
import { linearizePatterns } from './linearize-patterns.ts';
import { writeSnapshotPackage } from './package-snapshot.ts';
import { readSnapshotSourceData } from './read-postgres.ts';
import { renderLinearizationReport } from './reporters/linearization-report.ts';
import { renderSnapshotStats } from './reporters/snapshot-stats.ts';
import { buildServiceRouteDirectory } from './service-route-directory.ts';
import { mediumWalkTransferStopIds, synthesizeWalkingTransfers } from './synthesize-transfers.ts';
import type { LinearizedSubPatternWithRows, SnapshotMetadata } from './types.ts';
import { getVersionInfo } from './version-info.ts';

type CliArgs = {
  scope: 'cartago';
  outDir: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    scope: 'cartago',
    outDir: path.join(getRepoRoot(), 'local-snapshots'),
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--scope=')) {
      const scope = arg.slice('--scope='.length);
      if (scope !== 'cartago') {
        throw new Error('Wave 1 supports only --scope=cartago.');
      }
      args.scope = scope;
    } else if (arg.startsWith('--out=')) {
      const outValue = arg.slice('--out='.length);
      args.outDir = path.isAbsolute(outValue) ? outValue : path.join(getRepoRoot(), outValue);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run snapshot:dev -- --scope=cartago --out=./local-snapshots

Options:
  --scope=cartago   Wave 1 is local-only/cartago-only.
  --out=DIR         Output directory. Defaults to ./local-snapshots.
  --dry-run         Build everything but skip writing files.
`);
}

function createVersion(scope: 'cartago') {
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
  return `v${stamp}-${scope}-local`;
}

function assertNoDuplicateStops(linearized: LinearizedSubPatternWithRows[]) {
  for (const arc of linearized) {
    if (new Set(arc.stops).size !== arc.stops.length) {
      throw new Error(`Linearization invariant failed for pattern ${arc.pattern_id} arc ${arc.sub_arc_index}`);
    }
  }
}

function countLinearization(linearized: LinearizedSubPatternWithRows[]) {
  const arcsByPattern = new Map<number, LinearizedSubPatternWithRows[]>();

  for (const arc of linearized) {
    const current = arcsByPattern.get(arc.pattern_id) ?? [];
    current.push(arc);
    arcsByPattern.set(arc.pattern_id, current);
  }

  let linear = 0;
  let loops = 0;
  let revisits = 0;

  for (const arcs of arcsByPattern.values()) {
    if (arcs.some((arc) => arc.reason === 'revisit')) {
      revisits += 1;
    } else if (arcs.some((arc) => arc.reason === 'loop')) {
      loops += 1;
    } else {
      linear += 1;
    }
  }

  return {
    linear,
    loops,
    revisits,
    total_sub_arcs: linearized.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = await readSnapshotSourceData({ scope: args.scope });
  const patternToRutaId = new Map(source.routePatterns.map((pattern) => [pattern.pattern_id, pattern.ruta_id]));
  const paradaCoords = new Map(source.paradas.map((parada) => [parada.id, { id: parada.id, lat: parada.lat, lng: parada.lng }]));
  const linearized = linearizePatterns(source.patternStops, patternToRutaId, paradaCoords);

  assertNoDuplicateStops(linearized);

  const syntheticTransfers = synthesizeWalkingTransfers(source.paradas, {
    mediumWalkStopIds: mediumWalkTransferStopIds(source.patternStops),
  });
  const allTransfers = [...source.transferEdges, ...syntheticTransfers];
  const expanded = expandFrequencies(linearized, source.serviceWindows);
  const built = buildMinotorSnapshot({
    paradas: source.paradas,
    routePatterns: source.routePatterns,
    linearized,
    tripsByDiaTipo: expanded.tripsByDiaTipo,
    transferEdges: allTransfers,
  });
  const version = createVersion(args.scope);
  const versionInfo = getVersionInfo();
  const serviceRouteDirectory = buildServiceRouteDirectory({
    linearized,
    routePatterns: source.routePatterns,
    serviceRouteIdByKey: expanded.serviceRouteIdByKey,
  });
  const metadata: SnapshotMetadata = {
    version,
    generated_at: new Date().toISOString(),
    ...versionInfo,
    scope: args.scope,
    source_counts: {
      paradas: source.paradas.length,
      route_patterns: source.routePatterns.length,
      route_pattern_stops: source.patternStops.length,
      transfer_edges: source.transferEdges.length,
      service_windows: source.serviceWindows.length,
    },
    output_counts: {
      minotor_routes: built.diagnostics.routeCount,
      minotor_stops: built.diagnostics.stopCount,
      minotor_transfers: built.diagnostics.transferCount,
      real_transfers: built.diagnostics.realTransferCount,
      synthetic_transfers: built.diagnostics.syntheticTransferCount,
      real_winning_on_conflict: built.diagnostics.realWinningOnConflict,
      discarded_transfer_edges: built.diagnostics.discardedTransfers,
      expanded_trips_per_dia_tipo: built.diagnostics.expandedTripsPerDiaTipo,
    },
    dia_tipos: ['habil', 'sabado', 'domingo', 'feriado'],
    byte_size: { raw: 0, gzipped: 0 },
    linearization: countLinearization(linearized),
    reports: {
      linearization_report: `${version}.linearization-report.md`,
      snapshot_stats: `${version}.snapshot-stats.md`,
    },
    service_route_directory: serviceRouteDirectory,
    verify_pairs: built.verifyPairs,
  };
  const linearizationReport = renderLinearizationReport({
    routePatterns: source.routePatterns,
    patternStops: source.patternStops,
    linearized,
  });

  console.log(
    JSON.stringify(
      {
        scope: args.scope,
        source_counts: metadata.source_counts,
        output_counts: metadata.output_counts,
        linearization: metadata.linearization,
        expansion: expanded.diagnostics,
        service_route_directory_entries: Object.keys(serviceRouteDirectory).length,
        input_synthetic_transfers: syntheticTransfers.length,
        discarded_transfer_edges: built.diagnostics.discardedTransfers,
      },
      null,
      2,
    ),
  );

  if (args.dryRun) {
    return;
  }

  const result = await writeSnapshotPackage({
    outDir: args.outDir,
    metadata,
    blobs: built.blobs,
    linearizationReport,
    snapshotStats: renderSnapshotStats,
  });

  console.log(
    JSON.stringify(
      {
        written: {
          bin: result.binPath,
          metadata: result.metadataPath,
          linearization_report: result.linearizationReportPath,
          snapshot_stats: result.snapshotStatsPath,
        },
        raw_bytes: result.rawBytes,
        gzipped_bytes: result.gzippedBytes,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
