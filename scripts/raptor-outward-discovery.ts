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

type DiscoveryVerdict =
  | 'SNAPSHOT_REACHABLE'
  | 'EXPECTED_CORRIDOR'
  | 'ACCEPTABLE_CORRIDOR'
  | 'LONG_WALK_WATCH'
  | 'DATA_GAP'
  | 'ROUTE_FAMILY_WATCH';

type OutwardCase = {
  id: string;
  group: string;
  originLabel: string;
  origin: [number, number];
  destinationLabel: string;
  destination: [number, number];
  expectedHints?: readonly string[];
  acceptableHints?: readonly string[];
  maxFinalWalkMeters: number;
  notes: string;
};

type OutwardResult = {
  discoveryCase: OutwardCase;
  verdict: DiscoveryVerdict;
  reason: string;
  winner: PlannedJourney | null;
  topJourneys: PlannedJourney[];
  diagnostics: Awaited<ReturnType<typeof findJourneysWithRaptor>>['diagnostics'];
};

const projectRoot = path.resolve(__dirname, '..');
const defaultSnapshotPath = path.join(projectRoot, 'assets', 'snapshots', 'cartago-local.bin.gz');
const defaultMetadataPath = path.join(projectRoot, 'assets', 'snapshots', 'cartago-local.meta.json');

function getCliValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const caseSet = getCliValue('case-set') ?? process.env.RAPTOR_OUTWARD_CASE_SET ?? 'round1';
const snapshotPath = path.resolve(
  getCliValue('snapshot-bin') ?? process.env.RAPTOR_OUTWARD_SNAPSHOT_BIN ?? defaultSnapshotPath,
);
const metadataPath = path.resolve(
  getCliValue('snapshot-meta') ?? process.env.RAPTOR_OUTWARD_SNAPSHOT_META ?? defaultMetadataPath,
);
const defaultReportFiles: Record<string, string> = {
  round1: 'CARTAGO-OUTWARD-RAPTOR-BASELINE.md',
  round2: 'CARTAGO-OUTWARD-ROUND-2-RAPTOR-BASELINE.md',
  'sj-connectors': 'SAN-JOSE-CONNECTOR-STEP-0-RAPTOR-BASELINE.md',
};
const defaultReportFile = defaultReportFiles[caseSet] ?? 'CARTAGO-OUTWARD-RAPTOR-BASELINE.md';
const defaultReportPath = path.join(projectRoot, '.planning', 'phases', '01-raptor-runtime', defaultReportFile);

const requestedReportPath = getCliValue('report') ?? process.env.RAPTOR_OUTWARD_REPORT_PATH;
const outputReportPath = requestedReportPath
  ? path.resolve(requestedReportPath)
  : defaultReportPath;
const departureIso = getCliValue('departure') ?? process.env.RAPTOR_OUTWARD_DEPARTURE_ISO ?? DEFAULT_RAPTOR_LAB_DEPARTURE_ISO;
const detailLimit = Number(getCliValue('detail-limit') ?? process.env.RAPTOR_OUTWARD_DETAIL_LIMIT ?? 5);
const maxTransfersOverride = getCliValue('max-transfers') ?? process.env.RAPTOR_OUTWARD_MAX_TRANSFERS;
const maxTransfers = maxTransfersOverride == null ? undefined : Number(maxTransfersOverride);
const routedPairBudgetOverride =
  getCliValue('max-routed-pairs') ?? process.env.RAPTOR_OUTWARD_MAX_ROUTED_PAIRS;
const maxRoutedCandidatePairs =
  routedPairBudgetOverride == null ? undefined : Number(routedPairBudgetOverride);

