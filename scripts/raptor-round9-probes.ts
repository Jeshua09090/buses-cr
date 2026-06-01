#!/usr/bin/env tsx

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildGoldenCaseBoardStopTitle,
  buildGoldenCaseFinalStopTitle,
  buildGoldenCaseJourneyTitle,
} from '../lib/planner-golden-cases';
import { findJourneysWithRaptor } from '../lib/raptor/find-journeys';
import { DEFAULT_RAPTOR_LAB_DEPARTURE_ISO } from '../lib/raptor/lab-validation-time';
import { rankRaptorJourneys } from '../lib/raptor/journey-ranking';
import { setSnapshotLoadersForTesting } from '../lib/raptor/snapshot-cache';
import type { PlannedJourney } from '../lib/journey-planner';
import type { SnapshotMetadata } from '../lib/raptor/types';

type ProbeVerdict =
  | 'PASS'
  | 'ACCEPTABLE'
  | 'COORDINATE_WATCH'
  | 'DATA_GAP'
  | 'LONG_WALK_WATCH'
  | 'RANKING_WATCH'
  | 'UNEXPECTED';

type Probe = {
  id: string;
  group: string;
  originLabel: string;
  origin: [number, number];
  destinationLabel: string;
  destination: [number, number];
  expectedHints: readonly string[];
  acceptableHints?: readonly string[];
  forbiddenHints?: readonly string[];
  maxFinalWalkMeters?: number;
  notes: string;
};

type ProbeResult = {
  probe: Probe;
  verdict: ProbeVerdict;
  reason: string;
  winner: PlannedJourney | null;
  topJourneys: PlannedJourney[];
  diagnostics: Awaited<ReturnType<typeof findJourneysWithRaptor>>['diagnostics'];
};

const projectRoot = path.resolve(__dirname, '..');
const snapshotPath = path.join(projectRoot, 'assets', 'snapshots', 'cartago-local.bin.gz');
const metadataPath = path.join(projectRoot, 'assets', 'snapshots', 'cartago-local.meta.json');
const reportPath = path.join(
  projectRoot,
  '.planning',
  'phases',
  '01-raptor-runtime',
  'WAVE-2-CARTAGO-LOGIC-ROUND-9-PROBES.md',
);
const outputReportPath = process.env.RAPTOR_ROUND9_REPORT_PATH
  ? path.resolve(process.env.RAPTOR_ROUND9_REPORT_PATH)
  : reportPath;
const departureIso = process.env.RAPTOR_PROBE_DEPARTURE_ISO ?? DEFAULT_RAPTOR_LAB_DEPARTURE_ISO;
const detailLimit = Number(process.env.RAPTOR_ROUND9_DETAIL_LIMIT ?? 5);

const CARTAGO_CENTRO: [number, number] = [-83.919373, 9.864429];
const TERMINAL_CARTAGO: [number, number] = [-83.923164, 9.862138];
const BASILICA: [number, number] = [-83.9124, 9.8642];

