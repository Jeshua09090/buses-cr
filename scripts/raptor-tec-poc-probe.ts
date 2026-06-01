#!/usr/bin/env tsx

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { findJourneysWithRaptor } from '../lib/raptor/find-journeys';
import { DEFAULT_RAPTOR_LAB_DEPARTURE_ISO } from '../lib/raptor/lab-validation-time';
import { rankRaptorJourneys } from '../lib/raptor/journey-ranking';
import { setSnapshotLoadersForTesting } from '../lib/raptor/snapshot-cache';
import type { PlannedJourney } from '../lib/journey-planner';
import type { SnapshotMetadata } from '../lib/raptor/types';

type TecProbeCase = {
  id: string;
  originLabel: string;
  origin: [number, number];
};

const projectRoot = path.resolve(__dirname, '..');
const snapshotPath = path.join(projectRoot, 'assets', 'snapshots', 'cartago-local.bin.gz');
const metadataPath = path.join(projectRoot, 'assets', 'snapshots', 'cartago-local.meta.json');
const departureIso = process.env.RAPTOR_TEC_PROBE_DEPARTURE_ISO ?? DEFAULT_RAPTOR_LAB_DEPARTURE_ISO;
const detailLimit = Number(process.env.RAPTOR_TEC_PROBE_DETAIL_LIMIT ?? 5);
const maxTransfers =
  process.env.RAPTOR_TEC_PROBE_MAX_TRANSFERS == null
    ? undefined
    : Number(process.env.RAPTOR_TEC_PROBE_MAX_TRANSFERS);

const TEC_CARTAGO: [number, number] = [-83.9124243, 9.8554619];

const cases: TecProbeCase[] = [
  {
    id: 'taras-tec',
    originLabel: 'Taras / Casa de los Patos',
    origin: [-83.9389683, 9.87829],
  },
  {
    id: 'llano-tec',
    originLabel: 'Llano Grande centro',
    origin: [-83.910782, 9.9412609],
  },
  {
    id: 'quircot-tec',
    originLabel: 'Quircot / Iglesia',
    origin: [-83.92947387695312, 9.888154029846191],
  },
  {
    id: 'sannicolas-tec',
    originLabel: 'San Nicolas / Casa Fello Meza',
    origin: [-83.9365091, 9.8766104],
  },
  {
    id: 'tierrablanca-tec',
    originLabel: 'Tierra Blanca centro',
    origin: [-83.892355, 9.9161836],
  },
];

function formatMeters(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${Math.round(value)}m`;
}

function journeyTitle(journey: PlannedJourney | null) {
  if (!journey) return 'Sin ruta';
  return journey.legs
    .map((leg) => leg.routeName ?? leg.routeCode ?? leg.routeId)
    .filter(Boolean)
    .join(' luego ');
}

function boardTitle(journey: PlannedJourney | null) {
  if (!journey) return 'Sin subida';
  return journey.boardStopName ?? journey.legs[0]?.boardStopName ?? 'Sin subida';
}

function dropTitle(journey: PlannedJourney | null) {
  if (!journey) return 'Sin bajada';
  return journey.dropStopName ?? journey.legs[journey.legs.length - 1]?.alightStopName ?? 'Sin bajada';
}

function finalWalk(journey: PlannedJourney | null) {
  if (!journey) return null;
  return journey.geoMetrics?.finalWalkNetworkMeters ?? journey.destinationWalkMeters;
}

async function main() {
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as SnapshotMetadata;
  const bytes = await readFile(snapshotPath);

  setSnapshotLoadersForTesting({
    loadMetadata: () => metadata,
    loadBytes: async () => new Uint8Array(bytes),
  });

  const rows = [];

  for (const probeCase of cases) {
    const result = await findJourneysWithRaptor({
      origin: { lat: probeCase.origin[1], lng: probeCase.origin[0] },
      destination: { lat: TEC_CARTAGO[1], lng: TEC_CARTAGO[0] },
      departureDate: new Date(departureIso),
      ...(Number.isFinite(maxTransfers) ? { maxTransfers } : {}),
    });
    const ranking = rankRaptorJourneys({
      journeys: result.journeys,
      origin: probeCase.origin,
      destination: TEC_CARTAGO,
      destinationName: 'Tecnologico de Costa Rica (TEC)',
    });
    const ranked = ranking.ranked.slice(0, detailLimit);
    const winner = ranked[0] ?? null;

    rows.push({
      id: probeCase.id,
      origin: probeCase.originLabel,
      winner: journeyTitle(winner),
      board: boardTitle(winner),
      drop: dropTitle(winner),
      finalWalk: formatMeters(finalWalk(winner)),
      totalWalk: formatMeters(winner?.totalWalkMeters),
      transfers: winner ? Math.max(0, winner.legs.length - 1) : 0,
      top: ranked.map((journey, index) => ({
        rank: index + 1,
        route: journeyTitle(journey),
        board: boardTitle(journey),
        drop: dropTitle(journey),
        finalWalk: formatMeters(finalWalk(journey)),
        totalWalk: formatMeters(journey.totalWalkMeters),
        transfers: Math.max(0, journey.legs.length - 1),
      })),
      diagnostics: result.diagnostics,
    });
  }

  console.log(JSON.stringify({
    snapshot: metadata.version,
    departureIso,
    maxTransfers: Number.isFinite(maxTransfers) ? maxTransfers : 'default',
    destination: 'TEC Cartago',
    rows,
  }, null, 2));
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
