#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  buildGoldenCaseJourneyTitle,
  plannerGoldenCases,
  type PlannerGoldenCase,
} from '../lib/planner-golden-cases';
import { findJourneysWithRaptor } from '../lib/raptor/find-journeys';
import { DEFAULT_RAPTOR_LAB_DEPARTURE_ISO } from '../lib/raptor/lab-validation-time';
import { rankRaptorJourneys } from '../lib/raptor/journey-ranking';
import { setSnapshotLoadersForTesting } from '../lib/raptor/snapshot-cache';
import type { SnapshotMetadata } from '../lib/raptor/types';

type PerfOptions = {
  count: number;
  departureIso: string;
  outputPath: string;
};

type CasePerfResult = {
  id: string;
  elapsedMs: number;
  journeyCount: number;
  topTitle: string;
};

const projectRoot = path.resolve(__dirname, '..');
const snapshotPath = path.join(projectRoot, 'assets', 'snapshots', 'cartago-local.bin.gz');
const metadataPath = path.join(projectRoot, 'assets', 'snapshots', 'cartago-local.meta.json');
const defaultReportPath = path.join(
  projectRoot,
  '.planning',
  'phases',
  '01-raptor-runtime',
  'WAVE-2-PERF-P95.md',
);

function parseArgs(argv: string[]): PerfOptions {
  return argv.reduce<PerfOptions>(
    (options, arg) => {
      if (arg.startsWith('--count=')) {
        const count = Number(arg.slice('--count='.length));
        if (Number.isInteger(count) && count > 0) return { ...options, count };
      }
      if (arg.startsWith('--departure=')) {
        return { ...options, departureIso: arg.slice('--departure='.length) };
      }
      if (arg.startsWith('--output=')) {
        return { ...options, outputPath: path.resolve(arg.slice('--output='.length)) };
      }

      return options;
    },
    {
      count: 50,
      departureIso: DEFAULT_RAPTOR_LAB_DEPARTURE_ISO,
      outputPath: defaultReportPath,
    },
  );
}

function parseCoordinateQuery(value: string) {
  const parts = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter(Number.isFinite);

  if (parts.length < 2) return null;
  const [lat, lng] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return [lng, lat] as [number, number];
}

function caseDestinationCoordinates(goldenCase: PlannerGoldenCase) {
  return goldenCase.destinationCoordinates ?? parseCoordinateQuery(goldenCase.destinationQuery);
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sortedValues.length) - 1),
  );

  return sortedValues[index];
}

function formatMs(value: number) {
  return `${value.toFixed(2)} ms`;
}

async function setupSnapshotLoaders() {
  const metadataText = await readFile(metadataPath, 'utf8');
  const metadata = JSON.parse(metadataText) as SnapshotMetadata;

  setSnapshotLoadersForTesting({
    loadMetadata: () => metadata,
    loadBytes: async () => new Uint8Array(await readFile(snapshotPath)),
  });

  return metadata;
}

async function runCase(goldenCase: PlannerGoldenCase, departureDate: Date): Promise<CasePerfResult> {
  const destination = caseDestinationCoordinates(goldenCase);
  if (!destination) {
    return {
      id: goldenCase.id,
      elapsedMs: 0,
      journeyCount: 0,
      topTitle: 'Destino sin coordenadas',
    };
  }

  const startedAt = performance.now();
  const result = await findJourneysWithRaptor({
    origin: { lng: goldenCase.originCoordinates[0], lat: goldenCase.originCoordinates[1] },
    destination: { lng: destination[0], lat: destination[1] },
    departureDate,
  });
  const ranking = rankRaptorJourneys({
    journeys: result.journeys,
    origin: goldenCase.originCoordinates,
    destination,
    destinationName: goldenCase.destinationLabel ?? goldenCase.destinationQuery,
  });
  const elapsedMs = performance.now() - startedAt;

  return {
    id: goldenCase.id,
    elapsedMs,
    journeyCount: ranking.ranked.length,
    topTitle: ranking.ranked[0] ? buildGoldenCaseJourneyTitle(ranking.ranked[0]) : 'Sin journeys',
  };
}