const probes: readonly Probe[] = [
  {
    id: 'cartago-centro-quircot-iglesia',
    group: 'Urban north',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Iglesia Quircot',
    destination: [-83.92947387695312, 9.888154029846191],
    expectedHints: ['QUIRCOT'],
    maxFinalWalkMeters: 250,
    notes: 'Exact Quircot church stop; should use a Quircot-family local route.',
  },
  {
    id: 'quircot-iglesia-cartago-centro',
    group: 'Urban north',
    originLabel: 'Iglesia Quircot',
    origin: [-83.92947387695312, 9.888154029846191],
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['QUIRCOT'],
    maxFinalWalkMeters: 550,
    notes: 'Reverse Quircot coverage.',
  },
  {
    id: 'cartago-centro-quircot-ferreteria',
    group: 'Urban north',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Quircot / Ferreteria',
    destination: [-83.93372344970703, 9.882739067077637],
    expectedHints: ['QUIRCOT'],
    acceptableHints: ['TARAS', 'SAN NICOLAS'],
    maxFinalWalkMeters: 350,
    notes:
      'Coordinate sits on the Pali Taras/Quircot overlap. Moovit exposes Ferreteria Quircot service; Quircot-family direct drops within ~5 min are acceptable.',
  },
  {
    id: 'cartago-centro-pedregal-ebais',
    group: 'Urban north',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'EBAIS Pedregal',
    destination: [-83.9270248413086, 9.877954483032227],
    expectedHints: ['PEDREGAL', 'LOYOLA'],
    acceptableHints: ['EL CARMEN', 'QUIRCOT'],
    maxFinalWalkMeters: 900,
    notes: 'Pedregal/Loyola loop exists; El Carmen/Quircot may be operationally close depending on pin.',
  },
  {
    id: 'pedregal-ebais-cartago-centro',
    group: 'Urban north',
    originLabel: 'EBAIS Pedregal',
    origin: [-83.9270248413086, 9.877954483032227],
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['PEDREGAL', 'LOYOLA'],
    acceptableHints: ['EL CARMEN', 'QUIRCOT'],
    maxFinalWalkMeters: 900,
    notes: 'Return direction for the Pedregal watch.',
  },
  {
    id: 'cartago-centro-el-carmen-minisuper',
    group: 'Urban north',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'El Carmen minisuper',
    destination: [-83.92220306396484, 9.873766899108887],
    expectedHints: ['EL CARMEN', 'QUIRCOT'],
    acceptableHints: ['TARAS', 'SAN NICOLAS'],
    maxFinalWalkMeters: 350,
    notes: 'Close-in urban north coordinate; detects overreach of broad Quircot boxes.',
  },
  {
    id: 'el-carmen-minisuper-cartago-centro',
    group: 'Urban north',
    originLabel: 'El Carmen minisuper',
    origin: [-83.92220306396484, 9.873766899108887],
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['EL CARMEN', 'QUIRCOT'],
    acceptableHints: ['TARAS', 'SAN NICOLAS'],
    maxFinalWalkMeters: 450,
    notes: 'Return direction from El Carmen.',
  },
  {
    id: 'basilica-dulce-nombre',
    group: 'East local',
    originLabel: 'Basilica',
    origin: BASILICA,
    destinationLabel: 'Dulce Nombre / Musmanni',
    destination: [-83.90865325927734, 9.84384822845459],
    expectedHints: ['DULCE NOMBRE'],
    acceptableHints: ['PARAISO', 'BIRRISITO'],
    maxFinalWalkMeters: 500,
    notes: 'Short east-side local trip; Paraiso corridor may be equivalent near Dulce Nombre.',
  },
  {
    id: 'dulce-nombre-basilica',
    group: 'East local',
    originLabel: 'Dulce Nombre / Musmanni',
    origin: [-83.90865325927734, 9.84384822845459],
    destinationLabel: 'Basilica',
    destination: BASILICA,
    expectedHints: ['DULCE NOMBRE'],
    acceptableHints: ['PARAISO', 'BIRRISITO'],
    maxFinalWalkMeters: 600,
    notes: 'Reverse east-side local trip.',
  },
  {
    id: 'cartago-centro-el-alto-plaza',
    group: 'Oreamuno',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'El Alto plaza',
    destination: [-83.89291381835938, 9.867877006530762],
    expectedHints: ['EL ALTO', 'LA CRUZ'],
    acceptableHints: ['SAN BLAS'],
    maxFinalWalkMeters: 650,
    notes: 'Oreamuno/El Alto endpoint; San Blas can be a nearby branch but should not require huge walk.',
  },
  {
    id: 'el-alto-plaza-cartago-centro',
    group: 'Oreamuno',
    originLabel: 'El Alto plaza',
    origin: [-83.89291381835938, 9.867877006530762],
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['EL ALTO', 'LA CRUZ'],
    acceptableHints: ['SAN BLAS'],
    maxFinalWalkMeters: 650,
    notes: 'Return from El Alto.',
  },
  {
    id: 'basilica-escuela-ochomogo',
    group: 'Ochomogo/Rio Loro',
    originLabel: 'Basilica',
    origin: BASILICA,
    destinationLabel: 'Escuela Ochomogo',
    destination: [-83.93788146972656, 9.887535095214844],
    expectedHints: ['OCHOMOGO'],
    acceptableHints: ['ICE', 'TARAS', 'SAN NICOLAS'],
    maxFinalWalkMeters: 700,
    notes: 'Ochomogo access near Rio Loro edge.',
  },
  {
    id: 'basilica-rio-loro-park',
    group: 'Ochomogo/Rio Loro',
    originLabel: 'Basilica',
    origin: BASILICA,
    destinationLabel: 'Parque Ambiental Rio Loro',
    destination: [-83.943462, 9.909199],
    expectedHints: ['RIO LORO'],
    acceptableHints: ['OCHOMOGO', 'ICE', 'TARAS', 'SAN NICOLAS'],
    maxFinalWalkMeters: 1600,
    notes: 'Known semantic watch: Moovit also tends to use Ochomogo/RECOPE style access with a long walk.',
  },
  {
    id: 'cartago-centro-parque-industrial-main',
    group: 'Parque Industrial',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Parque Industrial Cartago',
    destination: [-83.94822692871094, 9.855204582214355],
    expectedHints: ['PARQUE INDUSTRIAL'],
    maxFinalWalkMeters: 450,
    notes: 'Main Parque Industrial endpoint.',
  },
  {
    id: 'parque-industrial-main-cartago-centro',
    group: 'Parque Industrial',
    originLabel: 'Parque Industrial Cartago',
    origin: [-83.94822692871094, 9.855204582214355],
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['PARQUE INDUSTRIAL'],
    maxFinalWalkMeters: 600,
    notes: 'Return from Parque Industrial main endpoint.',
  },
  {
    id: 'cartago-centro-lourdes-cementerio',
    group: 'Lourdes',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Cementerio Lourdes',
    destination: [-83.9098892211914, 9.826910018920898],
    expectedHints: ['LOURDES', 'AGUA CALIENTE'],
    maxFinalWalkMeters: 450,
    notes: 'Lourdes south-side coordinate from FU4.',
  },
  {
    id: 'lourdes-plaza-cartago-centro',
    group: 'Lourdes',
    originLabel: 'Plaza Lourdes',
    origin: [-83.90792846679688, 9.828095436096191],
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['LOURDES', 'AGUA CALIENTE'],
    maxFinalWalkMeters: 650,
    notes: 'Return Lourdes coverage.',
  },
  {
    id: 'terminal-cartago-sanatorio',
    group: 'Sanatorio/Tierra Blanca',
    originLabel: 'Terminal Cartago',
    origin: TERMINAL_CARTAGO,
    destinationLabel: 'Terminal Sanatorio Duran',
    destination: [-83.88436889648438, 9.932242393493652],
    expectedHints: ['SANATORIO', 'TIERRA BLANCA', 'LA PASTORA'],
    maxFinalWalkMeters: 850,
    notes: 'Sentinel for the high-breadth Sanatorio work.',
  },
  {
    id: 'sanatorio-cartago-centro',
    group: 'Sanatorio/Tierra Blanca',
    originLabel: 'Terminal Sanatorio Duran',
    origin: [-83.88436889648438, 9.932242393493652],
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['SANATORIO', 'TIERRA BLANCA', 'LA PASTORA'],
    maxFinalWalkMeters: 900,
    notes: 'Return sentinel for Sanatorio.',
  },
  {
    id: 'cartago-centro-cot-iglesia',
    group: 'Oreamuno/Cot',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Iglesia Cot',
    destination: [-83.87235260009766, 9.89572811126709],
    expectedHints: ['COT'],
    acceptableHints: ['SANTA ROSA', 'OREAMUNO'],
    maxFinalWalkMeters: 800,
    notes: 'Cot is outside current goldens; useful east/north branch sentinel.',
  },
  {
    id: 'cot-iglesia-cartago-centro',
    group: 'Oreamuno/Cot',
    originLabel: 'Iglesia Cot',
    origin: [-83.87235260009766, 9.89572811126709],
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['COT'],
    acceptableHints: ['SANTA ROSA', 'OREAMUNO'],
    maxFinalWalkMeters: 900,
    notes: 'Return from Cot.',
  },
];

