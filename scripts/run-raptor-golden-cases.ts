#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildGoldenCaseBoardStopTitle,
  buildGoldenCaseFinalStopTitle,
  buildGoldenCaseJourneyTitle,
  evaluatePlannerGoldenCase,
  plannerGoldenCases,
  type PlannerGoldenCase,
  type PlannerGoldenCaseEvaluation,
} from '../lib/planner-golden-cases';
import { findJourneysWithRaptor } from '../lib/raptor/find-journeys';
import { DEFAULT_RAPTOR_LAB_DEPARTURE_ISO } from '../lib/raptor/lab-validation-time';
import { rankRaptorJourneys } from '../lib/raptor/journey-ranking';
import { setSnapshotLoadersForTesting } from '../lib/raptor/snapshot-cache';
import type { PlannedJourney } from '../lib/journey-planner';
import type { SnapshotMetadata } from '../lib/raptor/types';

type RunnerOptions = {
  caseId: string | null;
  details: boolean;
  strict: boolean;
  top: number;
};

type CaseRunResult = {
  case: PlannerGoldenCase;
  evaluation: PlannerGoldenCaseEvaluation;
  diagnostics: {
    candidatePairs: number;
    diaTipo: string;
    raptorJourneys: number;
    snapshotVersion: string | null;
  } | null;
  topJourneys: PlannedJourney[];
};

const projectRoot = path.resolve(__dirname, '..');
const snapshotPath = path.join(projectRoot, 'assets', 'snapshots', 'cartago-local.bin.gz');
const metadataPath = path.join(projectRoot, 'assets', 'snapshots', 'cartago-local.meta.json');
const reportPath = path.join(projectRoot, '.planning', 'phases', '01-raptor-runtime', 'WAVE-2-RAPTOR-GOLDEN.md');