const CARTAGO_CENTRO: [number, number] = [-83.919373, 9.864429];
const TRES_RIOS_CENTRO: [number, number] = [-83.9875, 9.9067];
const UCR_SAN_PEDRO: [number, number] = [-84.0513, 9.9368];
const CURRIDABAT_CENTRO: [number, number] = [-84.0346, 9.9148];
const SAN_JOSE_CENTRO: [number, number] = [-84.077, 9.9335];
const MERCADO_CENTRAL_SAN_JOSE: [number, number] = [-84.081998, 9.93428];
const HOSPITAL_CALDERON_GUARDIA: [number, number] = [-84.0712, 9.9366];
const HOSPITAL_SAN_JUAN_DIOS: [number, number] = [-84.0827, 9.9317];
const HOSPITAL_MEXICO: [number, number] = [-84.114447, 9.952041];
const ESTADIO_NACIONAL: [number, number] = [-84.107699, 9.936855];
const ICE_SABANA: [number, number] = [-84.1078, 9.9357];
const LA_URUCA_INA: [number, number] = [-84.113, 9.958];
const PARQUE_LA_PAZ: [number, number] = [-84.079, 9.913];
const DESAMPARADOS_CENTRO: [number, number] = [-84.062, 9.897];
const GUADALUPE_CENTRO: [number, number] = [-84.056, 9.948];
const MORAVIA_CENTRO: [number, number] = [-84.049, 9.961];
const PAVAS_CENTRO: [number, number] = [-84.134, 9.944];
const ESCAZU_CENTRO: [number, number] = [-84.139, 9.918];

