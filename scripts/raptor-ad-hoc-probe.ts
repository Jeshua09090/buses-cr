#!/usr/bin/env tsx

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { findJourneysWithRaptor } from '../lib/raptor/find-journeys';
import { DEFAULT_RAPTOR_LAB_DEPARTURE_ISO } from '../lib/raptor/lab-validation-time';
import { rankRaptorJourneys } from '../lib/raptor/journey-ranking';
import { setSnapshotLoadersForTesting } from '../lib/raptor/snapshot-cache';
import type { SnapshotMetadata } from '../lib/raptor/types';

function getCliValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseCoordinatePair(rawValue: string | undefined, label: string): [number, number] {
  if (!rawValue) {
    throw new Error(`Missing --${label}=lng,lat`);
  }

  const [lngRaw, latRaw] = rawValue.split(',').map((value) => Number(value.trim()));
  if (!Number.isFinite(lngRaw) || !Number.isFinite(latRaw)) {
    throw new Error(`Invalid --${label}; expected lng,lat and got ${rawValue}`);
  }

  return [lngRaw, latRaw];
}

function formatReasons(journeyId: string, ranking: ReturnType<typeof rankRaptorJourneys>) {
  const reasons = ranking.debugById.get(journeyId)?.reasons ?? [];
  if (reasons.length === 0) return 'none';
  return reasons.map((reason) => `${reason.id}:${reason.penalty}`).join('; ');
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const snapshotPath = path.join(projectRoot, 'assets', 'snapshots', 'cartago-local.bin.gz');
  const metadataPath = path.join(projectRoot, 'assets', 'snapshots', 'cartago-local.meta.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as SnapshotMetadata;

  setSnapshotLoadersForTesting({
    loadMetadata: () => metadata,
    loadBytes: async () => new Uint8Array(await readFile(snapshotPath)),
  });

  const origin = parseCoordinatePair(getCliValue('origin'), 'origin');
  const destination = parseCoordinatePair(getCliValue('destination'), 'destination');
  const destinationName = getCliValue('destination-name') ?? 'Ad hoc destination';
  const departureIso = getCliValue('departure') ?? DEFAULT_RAPTOR_LAB_DEPARTURE_ISO;
  const detailLimit = Number(getCliValue('detail-limit') ?? 10);
  const maxTransfersOverride = getCliValue('max-transfers');
  const maxRoutedPairsOverride = getCliValue('max-routed-pairs');
  const departureDate = new Date(departureIso);

  if (Number.isNaN(departureDate.getTime())) {
    throw new Error(`Invalid --departure value: ${departureIso}`);
  }

  const result = await findJourneysWithRaptor({
    origin: { lng: origin[0], lat: origin[1] },
    destination: { lng: destination[0], lat: destination[1] },
    departureDate,
    perfDiagnostics: true,
    ...(maxTransfersOverride == null ? {} : { maxTransfers: Number(maxTransfersOverride) }),
    ...(maxRoutedPairsOverride == null
      ? {}
      : { maxRoutedCandidatePairs: Number(maxRoutedPairsOverride) }),
  });
  const ranking = rankRaptorJourneys({
    journeys: result.journeys,
    origin,
    destination,
    destinationName,
  });

  console.log(`origin=${origin.join(',')}`);
  console.log(`destination=${destination.join(',')} (${destinationName})`);
  console.log(`departure=${departureDate.toISOString()}`);
  console.log(`snapshot=${result.diagnostics?.snapshotVersion ?? 'unknown'}`);
  console.log(`journeys=${result.journeys.length}`);
  console.log('');

  for (const [index, journey] of ranking.ranked.slice(0, detailLimit).entries()) {
    console.log(
      [
        `#${index + 1}`,
        journey.kind,
        journey.routeName,
        `score=${journey.score.toFixed(1)}`,
        `display=${ranking.debugById.get(journey.id)?.displayScore.toFixed(1) ?? 'n/a'}`,
        `walk=${Math.round(journey.totalWalkMeters)}m`,
        `origin=${Math.round(journey.originWalkMeters)}m`,
        `transfer=${Math.round(journey.transferWalkMeters)}m`,
        `final=${Math.round(journey.destinationWalkMeters)}m`,
      ].join(' | '),
    );
    console.log(`  id=${journey.id}`);
    console.log(`  board=${journey.boardStopName ?? 'n/a'}`);
    console.log(`  drop=${journey.dropStopName ?? 'n/a'}`);
    console.log(`  reasons=${formatReasons(journey.id, ranking)}`);
    for (const leg of journey.legs ?? []) {
      console.log(
        `  leg=${leg.routeName} :: ${leg.boardStopName} (${leg.boardStopId ?? 'n/a'}) -> ${leg.alightStopName} (${leg.alightStopId ?? 'n/a'})`,
      );
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