function parseArgs(argv: string[]): RunnerOptions {
  return argv.reduce<RunnerOptions>(
    (options, arg) => {
      if (arg === '--details') return { ...options, details: true };
      if (arg === '--strict') return { ...options, strict: true };
      if (arg.startsWith('--case=')) return { ...options, caseId: arg.slice('--case='.length) };
      if (arg.startsWith('--top=')) {
        const top = Number(arg.slice('--top='.length));
        if (Number.isInteger(top) && top > 0) return { ...options, top };
      }
      return options;
    },
    { caseId: null, details: false, strict: false, top: 3 },
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

function formatStatus(status: PlannerGoldenCaseEvaluation['status']) {
  return status.toUpperCase().padEnd(10, ' ');
}

function formatRule(evaluation: PlannerGoldenCaseEvaluation) {
  return evaluation.matchingRule ? ` regla="${evaluation.matchingRule}"` : '';
}

function formatStop(label: string, value: string | null) {
  return value ? ` ${label}="${value}"` : '';
}

function formatConsoleLine(result: CaseRunResult) {
  const { case: goldenCase, evaluation } = result;
  const topTitles = evaluation.topTitles.join(' | ');
  return [
    formatStatus(evaluation.status),
    goldenCase.id,
    topTitles ? `| ${topTitles}` : '',
    formatRule(evaluation),
    formatStop('subida', evaluation.boardStopTitle),
    formatStop('bajada', evaluation.finalStopTitle),
  ].join(' ');
}

function markdownEscape(value: string | null) {
  return (value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildReport(params: {
  departureDate: Date;
  metadata: SnapshotMetadata;
  results: CaseRunResult[];
}) {
  const counts = params.results.reduce<Record<string, number>>((acc, result) => {
    acc[result.evaluation.status] = (acc[result.evaluation.status] ?? 0) + 1;
    return acc;
  }, {});
  const passish = (counts.pass ?? 0) + (counts.acceptable ?? 0);

  return [
    '# Wave 2 RAPTOR Golden Cases',
    '',
    `- Engine: RAPTOR local runtime`,
    `- Snapshot: \`${params.metadata.version}\``,
    `- Departure: \`${params.departureDate.toISOString()}\``,
    `- Checked: ${params.results.length}`,
    `- Pass/acceptable: ${passish}`,
    `- Forbidden: ${counts.forbidden ?? 0}`,
    `- Unexpected: ${counts.unexpected ?? 0}`,
    `- Empty: ${counts.empty ?? 0}`,
    `- Scope: raw RAPTOR + ranking only. Planner-lab still applies walking-network validation and incoherent-journey filtering after RAPTOR, so browser validation remains the source of truth for walking-shape cases.`,
    '',
    '| Case | Group | Status | Winner | Board | Final stop | Rule | Candidates |',
    '|---|---|---|---|---|---|---|---|',
    ...params.results.map((result) => {
      const { case: goldenCase, diagnostics, evaluation } = result;
      return [
        markdownEscape(goldenCase.id),
        markdownEscape(goldenCase.groupLabel),
        evaluation.status,
        markdownEscape(evaluation.winnerTitle),
        markdownEscape(evaluation.boardStopTitle),
        markdownEscape(evaluation.finalStopTitle),
        markdownEscape(evaluation.matchingRule),
        diagnostics?.raptorJourneys ?? 0,
      ].join(' | ');
    }),
    '',
    '## Top 3 By Case',
    '',
    ...params.results.flatMap((result) => [
      `### ${result.case.id}`,
      '',
      ...result.topJourneys.slice(0, 3).map((journey, index) => {
        const title = buildGoldenCaseJourneyTitle(journey);
        const board = buildGoldenCaseBoardStopTitle(journey) ?? 'Sin subida';
        const final = buildGoldenCaseFinalStopTitle(journey) ?? 'Sin bajada';
        return `${index + 1}. ${title} — ${board} -> ${final}`;
      }),
      '',
    ]),
  ].join('\n');
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

async function runCase(goldenCase: PlannerGoldenCase, departureDate: Date): Promise<CaseRunResult> {
  const destination = caseDestinationCoordinates(goldenCase);

  if (!destination) {
    return {
      case: goldenCase,
      diagnostics: null,
      evaluation: {
        status: 'empty',
        winnerTitle: null,
        boardStopTitle: null,
        finalStopTitle: null,
        matchingRule: 'Destino sin coordenadas',
        topTitles: [],
      },
      topJourneys: [],
    };
  }

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
  const evaluation = evaluatePlannerGoldenCase(goldenCase, ranking.ranked);

  return {
    case: goldenCase,
    diagnostics: result.diagnostics
      ? {
          candidatePairs: result.diagnostics.candidatePairs,
          diaTipo: result.diagnostics.diaTipo,
          raptorJourneys: result.diagnostics.raptorJourneys,
          snapshotVersion: result.diagnostics.snapshotVersion ?? null,
        }
      : null,
    evaluation,
    topJourneys: ranking.ranked,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const metadata = await setupSnapshotLoaders();
  const departureDate = new Date(DEFAULT_RAPTOR_LAB_DEPARTURE_ISO);
  const selectedCases = options.caseId
    ? plannerGoldenCases.filter((goldenCase) => goldenCase.id === options.caseId)
    : plannerGoldenCases;

  if (options.caseId && selectedCases.length === 0) {
    throw new Error(`Unknown golden case: ${options.caseId}`);
  }

  const results: CaseRunResult[] = [];
  for (const goldenCase of selectedCases) {
    const result = await runCase(goldenCase, departureDate);
    results.push(result);
    console.log(formatConsoleLine(result));

    if (options.details) {
      for (const [index, journey] of result.topJourneys.slice(0, options.top).entries()) {
        console.log(
          `  ${index + 1}. ${buildGoldenCaseJourneyTitle(journey)} | ` +
            `${buildGoldenCaseBoardStopTitle(journey) ?? 'Sin subida'} -> ` +
            `${buildGoldenCaseFinalStopTitle(journey) ?? 'Sin bajada'}`,
        );
      }
    }
  }

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, buildReport({ departureDate, metadata, results }), 'utf8');

  const summary = results.reduce<Record<PlannerGoldenCaseEvaluation['status'], number>>(
    (acc, result) => {
      acc[result.evaluation.status] += 1;
      return acc;
    },
    { acceptable: 0, empty: 0, forbidden: 0, pass: 0, unexpected: 0 },
  );

  console.log('');
  console.log(
    `RAPTOR golden cases (${results.length}) snapshot=${metadata.version} report=${reportPath}`,
  );
  console.log(
    `Resumen: pass=${summary.pass}, acceptable=${summary.acceptable}, unexpected=${summary.unexpected}, ` +
      `forbidden=${summary.forbidden}, empty=${summary.empty}`,
  );

  if (options.strict && (summary.unexpected > 0 || summary.forbidden > 0 || summary.empty > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
