import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Query, Router, StopsIndex, Timetable } from 'minotor';

import { getRepoRoot } from './env.ts';
import { decodeBundle } from './package-snapshot.ts';
import type { DiaTipo, SnapshotMetadata } from './types.ts';

type CliArgs = {
  inputPath: string | null;
};

const DIA_TIPOS: DiaTipo[] = ['habil', 'sabado', 'domingo', 'feriado'];
export const MIN_PASS_RATIO = 0.8;

export function assertVerifyPassRatio(reached: number, total: number, minPassRatio = MIN_PASS_RATIO) {
  if (total > 0 && reached / total < minPassRatio) {
    throw new Error(`Verify failed: only ${reached}/${total} pairs reachable (min ${Math.round(minPassRatio * 100)}%).`);
  }
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { inputPath: null };

  for (const arg of argv) {
    if (arg.startsWith('--in=')) {
      args.inputPath = path.resolve(arg.slice('--in='.length));
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
  console.log(`Usage: npm run snapshot:verify -- --in=./local-snapshots/vYYYY-cartago-local.bin.gz`);
}

function findLatestSnapshot(): string {
  const outDir = path.join(getRepoRoot(), 'local-snapshots');
  const candidates = existsSync(outDir)
    ? readdirSync(outDir)
        .filter((entry) => entry.endsWith('.bin.gz'))
        .map((entry) => path.join(outDir, entry))
        .sort()
    : [];
  const latest = candidates.at(-1);

  if (!latest) {
    throw new Error('No local snapshot found. Pass --in=... or run snapshot:dev first.');
  }

  return latest;
}

function metadataPathFor(inputPath: string): string {
  return inputPath.replace(/\.bin\.gz$/, '.meta.json');
}

function loadMetadata(inputPath: string): SnapshotMetadata {
  const metadataPath = metadataPathFor(inputPath);
  if (!existsSync(metadataPath)) {
    throw new Error(`Missing metadata file next to snapshot: ${metadataPath}`);
  }

  return JSON.parse(readFileSync(metadataPath, 'utf8')) as SnapshotMetadata;
}

function makeQuery(from: number, to: number) {
  return new Query.Builder()
    .from(from)
    .to(to)
    .departureTime(0)
    .maxTransfers(3)
    .minTransferTime(0)
    .transportModes(new Set(['BUS']))
    .build();
}

function verifyTimetableBlob(blobs: Map<string, Uint8Array>, diaTipo: DiaTipo, stopsIndex: StopsIndex) {
  const timetableBlob = blobs.get(`tt-${diaTipo}`);
  if (!timetableBlob) {
    throw new Error(`Missing tt-${diaTipo} blob`);
  }

  const timetable = Timetable.fromData(timetableBlob);
  if (timetable.nbStops() !== stopsIndex.size()) {
    throw new Error(`Stop count mismatch for ${diaTipo}: ${timetable.nbStops()} vs ${stopsIndex.size()}`);
  }

  return timetable;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.inputPath ?? findLatestSnapshot();
  const blobs = decodeBundle(readFileSync(inputPath));
  const stopsBlob = blobs.get('stops');

  if (!stopsBlob) {
    throw new Error('Missing stops blob.');
  }

  const metadata = loadMetadata(inputPath);
  const stopsIndex = StopsIndex.fromData(stopsBlob);
  const timetables = new Map(DIA_TIPOS.map((diaTipo) => [diaTipo, verifyTimetableBlob(blobs, diaTipo, stopsIndex)]));
  const pairs = metadata.verify_pairs ?? [];
  let reached = 0;

  for (const pair of pairs) {
    const timetable = timetables.get(pair.dia_tipo);
    if (!timetable) continue;

    const fromStop = stopsIndex.findStopBySourceStopId(String(pair.from_parada_id));
    const toStop = stopsIndex.findStopBySourceStopId(String(pair.to_parada_id));

    if (!fromStop || !toStop) {
      throw new Error(`Verify pair references a missing stop: ${pair.from_parada_id} -> ${pair.to_parada_id}`);
    }

    const router = new Router(timetable, stopsIndex);
    const result = router.route(makeQuery(pair.from_stop_id, pair.to_stop_id));
    if (result.arrivalAt(pair.to_stop_id, 3)) {
      reached += 1;
    }
  }

  assertVerifyPassRatio(reached, pairs.length);

  console.log(
    JSON.stringify(
      {
        input: inputPath,
        version: metadata.version,
        blobs: Array.from(blobs.keys()).sort(),
        stops: stopsIndex.size(),
        verify_pairs_checked: pairs.length,
        verify_pairs_reached: reached,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