function normalizeText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function matchesAny(value: string | null, hints: readonly string[] = []) {
  const normalizedValue = normalizeText(value);
  return hints.some((hint) => normalizedValue.includes(normalizeText(hint)));
}

function routeTitle(journey: PlannedJourney | null) {
  return journey ? buildGoldenCaseJourneyTitle(journey) || 'Ruta disponible' : 'Sin ruta';
}

function finalStop(journey: PlannedJourney | null) {
  return journey ? buildGoldenCaseFinalStopTitle(journey) ?? 'Sin bajada' : 'Sin bajada';
}

function boardStop(journey: PlannedJourney | null) {
  return journey ? buildGoldenCaseBoardStopTitle(journey) ?? 'Sin subida' : 'Sin subida';
}

function finalWalkMeters(journey: PlannedJourney | null) {
  if (!journey) return null;
  return Math.round(journey.geoMetrics?.finalWalkNetworkMeters ?? journey.destinationWalkMeters);
}

function formatMeters(value: number | null) {
  return value === null ? 'n/a' : `${value}m`;
}

function classifyProbe(probe: Probe, ranked: PlannedJourney[]): Pick<ProbeResult, 'reason' | 'verdict' | 'winner'> {
  const winner = ranked[0] ?? null;
  if (!winner) {
    return { reason: 'RAPTOR returned no journey.', verdict: 'DATA_GAP', winner };
  }

  const winnerTitle = routeTitle(winner);
  const winnerFinalWalk = finalWalkMeters(winner);
  const maxFinalWalk = probe.maxFinalWalkMeters ?? 900;
  const expectedWinner = matchesAny(winnerTitle, probe.expectedHints);
  const acceptableWinner = matchesAny(winnerTitle, probe.acceptableHints);
  const forbiddenWinner = matchesAny(winnerTitle, probe.forbiddenHints);
  const expectedRank = ranked.findIndex((journey) => matchesAny(routeTitle(journey), probe.expectedHints));
  const acceptableRank = ranked.findIndex((journey) =>
    matchesAny(routeTitle(journey), probe.acceptableHints),
  );

  if (forbiddenWinner) {
    return { reason: `Winner matches forbidden hint: ${winnerTitle}.`, verdict: 'UNEXPECTED', winner };
  }

  if (winnerFinalWalk !== null && winnerFinalWalk > maxFinalWalk) {
    if (expectedWinner || acceptableWinner) {
      return {
        reason: `Winner family is plausible, but final walk ${winnerFinalWalk}m exceeds ${maxFinalWalk}m.`,
        verdict: 'LONG_WALK_WATCH',
        winner,
      };
    }

    return {
      reason: `Winner is off-family and final walk ${winnerFinalWalk}m exceeds ${maxFinalWalk}m.`,
      verdict: 'LONG_WALK_WATCH',
      winner,
    };
  }

  if (expectedWinner) {
    return { reason: `Winner matches expected hint: ${winnerTitle}.`, verdict: 'PASS', winner };
  }

  if (acceptableWinner) {
    return { reason: `Winner matches acceptable hint: ${winnerTitle}.`, verdict: 'ACCEPTABLE', winner };
  }

  if (expectedRank >= 0 && expectedRank < 5) {
    return {
      reason: `Expected family appears at rank ${expectedRank + 1}, winner is ${winnerTitle}.`,
      verdict: 'RANKING_WATCH',
      winner,
    };
  }

  if (acceptableRank >= 0 && acceptableRank < 5) {
    return {
      reason: `Acceptable family appears at rank ${acceptableRank + 1}, winner is ${winnerTitle}.`,
      verdict: 'COORDINATE_WATCH',
      winner,
    };
  }

  return { reason: `Winner does not match expected/acceptable hints: ${winnerTitle}.`, verdict: 'UNEXPECTED', winner };
}