const round1Cases: readonly OutwardCase[] = [
  {
    id: 'outward-tres-rios-centro',
    group: 'Tres Rios / Curridabat',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Tres Rios centro',
    destination: TRES_RIOS_CENTRO,
    expectedHints: ['TRES RIOS', 'SAN JOSE'],
    maxFinalWalkMeters: 800,
    notes: 'Candidate coordinate for Tres Rios central church/plaza area. Confirm exact pin in Moovit.',
  },
  {
    id: 'outward-terramall',
    group: 'Tres Rios / Curridabat',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Terramall',
    destination: [-83.9844, 9.9057],
    expectedHints: ['TRES RIOS', 'SAN JOSE'],
    maxFinalWalkMeters: 1000,
    notes: 'Common mall/event destination. Candidate coordinate only.',
  },
  {
    id: 'outward-ucr-san-pedro',
    group: 'San Pedro',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'UCR San Pedro',
    destination: UCR_SAN_PEDRO,
    expectedHints: ['SAN PEDRO', 'SAN JOSE'],
    acceptableHints: ['TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Commute/student destination. San Jose-family service is expected to be legitimate here.',
  },
  {
    id: 'outward-curridabat-plaza',
    group: 'Tres Rios / Curridabat',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Curridabat central area',
    destination: CURRIDABAT_CENTRO,
    expectedHints: ['CURRIDABAT', 'SAN PEDRO', 'SAN JOSE'],
    acceptableHints: ['TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Tests whether the current interurban snapshot covers Curridabat as a destination, not just a pass-through.',
  },
  {
    id: 'outward-multiplaza-este',
    group: 'Tres Rios / Curridabat',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Multiplaza del Este',
    destination: [-84.038, 9.9156],
    expectedHints: ['CURRIDABAT', 'SAN PEDRO', 'SAN JOSE'],
    acceptableHints: ['TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Shopping/work destination. Candidate coordinate only.',
  },
  {
    id: 'outward-calderon-guardia',
    group: 'San Jose healthcare',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Hospital Calderon Guardia',
    destination: [-84.0712, 9.9366],
    expectedHints: ['SAN JOSE', 'SAN PEDRO'],
    acceptableHints: ['TRES RIOS'],
    maxFinalWalkMeters: 1600,
    notes: 'Healthcare destination. Likely tests the edge of the Cartago-local snapshot.',
  },
  {
    id: 'outward-san-jose-centro',
    group: 'San Jose core',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'San Jose centro',
    destination: SAN_JOSE_CENTRO,
    expectedHints: ['SAN JOSE'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1500,
    notes: 'Trunk outward baseline.',
  },
  {
    id: 'outward-sabana',
    group: 'San Jose west',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'La Sabana / Contraloria area',
    destination: [-84.1078, 9.9357],
    expectedHints: ['SAN JOSE'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 2200,
    notes: 'Likely west-side coverage stress test; may become DATA_GAP or long-walk watch.',
  },
  {
    id: 'outward-hospital-mexico',
    group: 'San Jose healthcare',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Hospital Mexico',
    destination: [-84.117, 9.9515],
    expectedHints: ['SAN JOSE'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 2500,
    notes: 'Likely stresses whether the current snapshot can serve northwest San Jose at all.',
  },
  {
    id: 'outward-san-pedro-mall',
    group: 'San Pedro',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Mall San Pedro',
    destination: [-84.0557, 9.934],
    expectedHints: ['SAN PEDRO', 'SAN JOSE'],
    acceptableHints: ['TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Commercial San Pedro POI near UCR corridor.',
  },
  {
    id: 'reverse-tres-rios-cartago',
    group: 'Reverse',
    originLabel: 'Tres Rios centro',
    origin: TRES_RIOS_CENTRO,
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['CARTAGO'],
    acceptableHints: ['TRES RIOS', 'TURRIALBA'],
    maxFinalWalkMeters: 1200,
    notes:
      'Return direction for the closest outward corridor. Moovit stop pages list San Jose - Turrialba Colectivo near both Cartago/Tres Rios endpoints; confirm exact trip planner before promoting to golden.',
  },
  {
    id: 'reverse-san-pedro-cartago',
    group: 'Reverse',
    originLabel: 'UCR San Pedro',
    origin: UCR_SAN_PEDRO,
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['CARTAGO'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Important commute return direction.',
  },
  {
    id: 'reverse-curridabat-cartago',
    group: 'Reverse',
    originLabel: 'Curridabat central area',
    origin: CURRIDABAT_CENTRO,
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['CARTAGO'],
    acceptableHints: ['CURRIDABAT', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Return direction from Curridabat.',
  },
  {
    id: 'reverse-san-jose-centro-cartago',
    group: 'Reverse',
    originLabel: 'San Jose centro',
    origin: SAN_JOSE_CENTRO,
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['CARTAGO'],
    acceptableHints: ['SAN JOSE', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Trunk reverse baseline.',
  },
  {
    id: 'outward-tres-rios-to-sanatorio-control',
    group: 'Negative control',
    originLabel: 'Tres Rios centro',
    origin: TRES_RIOS_CENTRO,
    destinationLabel: 'Terminal Sanatorio Duran',
    destination: [-83.88436889648438, 9.932242393493652],
    expectedHints: ['SANATORIO', 'TIERRA BLANCA', 'POTRERO CERRADO'],
    acceptableHints: ['CARTAGO'],
    maxFinalWalkMeters: 1000,
    notes:
      'Control: a San Jose-family first leg may be valid, but the destination side must still honor Sanatorio/Tierra Blanca.',
  },
];

const round2Cases: readonly OutwardCase[] = [
  {
    id: 'r2-cartago-ucr-san-pedro-0700-commute',
    group: 'Commute / education',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'UCR San Pedro',
    destination: UCR_SAN_PEDRO,
    expectedHints: ['SAN PEDRO', 'SAN JOSE'],
    acceptableHints: ['TRES RIOS', 'TURRIALBA'],
    maxFinalWalkMeters: 1200,
    notes: 'High-value student commute. Round 1 already looked reachable; Round 2 keeps it as a sentinel for time-window behavior.',
  },
  {
    id: 'r2-cartago-mall-san-pedro',
    group: 'Commercial',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Mall San Pedro',
    destination: [-84.0557, 9.934],
    expectedHints: ['SAN PEDRO', 'SAN JOSE'],
    acceptableHints: ['TRES RIOS', 'TURRIALBA'],
    maxFinalWalkMeters: 1000,
    notes: 'Common commercial POI with Moovit source evidence from Round 1.',
  },
  {
    id: 'r2-cartago-plaza-del-sol',
    group: 'Commercial',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Plaza del Sol Curridabat',
    destination: [-84.0447, 9.9147],
    expectedHints: ['CURRIDABAT', 'SAN PEDRO', 'SAN JOSE'],
    acceptableHints: ['TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Curridabat commercial destination; helps decide if the current snapshot covers east San Jose POIs beyond direct route names.',
  },
  {
    id: 'r2-cartago-multiplaza-este',
    group: 'Commercial',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Multiplaza del Este',
    destination: [-84.038, 9.9156],
    expectedHints: ['CURRIDABAT', 'SAN PEDRO', 'SAN JOSE', 'MINISTERIO'],
    acceptableHints: ['TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Round 1 reachable; retained as commercial sanity case.',
  },
  {
    id: 'r2-cartago-avenida-central',
    group: 'San Jose core',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Avenida Central / Plaza de la Cultura',
    destination: [-84.0778, 9.9331],
    expectedHints: ['SAN JOSE', 'MINISTERIO'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1500,
    notes: 'Tourist/commercial San Jose core destination. A long final walk may still be acceptable only if Moovit agrees.',
  },
  {
    id: 'r2-cartago-mercado-central',
    group: 'San Jose core',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Mercado Central San Jose',
    destination: [-84.0802, 9.9342],
    expectedHints: ['SAN JOSE', 'MINISTERIO'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1700,
    notes: 'Everyday commercial destination; validates whether central SJ final-walk shape is defensible.',
  },
  {
    id: 'r2-cartago-calderon-guardia',
    group: 'Healthcare',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Hospital Calderon Guardia',
    destination: [-84.0712, 9.9366],
    expectedHints: ['SAN JOSE', 'SAN PEDRO', 'MINISTERIO'],
    acceptableHints: ['TRES RIOS'],
    maxFinalWalkMeters: 1600,
    notes: 'Healthcare sentinel; Round 1 had nearby expected-family alternatives and now serves as a quality watch.',
  },
  {
    id: 'r2-cartago-hospital-san-juan-dios',
    group: 'Healthcare',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Hospital San Juan de Dios',
    destination: [-84.0827, 9.9317],
    expectedHints: ['SAN JOSE', 'MINISTERIO'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1800,
    notes: 'Central healthcare destination; should not be treated as proof of full San Jose metro coverage if walk is marginal.',
  },
  {
    id: 'r2-cartago-hospital-mexico',
    group: 'Healthcare',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Hospital Mexico',
    destination: [-84.117, 9.9515],
    expectedHints: ['SAN JOSE', 'HOSPITAL MEXICO'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 900,
    notes: 'Northwest SJ stress case. If this works, the snapshot has farther reach than expected; confirm with Moovit before goldenizing.',
  },
  {
    id: 'r2-cartago-ice-sabana',
    group: 'Workplace / commute-special',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'ICE Sabana / Contraloria area',
    destination: [-84.1078, 9.9357],
    expectedHints: ['SAN JOSE', 'ICE', 'SABANA'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1600,
    notes: 'Workplace case tied to the Cartago-ICE special-window fix. Validate at 07:00 and 16:00 before treating as stable.',
  },
  {
    id: 'r2-cartago-estadio-nacional',
    group: 'Event / San Jose west',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Estadio Nacional',
    destination: [-84.1076, 9.9369],
    expectedHints: ['SAN JOSE', 'SABANA'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1800,
    notes: 'Event destination near Sabana; tests whether west-side service is real coverage or just a long-walk artifact.',
  },
  {
    id: 'r2-ucr-san-pedro-cartago-1600-return',
    group: 'Reverse commute',
    originLabel: 'UCR San Pedro',
    origin: UCR_SAN_PEDRO,
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['CARTAGO'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS', 'TURRIALBA'],
    maxFinalWalkMeters: 1200,
    notes: 'Important student/worker return direction.',
  },
  {
    id: 'r2-curridabat-cartago-return',
    group: 'Reverse commute',
    originLabel: 'Curridabat central area',
    origin: CURRIDABAT_CENTRO,
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['CARTAGO'],
    acceptableHints: ['CURRIDABAT', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'East San Jose return direction.',
  },
  {
    id: 'r2-san-jose-centro-cartago-return',
    group: 'Reverse trunk',
    originLabel: 'San Jose centro',
    origin: SAN_JOSE_CENTRO,
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['CARTAGO'],
    acceptableHints: ['SAN JOSE', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Core San Jose to Cartago reverse baseline.',
  },
  {
    id: 'r2-hospital-mexico-cartago-return',
    group: 'Reverse healthcare',
    originLabel: 'Hospital Mexico',
    origin: [-84.117, 9.9515],
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['CARTAGO'],
    acceptableHints: ['SAN JOSE', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Return from a northwest San Jose healthcare destination; helps reveal if Hospital Mexico coverage is bidirectional or accidental.',
  },
  {
    id: 'r2-cartago-heredia-centro-boundary',
    group: 'Boundary / future province',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Heredia centro',
    destination: [-84.1165, 9.9985],
    expectedHints: ['HEREDIA', 'SAN JOSE'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 2200,
    notes: 'Boundary probe for snapshot strategy. A failure here is not a Cartago bug; it informs GAM unified vs separated snapshots.',
  },
  {
    id: 'r2-cartago-sjo-airport-boundary',
    group: 'Boundary / future province',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'SJO Airport',
    destination: [-84.2088, 9.9989],
    expectedHints: ['ALAJUELA', 'AEROPUERTO', 'SAN JOSE'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 2500,
    notes: 'Boundary probe for Alajuela. Expected to expose snapshot limits; do not force a Cartago ranking fix if it fails.',
  },
];

const sjConnectorCases: readonly OutwardCase[] = [
  {
    id: 'sj0-cartago-mercado-central',
    group: 'Core San Jose',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Mercado Central San Jose',
    destination: MERCADO_CENTRAL_SAN_JOSE,
    expectedHints: ['SAN JOSE', 'MINISTERIO'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1400,
    notes:
      'Core-SJ sentinel with Moovit Round 2 exact-trip support. Keeps the central long-walk pattern visible while expanding connector probes.',
  },
  {
    id: 'sj0-cartago-avenida-central',
    group: 'Core San Jose',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Avenida Central / Plaza de la Cultura',
    destination: [-84.0778, 9.9331],
    expectedHints: ['SAN JOSE', 'MINISTERIO'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Central commercial/tourist destination; remained a Round 2 source watch because of final-walk shape.',
  },
  {
    id: 'sj0-cartago-calderon-guardia',
    group: 'Healthcare',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Hospital Calderon Guardia',
    destination: HOSPITAL_CALDERON_GUARDIA,
    expectedHints: ['SAN JOSE', 'SAN PEDRO', 'MINISTERIO'],
    acceptableHints: ['TRES RIOS'],
    maxFinalWalkMeters: 900,
    notes: 'Healthcare connector watch. A long final walk suggests missing local SJ connector data or ranking.',
  },
  {
    id: 'sj0-cartago-hospital-san-juan-dios',
    group: 'Healthcare',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Hospital San Juan de Dios',
    destination: HOSPITAL_SAN_JUAN_DIOS,
    expectedHints: ['SAN JOSE', 'MINISTERIO'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 800,
    notes: 'Central healthcare destination that should remain reachable without proving full SJ local coverage.',
  },
  {
    id: 'sj0-cartago-hospital-mexico',
    group: 'Healthcare',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Hospital Mexico',
    destination: HOSPITAL_MEXICO,
    expectedHints: ['HOSPITAL MEXICO', 'SAN JOSE'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 900,
    notes:
      'Northwest healthcare sentinel. Round 2 Moovit trip planner used a local connector; this checks whether RAPTOR still lands close enough.',
  },
  {
    id: 'sj0-cartago-estadio-nacional',
    group: 'West San Jose',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Estadio Nacional',
    destination: ESTADIO_NACIONAL,
    expectedHints: ['SABANA', 'ESTADIO', 'SAN JOSE'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 900,
    notes: 'Event/west-SJ watch. Moovit showed a local UCR/Pavas connector; RAPTOR should not hide this behind a 1km+ walk forever.',
  },
  {
    id: 'sj0-cartago-ice-sabana',
    group: 'West San Jose',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'ICE Sabana / Contraloria area',
    destination: ICE_SABANA,
    expectedHints: ['ICE', 'SABANA', 'SAN JOSE'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 900,
    notes: 'Commute-special destination tied to the Cartago-ICE data fix; should be watched across commute windows.',
  },
  {
    id: 'sj0-cartago-la-uruca-ina',
    group: 'Northwest San Jose',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'INA La Uruca',
    destination: LA_URUCA_INA,
    expectedHints: ['INA', 'URUCA', 'SAN JOSE'],
    acceptableHints: ['SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1000,
    notes: 'Northwest workplace/education sentinel. Coordinate is approximate; source validation required before goldenizing.',
  },
  {
    id: 'sj0-cartago-parque-la-paz',
    group: 'South San Jose',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Parque La Paz',
    destination: PARQUE_LA_PAZ,
    expectedHints: ['SEMINARIO', 'PASO ANCHO', 'MONTE AZUL', 'MADEIRAS'],
    acceptableHints: ['DESAMPARADOS', 'SAN JOSE', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1000,
    notes: 'South/Southeast SJ connector probe. Weak result likely means local SJ data, not Cartago ranking.',
  },
  {
    id: 'sj0-cartago-desamparados-centro',
    group: 'South San Jose',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Desamparados centro',
    destination: DESAMPARADOS_CENTRO,
    expectedHints: ['DESAMPARADOS'],
    acceptableHints: ['SAN JOSE', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1000,
    notes: 'Explicit south-SJ boundary probe. A data gap or long walk is expected until Desamparados routes are seeded.',
  },
  {
    id: 'sj0-cartago-guadalupe-centro',
    group: 'Northeast San Jose',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Guadalupe centro',
    destination: GUADALUPE_CENTRO,
    expectedHints: ['GUADALUPE'],
    acceptableHints: ['SAN JOSE', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1000,
    notes: 'Northeast SJ connector probe; should not be solved by a long central-SJ walk.',
  },
  {
    id: 'sj0-cartago-moravia-centro',
    group: 'Northeast San Jose',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Moravia centro',
    destination: MORAVIA_CENTRO,
    expectedHints: ['MORAVIA'],
    acceptableHints: ['SAN JOSE', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1000,
    notes: 'Northeast SJ boundary probe for future local route data.',
  },
  {
    id: 'sj0-cartago-pavas-centro',
    group: 'West San Jose',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Pavas centro',
    destination: PAVAS_CENTRO,
    expectedHints: ['PAVAS'],
    acceptableHints: ['SAN JOSE', 'SABANA', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1100,
    notes: 'West-SJ connector probe. Round 2 Estadio source used a Pavas/UCR connector, so this is a natural next boundary.',
  },
  {
    id: 'sj0-cartago-escazu-centro',
    group: 'West San Jose',
    originLabel: 'Cartago centro',
    origin: CARTAGO_CENTRO,
    destinationLabel: 'Escazu centro',
    destination: ESCAZU_CENTRO,
    expectedHints: ['ESCAZU'],
    acceptableHints: ['SAN JOSE', 'SABANA', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Far west boundary probe. A failure here informs whether SJ/West routes need explicit seeding before beta.',
  },
  {
    id: 'sj0-estadio-nacional-cartago-return',
    group: 'Reverse west',
    originLabel: 'Estadio Nacional',
    origin: ESTADIO_NACIONAL,
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['CARTAGO'],
    acceptableHints: ['SAN JOSE', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Event return direction; checks if west-side access is bidirectional or just outward reachable.',
  },
  {
    id: 'sj0-hospital-mexico-cartago-return',
    group: 'Reverse healthcare',
    originLabel: 'Hospital Mexico',
    origin: HOSPITAL_MEXICO,
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['CARTAGO'],
    acceptableHints: ['SAN JOSE', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Northwest healthcare return direction already promoted in outward baseline; retained here as connector sentinel.',
  },
  {
    id: 'sj0-desamparados-cartago-return',
    group: 'Reverse south',
    originLabel: 'Desamparados centro',
    origin: DESAMPARADOS_CENTRO,
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['CARTAGO'],
    acceptableHints: ['DESAMPARADOS', 'SAN JOSE', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'South-SJ return probe; useful if future Desamparados data is seeded.',
  },
  {
    id: 'sj0-guadalupe-cartago-return',
    group: 'Reverse northeast',
    originLabel: 'Guadalupe centro',
    origin: GUADALUPE_CENTRO,
    destinationLabel: 'Cartago centro',
    destination: CARTAGO_CENTRO,
    expectedHints: ['CARTAGO'],
    acceptableHints: ['GUADALUPE', 'SAN JOSE', 'SAN PEDRO', 'TRES RIOS'],
    maxFinalWalkMeters: 1200,
    notes: 'Northeast-SJ return probe; likely local-route data dependent.',
  },
];

const caseSets: Record<string, readonly OutwardCase[]> = {
  round1: round1Cases,
  round2: round2Cases,
  'sj-connectors': sjConnectorCases,
};
const cases = caseSets[caseSet];

if (!cases) {
  throw new Error(`Unknown RAPTOR_OUTWARD_CASE_SET "${caseSet}". Expected one of: ${Object.keys(caseSets).join(', ')}`);
}

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

function transferCount(journey: PlannedJourney | null) {
  return journey ? Math.max(0, journey.legs.length - 1) : 0;
}

function formatMeters(value: number | null) {
  return value === null ? 'n/a' : `${value}m`;
}

function classifyDiscovery(
  discoveryCase: OutwardCase,
  ranked: PlannedJourney[],
): Pick<OutwardResult, 'reason' | 'verdict' | 'winner'> {
  const winner = ranked[0] ?? null;
  if (!winner) {
    return { reason: 'RAPTOR returned no journey.', verdict: 'DATA_GAP', winner };
  }

  const winnerTitle = routeTitle(winner);
  const winnerFinalWalk = finalWalkMeters(winner);
  const expectedWinner = matchesAny(winnerTitle, discoveryCase.expectedHints);
  const acceptableWinner = matchesAny(winnerTitle, discoveryCase.acceptableHints);
  const expectedRank = ranked.findIndex((journey) => matchesAny(routeTitle(journey), discoveryCase.expectedHints));
  const acceptableRank = ranked.findIndex((journey) =>
    matchesAny(routeTitle(journey), discoveryCase.acceptableHints),
  );

  if (winnerFinalWalk !== null && winnerFinalWalk > discoveryCase.maxFinalWalkMeters) {
    return {
      reason: `Winner final walk ${winnerFinalWalk}m exceeds ${discoveryCase.maxFinalWalkMeters}m.`,
      verdict: 'LONG_WALK_WATCH',
      winner,
    };
  }

  if (expectedWinner) {
    return { reason: `Winner matches expected corridor hint: ${winnerTitle}.`, verdict: 'EXPECTED_CORRIDOR', winner };
  }

  if (acceptableWinner) {
    return {
      reason: `Winner matches acceptable corridor hint pending Moovit comparison: ${winnerTitle}.`,
      verdict: 'ACCEPTABLE_CORRIDOR',
      winner,
    };
  }

  if (expectedRank >= 0 && expectedRank < 5) {
    return {
      reason: `Expected corridor appears at rank ${expectedRank + 1}, winner is ${winnerTitle}.`,
      verdict: 'ROUTE_FAMILY_WATCH',
      winner,
    };
  }

  if (acceptableRank >= 0 && acceptableRank < 5) {
    return {
      reason: `Acceptable corridor appears at rank ${acceptableRank + 1}, winner is ${winnerTitle}.`,
      verdict: 'ROUTE_FAMILY_WATCH',
      winner,
    };
  }

  return {
    reason: `Snapshot returns a route, but winner needs Moovit/source comparison: ${winnerTitle}.`,
    verdict: 'SNAPSHOT_REACHABLE',
    winner,
  };
}

function firstMatchingRank(journeys: PlannedJourney[], hints: readonly string[] = []) {
  const index = journeys.findIndex((journey) => matchesAny(routeTitle(journey), hints));
  return index >= 0 ? index + 1 : null;
}

function markdownEscape(value: string | null | undefined) {
  return (value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildTopRows(result: OutwardResult) {
  if (result.topJourneys.length === 0) return ['No journeys returned.'];

  return [
    '| # | Route | Board | Final | Final walk | Total walk | Transfers | Score | Reasons |',
    '|---:|---|---|---|---:|---:|---:|---:|---|',
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
        transferCount(journey),
        Math.round(journey.score * 10) / 10,
        markdownEscape(reasons ?? ''),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |');
    }),
  ];
}

function buildReport(metadata: SnapshotMetadata, results: OutwardResult[], departureDate: Date) {
  const counts = results.reduce<Record<DiscoveryVerdict, number>>(
    (acc, result) => {
      acc[result.verdict] += 1;
      return acc;
    },
    {
      ACCEPTABLE_CORRIDOR: 0,
      DATA_GAP: 0,
      EXPECTED_CORRIDOR: 0,
      LONG_WALK_WATCH: 0,
      ROUTE_FAMILY_WATCH: 0,
      SNAPSHOT_REACHABLE: 0,
    },
  );

  return [
    caseSet === 'round2'
      ? '# Cartago Outward Round 2 RAPTOR Baseline'
      : caseSet === 'sj-connectors'
        ? '# San Jose Connector Step 0 RAPTOR Baseline'
        : '# Cartago Outward RAPTOR Baseline',
    '',
    `- Case set: \`${caseSet}\``,
    `- Snapshot: \`${metadata.version}\``,
    `- Departure: \`${departureDate.toISOString()}\``,
    `- Checked: ${results.length}`,
    `- EXPECTED_CORRIDOR: ${counts.EXPECTED_CORRIDOR}`,
    `- ACCEPTABLE_CORRIDOR: ${counts.ACCEPTABLE_CORRIDOR}`,
    `- SNAPSHOT_REACHABLE: ${counts.SNAPSHOT_REACHABLE}`,
    `- Watches: ${counts.LONG_WALK_WATCH + counts.ROUTE_FAMILY_WATCH}`,
    `- DATA_GAP: ${counts.DATA_GAP}`,
    `- Routed-pair budget override: ${process.env.EXPO_PUBLIC_RAPTOR_ROUTED_PAIR_BUDGET ?? 'default'}`,
    '',
    '> This is a RAPTOR snapshot baseline only. Coordinates are seed candidates and must be confirmed in Chrome/Moovit before final verdicts or goldens.',
    '',
    '## Summary',
    '',
    '| Case | Group | Verdict | Winner | Board | Final | Final walk | Transfers | Expected rank | Acceptable rank | Routed pairs | Reason |',
    '|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|',
    ...results.map((result) =>
      [
        markdownEscape(result.discoveryCase.id),
        markdownEscape(result.discoveryCase.group),
        result.verdict,
        markdownEscape(routeTitle(result.winner)),
        markdownEscape(boardStop(result.winner)),
        markdownEscape(finalStop(result.winner)),
        formatMeters(finalWalkMeters(result.winner)),
        transferCount(result.winner),
        firstMatchingRank(result.topJourneys, result.discoveryCase.expectedHints) ?? 'n/a',
        firstMatchingRank(result.topJourneys, result.discoveryCase.acceptableHints ?? []) ?? 'n/a',
        result.diagnostics?.routedCandidatePairs ?? 0,
        markdownEscape(result.reason),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
    ),
    '',
    '## Details',
    '',
    ...results.flatMap((result) => [
      `### ${result.discoveryCase.id}`,
      '',
      `- Group: ${result.discoveryCase.group}`,
      `- Origin: ${result.discoveryCase.originLabel} [${result.discoveryCase.origin[0]}, ${result.discoveryCase.origin[1]}]`,
      `- Destination: ${result.discoveryCase.destinationLabel} [${result.discoveryCase.destination[0]}, ${result.discoveryCase.destination[1]}]`,
      `- Verdict: ${result.verdict}`,
      `- Read: ${result.reason}`,
      `- Notes: ${result.discoveryCase.notes}`,
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

async function runCase(discoveryCase: OutwardCase, departureDate: Date): Promise<OutwardResult> {
  const result = await findJourneysWithRaptor({
    origin: { lng: discoveryCase.origin[0], lat: discoveryCase.origin[1] },
    destination: { lng: discoveryCase.destination[0], lat: discoveryCase.destination[1] },
    departureDate,
    ...(Number.isFinite(maxTransfers) ? { maxTransfers } : {}),
    ...(Number.isFinite(maxRoutedCandidatePairs) ? { maxRoutedCandidatePairs } : {}),
  });
  const ranking = rankRaptorJourneys({
    journeys: result.journeys,
    origin: discoveryCase.origin,
    destination: discoveryCase.destination,
    destinationName: discoveryCase.destinationLabel,
  });
  const classification = classifyDiscovery(discoveryCase, ranking.ranked);

  return {
    discoveryCase,
    topJourneys: ranking.ranked,
    diagnostics: result.diagnostics,
    ...classification,
  };
}

async function main() {
  const metadata = await setupSnapshotLoaders();
  const departureDate = new Date(departureIso);
  const results: OutwardResult[] = [];

  for (const discoveryCase of cases) {
    const result = await runCase(discoveryCase, departureDate);
    results.push(result);
    console.log(
      `${result.verdict.padEnd(19)} ${discoveryCase.id} | ${routeTitle(result.winner)} | ${formatMeters(finalWalkMeters(result.winner))}`,
    );
  }

  await mkdir(path.dirname(outputReportPath), { recursive: true });
  await writeFile(outputReportPath, buildReport(metadata, results, departureDate), 'utf8');
  console.log(`\nCartago outward baseline written to ${outputReportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