function buildReport(params: {
  count: number;
  departureDate: Date;
  metadata: SnapshotMetadata;
  results: CasePerfResult[];
  warmup: CasePerfResult;
}) {
  const sortedTimes = params.results.map((result) => result.elapsedMs).sort((a, b) => a - b);
  const slowest = [...params.results].sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 10);

  return [
    '# Wave 2 RAPTOR Performance P95',
    '',
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    'Status: LOCAL PROXY CAPTURED - real-device measurement still required before',
    'flag flip.',
    '',
    '## Purpose',
    '',
    'The exit gate needs a latency check before considering RAPTOR default-on. The',
    'target discussed during Wave 2 polish:',
    '',
    '- p95 < 2s: strong.',
    '- p95 < 5s: acceptable.',
    '- p95 >= 5s: not ready for rollout.',
    '',
    'This file records the reproducible local proxy measurement. It is useful for',
    'catching gross runtime regressions, but it is not a substitute for a mid-range',
    'Android/iOS device run.',
    '',
    '## Method',
    '',
    'Environment:',
    '',
    '- Machine: local developer Windows machine.',
    '- Runtime: Node/tsx, not Hermes and not mobile hardware.',
    `- Snapshot: \`${params.metadata.version}\`.`,
    `- Departure: \`${params.departureDate.toISOString()}\`.`,
    `- Query set: first ${params.count} cases from \`lib/planner-golden-cases.ts\`.`,
    '- Measured surface: `findJourneysWithRaptor` plus `rankRaptorJourneys`.',
    '- Snapshot load: one warmup query was excluded from the measured queries.',
    '',
    'Command:',
    '',
    '```powershell',
    `npm.cmd run raptor:perf-p95 -- --count=${params.count}`,
    '```',
    '',
    '## Results',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| Warmup query | ${formatMs(params.warmup.elapsedMs)} |`,
    `| Count | ${params.results.length} |`,
    `| Min | ${formatMs(sortedTimes[0] ?? 0)} |`,
    `| p50 | ${formatMs(percentile(sortedTimes, 50))} |`,
    `| p95 | ${formatMs(percentile(sortedTimes, 95))} |`,
    `| p99 | ${formatMs(percentile(sortedTimes, 99))} |`,
    `| Max | ${formatMs(sortedTimes[sortedTimes.length - 1] ?? 0)} |`,
    '',
    'Local proxy read: acceptable if p95 stays below the `<5s` target; strong only',
    'if it stays below `<2s`.',
    '',
    '## Slowest Queries',
    '',
    '| Rank | Case | Time | Journeys | Top |',
    '|---:|---|---:|---:|---|',
    ...slowest.map(
      (result, index) =>
        `| ${[
          index + 1,
          `\`${result.id}\``,
          formatMs(result.elapsedMs),
          result.journeyCount,
          `\`${result.topTitle.replace(/\|/g, '\\|')}\``,
        ].join(' | ')} |`,
    ),
    '',
    '## Interpretation',
    '',
    'The slowest local cases are usually broad rural/east-southeast searches that',
    'return the full ranked candidate set. That matches the correctness work from',
    'Wave 2: preserving direct alternatives improves route quality but keeps more',
    'candidate journeys alive for ranking.',
    '',
    'This is acceptable as a local proxy only. The default-on decision still needs:',
    '',
    '1. The Round 8 independent Moovit/manual verdict.',
    '2. A real-device run with 50 varied queries.',
    '3. p50/p95/p99 captured from the mobile `findJourneys` call path, ideally with',
    '   Hermes enabled and production-like logging.',
    '',
  ].join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const metadata = await setupSnapshotLoaders();
  const departureDate = new Date(options.departureIso);
  if (Number.isNaN(departureDate.getTime())) {
    throw new Error(`Invalid --departure value: ${options.departureIso}`);
  }

  const selectedCases = plannerGoldenCases.slice(0, options.count);
  if (selectedCases.length === 0) {
    throw new Error('No golden cases selected for perf run.');
  }

  const warmup = await runCase(selectedCases[0], departureDate);
  const results: CasePerfResult[] = [];
  for (const goldenCase of selectedCases) {
    results.push(await runCase(goldenCase, departureDate));
  }

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeFile(
    options.outputPath,
    buildReport({
      count: selectedCases.length,
      departureDate,
      metadata,
      results,
      warmup,
    }),
    'utf8',
  );

  const sortedTimes = results.map((result) => result.elapsedMs).sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        reportPath: options.outputPath,
        snapshot: metadata.version,
        count: results.length,
        p50Ms: Number(percentile(sortedTimes, 50).toFixed(2)),
        p95Ms: Number(percentile(sortedTimes, 95).toFixed(2)),
        p99Ms: Number(percentile(sortedTimes, 99).toFixed(2)),
        maxMs: Number((sortedTimes[sortedTimes.length - 1] ?? 0).toFixed(2)),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