function firstMatchingRank(journeys: PlannedJourney[], hints: readonly string[]) {
  const index = journeys.findIndex((journey) => matchesAny(routeTitle(journey), hints));
  return index >= 0 ? index + 1 : null;
}

function markdownEscape(value: string | null | undefined) {
  return (value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildTopRows(result: ProbeResult) {
  if (result.topJourneys.length === 0) return ['No journeys returned.'];

  return [
    '| # | Route | Board | Final | Final walk | Total walk | Score | Reasons |',
    '|---:|---|---|---|---:|---:|---:|---|',
    ...result.topJourneys.slice(0, detailLimit).map((journey, index) => {
      const reasons = (journey as PlannedJourney & { raptorPolishReasons?: { id: string }[] }).raptorPolishReasons
        ?.map((reason) => reason.id)
        .join(', ');
      return [
        index + 1,
        markdownEscape(routeTitle(journey)),
        markdownEscape(boardStop(journey)),
        markdownEscape(finalStop(journey)),
        formatMeters(finalWalkMeters(journey)),
        formatMeters(Math.round(journey.totalWalkMeters)),
        Math.round(journey.score * 10) / 10,
        markdownEscape(reasons ?? ''),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |');
    }),
  ];
}

function buildReport(metadata: SnapshotMetadata, results: ProbeResult[], departureDate: Date) {
  const counts = results.reduce<Record<ProbeVerdict, number>>(
    (acc, result) => {
      acc[result.verdict] += 1;
      return acc;
    },
    {
      ACCEPTABLE: 0,
      COORDINATE_WATCH: 0,
      DATA_GAP: 0,
      LONG_WALK_WATCH: 0,
      PASS: 0,
      RANKING_WATCH: 0,
      UNEXPECTED: 0,
    },
  );

  return [
    '# Wave 2 Cartago Logic Round 9 Probes',
    '',
    `- Snapshot: \`${metadata.version}\``,
    `- Departure: \`${departureDate.toISOString()}\``,
    `- Checked: ${results.length}`,
    `- PASS: ${counts.PASS}`,
    `- ACCEPTABLE: ${counts.ACCEPTABLE}`,
    `- Watches: ${counts.COORDINATE_WATCH + counts.LONG_WALK_WATCH + counts.RANKING_WATCH}`,
    `- DATA_GAP: ${counts.DATA_GAP}`,
    `- UNEXPECTED: ${counts.UNEXPECTED}`,
    `- Routed-pair budget override: ${process.env.EXPO_PUBLIC_RAPTOR_ROUTED_PAIR_BUDGET ?? 'default'}`,
    '',
    '## Summary',
    '',
    '| Probe | Group | Verdict | Winner | Board | Final | Final walk | Expected rank | Acceptable rank | Routed pairs | Reason |',
    '|---|---|---|---|---|---|---:|---:|---:|---:|---|',
    ...results.map((result) =>
      [
        markdownEscape(result.probe.id),
        markdownEscape(result.probe.group),
        result.verdict,
        markdownEscape(routeTitle(result.winner)),
        markdownEscape(boardStop(result.winner)),
        markdownEscape(finalStop(result.winner)),
        formatMeters(finalWalkMeters(result.winner)),
        firstMatchingRank(result.topJourneys, result.probe.expectedHints) ?? 'n/a',
        firstMatchingRank(result.topJourneys, result.probe.acceptableHints ?? []) ?? 'n/a',
        result.diagnostics?.routedCandidatePairs ?? 0,
        markdownEscape(result.reason),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
    ),
    '',
    '## Details',
    '',
    ...results.flatMap((result) => [
      `### ${result.probe.id}`,
      '',
      `- Group: ${result.probe.group}`,
      `- Origin: ${result.probe.originLabel} [${result.probe.origin[0]}, ${result.probe.origin[1]}]`,
      `- Destination: ${result.probe.destinationLabel} [${result.probe.destination[0]}, ${result.probe.destination[1]}]`,
      `- Verdict: ${result.verdict}`,
      `- Read: ${result.reason}`,
      `- Notes: ${result.probe.notes}`,
      '',
      ...buildTopRows(result),
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

async function runProbe(probe: Probe, departureDate: Date): Promise<ProbeResult> {
  const result = await findJourneysWithRaptor({
    origin: { lng: probe.origin[0], lat: probe.origin[1] },
    destination: { lng: probe.destination[0], lat: probe.destination[1] },
    departureDate,
  });
  const ranking = rankRaptorJourneys({
    journeys: result.journeys,
    origin: probe.origin,
    destination: probe.destination,
    destinationName: probe.destinationLabel,
  });
  const classification = classifyProbe(probe, ranking.ranked);

  return {
    probe,
    topJourneys: ranking.ranked,
    diagnostics: result.diagnostics,
    ...classification,
  };
}

async function main() {
  const metadata = await setupSnapshotLoaders();
  const departureDate = new Date(departureIso);
  const results: ProbeResult[] = [];

  for (const probe of probes) {
    const result = await runProbe(probe, departureDate);
    results.push(result);
    console.log(
      `${result.verdict.padEnd(16)} ${probe.id} | ${routeTitle(result.winner)} | ${formatMeters(finalWalkMeters(result.winner))}`,
    );
  }

  await mkdir(path.dirname(outputReportPath), { recursive: true });
  await writeFile(outputReportPath, buildReport(metadata, results, departureDate), 'utf8');
  console.log(`\nRound 9 probe report written to ${outputReportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
