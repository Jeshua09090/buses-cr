import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Query, Router, StopsIndex, Timetable } from 'minotor';
import { ungzip } from 'pako';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(repoRoot, 'assets', 'snapshots', 'cartago-local.bin.gz');
const metadataPath = path.join(repoRoot, 'assets', 'snapshots', 'cartago-local.meta.json');
const reportPath = path.join(repoRoot, '.planning', 'phases', '01-raptor-runtime', 'WAVE-2-SPOT-CHECK.md');
const minPassRatio = 0.8;

function readUint32Be(raw, offset) {
  return raw[offset] * 0x1000000 + raw[offset + 1] * 0x10000 + raw[offset + 2] * 0x100 + raw[offset + 3];
}

function decodeBundle(gzipped) {
  const raw = ungzip(gzipped);
  const magic = String.fromCharCode(...raw.slice(0, 4));
  if (magic !== 'MNTR') {
    throw new Error('Invalid snapshot bundle: missing MNTR magic bytes.');
  }

  const version = raw[4];
  if (version !== 1) {
    throw new Error(`Unsupported snapshot version: ${version}`);
  }

  const blobs = new Map();
  let offset = 6;
  for (let index = 0; index < raw[5]; index += 1) {
    const nameLength = raw[offset];
    const blobLength = readUint32Be(raw, offset + 1);
    offset += 5;
    const name = String.fromCharCode(...raw.slice(offset, offset + nameLength));
    offset += nameLength;
    blobs.set(name, raw.slice(offset, offset + blobLength));
    offset += blobLength;
  }

  return blobs;
}

function makeQuery(from, to) {
  return new Query.Builder()
    .from(from)
    .to(to)
    .departureTime(0)
    .maxTransfers(3)
    .minTransferTime(0)
    .transportModes(new Set(['BUS']))
    .build();
}

function routeName(metadata, routeId) {
  const entry = metadata.service_route_directory?.[String(routeId)];
  return entry?.route_name ?? `route ${routeId}`;
}

async function main() {
  const [snapshotBytes, metadataText] = await Promise.all([
    readFile(snapshotPath),
    readFile(metadataPath, 'utf8'),
  ]);
  const metadata = JSON.parse(metadataText);
  const blobs = decodeBundle(snapshotBytes);
  const stopsBlob = blobs.get('stops');
  if (!stopsBlob) {
    throw new Error('Missing stops blob.');
  }

  const stopsIndex = StopsIndex.fromData(stopsBlob);
  const pairs = (metadata.verify_pairs ?? []).slice(0, 20);
  const results = [];

  for (const pair of pairs) {
    const timetableBlob = blobs.get(`tt-${pair.dia_tipo}`);
    if (!timetableBlob) {
      results.push({ pair, reached: false, reason: `missing tt-${pair.dia_tipo}` });
      continue;
    }

    const timetable = Timetable.fromData(timetableBlob);
    const router = new Router(timetable, stopsIndex);
    const result = router.route(makeQuery(pair.from_stop_id, pair.to_stop_id));
    const arrival = result.arrivalAt(pair.to_stop_id, 3);
    results.push({
      pair,
      reached: Boolean(arrival),
      fromName: stopsIndex.findStopById(pair.from_stop_id)?.name ?? String(pair.from_stop_id),
      toName: stopsIndex.findStopById(pair.to_stop_id)?.name ?? String(pair.to_stop_id),
      routeName: routeName(metadata, pair.route_id),
    });
  }

  const reached = results.filter((result) => result.reached).length;
  const passRatio = pairs.length > 0 ? reached / pairs.length : 0;
  const lines = [
    '# Wave 2 Spot Check',
    '',
    `- Snapshot: ${metadata.version}`,
    `- Checked: ${pairs.length}`,
    `- Reached: ${reached}`,
    `- Pass ratio: ${Math.round(passRatio * 100)}%`,
    `- Threshold: ${Math.round(minPassRatio * 100)}%`,
    '',
    '| # | Dia | Route | From | To | Result |',
    '|---|---|---|---|---|---|',
    ...results.map((result, index) => {
      const status = result.reached ? 'PASS' : `FAIL (${result.reason ?? 'unreached'})`;
      return `| ${index + 1} | ${result.pair.dia_tipo} | ${result.routeName} | ${result.fromName} | ${result.toName} | ${status} |`;
    }),
    '',
  ];

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, lines.join('\n'), 'utf8');

  if (passRatio < minPassRatio) {
    throw new Error(`RAPTOR spot-check failed: ${reached}/${pairs.length} reached.`);
  }

  console.log(JSON.stringify({ reportPath, reached, checked: pairs.length, snapshot: metadata.version }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
