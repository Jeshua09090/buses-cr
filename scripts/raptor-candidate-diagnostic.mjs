import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { StopsIndex } from 'minotor';
import { ungzip } from 'pako';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(repoRoot, 'assets', 'snapshots', 'cartago-local.bin.gz');
const metadataPath = path.join(repoRoot, 'assets', 'snapshots', 'cartago-local.meta.json');
const reportPath = path.join(
  repoRoot,
  '.planning',
  'phases',
  '01-raptor-runtime',
  'WAVE-2-CANDIDATE-DIAGNOSTIC.md',
);

const targetStopName = 'AL COSTADO DE ESCUELA DE SORDOS';
const proximityFloor = 6;
const destinationCompatibleReserve = 8;
const diversityPoolMultiplier = 10;
const destinationContext = {
  label: 'Sanatorio Duran',
  lng: -83.880095,
  lat: 9.931869,
};

const probeOrigins = [
  {
    label: 'Terminal Cartago',
    lng: -83.923164,
    lat: 9.862138,
    why: 'Caso oro Sanatorio fallando',
  },
  {
    label: 'Cartago centro',
    lng: -83.919373,
    lat: 9.864429,
    why: 'Mismo destino, distinto origen, ya pasa',
  },
  {
    label: 'Taras / casa usuario',
    lng: -83.9389683,
    lat: 9.87829,
    why: 'Caso Wave 2 polish que ya pasa',
  },
  {
    label: 'Tres Rios',
    lng: -83.985,
    lat: 9.905,
    why: 'SJ feeder legitimo',
  },
  {
    label: 'La Lima',
    lng: -83.945,
    lat: 9.88,
    why: 'Hub intermedio en corredor SJ',
  },
  {
    label: 'Quebradilla',
    lng: -83.918,
    lat: 9.852,
    why: 'Origen al sur de Cartago',
  },
];

const geoBoxes = [
  {
    key: 'SANATORIO_DURAN_BOX',
    lng: -83.880095,
    lat: 9.931869,
  },
  {
    key: 'TIERRA_BLANCA_LA_PASTORA_BOX',
    lng: -83.864618,
    lat: 9.9476,
  },
  {
    key: 'TOBOSI_BOX',
    lng: -83.945,
    lat: 9.84,
  },
  {
    key: 'GUADALUPE_GOLDEN_COORD_BOX',
    lng: -83.9244086,
    lat: 9.8660225,
  },
  {
    key: 'GUADALUPE_TENTATIVE_BOX',
    lng: -83.917,
    lat: 9.879,
  },
  {
    key: 'LOS_MOLINOS_GOLDEN_COORD_BOX',
    lng: -83.93022614,
    lat: 9.85522867,
  },
  {
    key: 'SAN_BLAS_CONTROL_BOX',
    lng: -83.9106802132904,
    lat: 9.87732094323902,
  },
];

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

function haversineMeters(a, b) {
  const earthRadiusMeters = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toParadaId(stop) {
  const parsed = Number(stop.sourceStopId);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function routeHead(routeName) {
  return routeName
    .replace(/\s*\/\s*(IDA|VUELTA|REGRESO|RETORNO|LOOP).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatRouteNames(routeNames) {
  if (routeNames.length === 0) {
    return 'Sin rutas';
  }
  const visible = routeNames.slice(0, 5);
  const suffix = routeNames.length > visible.length ? ` (+${routeNames.length - visible.length} more)` : '';
  return `${visible.join(', ')}${suffix}`;
}

function buildRoutesByParadaId(metadata) {
  const routesByParadaId = new Map();
  const directory = metadata.service_route_directory ?? {};

  for (const [serviceRouteId, entry] of Object.entries(directory)) {
    for (const subArc of entry.sub_arcs ?? []) {
      for (const paradaId of subArc.parada_ids ?? []) {
        if (!routesByParadaId.has(paradaId)) {
          routesByParadaId.set(paradaId, new Map());
        }
        const routes = routesByParadaId.get(paradaId);
        if (!routes.has(entry.route_name)) {
          routes.set(entry.route_name, []);
        }
        routes.get(entry.route_name).push({
          serviceRouteId: Number(serviceRouteId),
          patternId: entry.pattern_id,
          patternName: entry.pattern_name,
        });
      }
    }
  }

  return routesByParadaId;
}

function routeNamesForStop(stop, routesByParadaId) {
  const paradaId = toParadaId(stop);
  if (paradaId === null) {
    return [];
  }
  return Array.from(routesByParadaId.get(paradaId)?.keys() ?? []).sort((a, b) => a.localeCompare(b));
}

function candidateFromStop(stop, origin, routesByParadaId) {
  if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') {
    return null;
  }

  const routeNames = routeNamesForStop(stop, routesByParadaId);
  return {
    stop,
    stopId: stop.id,
    paradaId: toParadaId(stop),
    name: stop.name,
    distanceMeters: Math.round(haversineMeters(origin, { lat: stop.lat, lng: stop.lon })),
    routeNames,
    routeHeads: new Set(routeNames.map(routeHead)),
  };
}

function nearestCandidates(stopsIndex, origin, routesByParadaId, limit, destinationRouteNames = new Set()) {
  const expandedPool = stopsIndex
    .findStopsByLocation(origin.lat, origin.lng, Math.max(limit * diversityPoolMultiplier, 48), 1.5)
    .map((stop) => candidateFromStop(stop, origin, routesByParadaId))
    .filter(Boolean)
    .filter((candidate) => candidate.distanceMeters <= 1500)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
  const selected = [];
  const selectedStopIds = new Set();
  const seenRouteNames = new Set();

  const coveredDestinationRouteNames = new Set();

  function addCandidate(candidate, phase) {
    selected.push({ ...candidate, phase });
    selectedStopIds.add(candidate.stopId);
    for (const routeName of candidate.routeNames) {
      seenRouteNames.add(routeName);
      if (destinationRouteNames.has(routeName)) {
        coveredDestinationRouteNames.add(routeName);
      }
    }
  }

  function fillByProximity(candidates, phase) {
    for (const candidate of candidates) {
      if (selected.length >= limit) break;
      if (selectedStopIds.has(candidate.stopId)) continue;
      addCandidate(candidate, phase);
    }
  }

  fillByProximity(expandedPool.slice(0, Math.min(proximityFloor, limit)), '1-proximity');

  if (destinationRouteNames.size > 0) {
    let destinationCompatibleSelected = 0;

    for (const candidate of expandedPool) {
      if (selected.length >= limit) break;
      if (destinationCompatibleSelected >= destinationCompatibleReserve) break;
      if (selectedStopIds.has(candidate.stopId)) continue;

      const compatibleRouteNames = candidate.routeNames.filter(
        (routeName) => destinationRouteNames.has(routeName) && !coveredDestinationRouteNames.has(routeName),
      );
      if (compatibleRouteNames.length === 0) continue;

      addCandidate(candidate, `2A-destination-compatible:${compatibleRouteNames.join('; ')}`);
      destinationCompatibleSelected += 1;
    }
  }

  for (const candidate of expandedPool) {
    if (selected.length >= limit) break;
    if (selectedStopIds.has(candidate.stopId)) continue;
    if (!candidate.routeNames.some((routeName) => !seenRouteNames.has(routeName))) continue;
    addCandidate(candidate, '2B-generic-diversity');
  }

  fillByProximity(expandedPool, '3-fill');

  return selected.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

function stopTable(candidates) {
  const lines = [
    '| Rank | StopId | ParadaId | Name | Distance (m) | Phase | Route count | Route names |',
    '|---|---:|---:|---|---:|---|---:|---|',
  ];

  candidates.forEach((candidate, index) => {
    lines.push(
      [
        index + 1,
        candidate.stopId,
        candidate.paradaId ?? 'n/a',
        escapeCell(candidate.name),
        candidate.distanceMeters,
        escapeCell(candidate.phase ?? 'n/a'),
        candidate.routeNames.length,
        escapeCell(formatRouteNames(candidate.routeNames)),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
    );
  });

  return lines;
}

function summary(candidates) {
  const routeNames = new Set();
  const routeHeads = new Set();

  for (const candidate of candidates) {
    for (const routeName of candidate.routeNames) {
      routeNames.add(routeName);
      routeHeads.add(routeHead(routeName));
    }
  }

  return {
    routeNameCount: routeNames.size,
    routeHeadCount: routeHeads.size,
    routeNames,
  };
}

function targetVerdict(candidates, allStops, origin) {
  const target = normalize(targetStopName);
  const rankedMatchIndex = candidates.findIndex((candidate) => normalize(candidate.name).includes(target));

  if (rankedMatchIndex >= 0) {
    const candidate = candidates[rankedMatchIndex];
    return `present in top ${candidates.length} at rank ${rankedMatchIndex + 1} (${candidate.distanceMeters} m, ${candidate.phase ?? 'unknown phase'})`;
  }

  const closestMatch = allStops
    .map((stop) => candidateFromStop(stop, origin, new Map()))
    .filter(Boolean)
    .filter((candidate) => normalize(candidate.name).includes(target))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];

  if (!closestMatch) {
    return 'absent (closest match: no stop name matched target text)';
  }

  return `absent (closest match: ${closestMatch.name} at ${closestMatch.distanceMeters} m)`;
}

function probeSection(probe, stopsIndex, allStops, routesByParadaId, destinationRouteNames) {
  const origin = { lat: probe.lat, lng: probe.lng };
  const top24 = nearestCandidates(stopsIndex, origin, routesByParadaId, 24, destinationRouteNames);
  const top12 = nearestCandidates(stopsIndex, origin, routesByParadaId, 12, destinationRouteNames);
  const top12Summary = summary(top12);
  const top24Summary = summary(top24);
  const newRouteNames = Array.from(top24Summary.routeNames).filter((routeName) => !top12Summary.routeNames.has(routeName));

  return {
    probe,
    top12,
    top24,
    top12Summary,
    top24Summary,
    lines: [
      `### ${probe.label} [${probe.lng}, ${probe.lat}]`,
      '',
      `Why: ${probe.why}`,
      '',
      '#### Top 12 (limit=12, radius=1500m, destination-aware)',
      '',
      ...stopTable(top12),
      '',
      `Summary: ${top12Summary.routeNameCount} unique route names, ${top12Summary.routeHeadCount} unique route heads.`,
      '',
      `Looking for \`${targetStopName}\`: ${targetVerdict(top12, allStops, origin)}.`,
      '',
      '#### Top 24 (limit=24, radius=1500m, destination-aware)',
      '',
      ...stopTable(top24),
      '',
      `Summary: ${top24Summary.routeNameCount} unique route names, ${top24Summary.routeHeadCount} unique route heads.`,
      '',
      `Delta vs top 12: +${newRouteNames.length} new route names introduced.`,
      '',
      `Looking for \`${targetStopName}\`: ${targetVerdict(top24, allStops, origin)}.`,
      '',
      '---',
      '',
    ],
  };
}

function centroid(stops) {
  const totals = stops.reduce(
    (acc, stop) => ({
      lat: acc.lat + (stop.lat ?? 0),
      lng: acc.lng + (stop.lon ?? 0),
    }),
    { lat: 0, lng: 0 },
  );
  return {
    lat: Number((totals.lat / stops.length).toFixed(6)),
    lng: Number((totals.lng / stops.length).toFixed(6)),
  };
}

function geoBoxSection(box, allStops, routesByParadaId) {
  const center = { lat: box.lat, lng: box.lng };
  const stopsWithDistance = allStops
    .filter((stop) => typeof stop.lat === 'number' && typeof stop.lon === 'number')
    .map((stop) => ({
      stop,
      distanceMeters: Math.round(haversineMeters(center, { lat: stop.lat, lng: stop.lon })),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const within500 = stopsWithDistance.filter((entry) => entry.distanceMeters <= 500);
  const within1000 = stopsWithDistance.filter((entry) => entry.distanceMeters <= 1000);
  const within2500 = stopsWithDistance.filter((entry) => entry.distanceMeters <= 2500);
  const closest = stopsWithDistance[0];
  const closestRouteNames = closest ? routeNamesForStop(closest.stop, routesByParadaId) : [];
  const verdict = within500.length >= 3 ? 'OK' : within2500.length >= 3 ? 'suspicious' : 'broken';
  const closestFive = stopsWithDistance.slice(0, 5).map((entry) => entry.stop);
  const suggested = within500.length >= 3 || closestFive.length === 0 ? null : centroid(closestFive);
  const lowCoverage = within2500.length < 3;

  return {
    box,
    verdict,
    suggested,
    lines: [
      `### ${box.key} [${box.lng}, ${box.lat}]`,
      '',
      `- Stops within 500m: ${within500.length}`,
      `- Stops within 1000m: ${within1000.length}`,
      `- Stops within 2500m: ${within2500.length}`,
      closest
        ? `- Closest stop: ${closest.stop.name} at ${closest.distanceMeters} m, paradaId ${toParadaId(closest.stop) ?? 'n/a'}, routes ${closestRouteNames.length}: ${formatRouteNames(closestRouteNames)}`
        : '- Closest stop: none',
      `- Verdict: ${verdict}${lowCoverage ? ' (low-coverage - consider widening radiusMeters)' : ''}`,
      suggested
        ? `- Suggested corrected center: [${suggested.lng}, ${suggested.lat}]`
        : '- Suggested corrected center: current center is fine',
      '',
    ],
  };
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
  const allStops = Array.from(stopsIndex);
  const routesByParadaId = buildRoutesByParadaId(metadata);
  const destinationCandidates = nearestCandidates(
    stopsIndex,
    { lat: destinationContext.lat, lng: destinationContext.lng },
    routesByParadaId,
    24,
  );
  const destinationRouteNames = new Set(destinationCandidates.flatMap((candidate) => candidate.routeNames));
  const probeResults = probeOrigins.map((probe) =>
    probeSection(probe, stopsIndex, allStops, routesByParadaId, destinationRouteNames),
  );
  const geoBoxResults = geoBoxes.map((box) => geoBoxSection(box, allStops, routesByParadaId));
  const terminalProbe = probeResults.find((result) => result.probe.label === 'Terminal Cartago');
  const top12Target = terminalProbe?.top12.find((candidate) => normalize(candidate.name).includes(normalize(targetStopName)));
  const top24Target = terminalProbe?.top24.find((candidate) => normalize(candidate.name).includes(normalize(targetStopName)));
  const brokenBoxes = geoBoxResults.filter((result) => result.verdict !== 'OK');
  const top12Diversity = terminalProbe?.top12Summary.routeHeadCount ?? 0;
  const top24Diversity = terminalProbe?.top24Summary.routeHeadCount ?? 0;
  const quickFixRecommended = !top12Target && Boolean(top24Target);
  const diversityRecommended = !top24Target || top24Diversity <= top12Diversity + 1;

  const lines = [
    '# Wave 2 Candidate Diagnostic',
    '',
    `Snapshot version: ${metadata.version ?? 'unknown'}`,
    `Generated at: ${new Date().toISOString()}`,
    `Destination context: ${destinationContext.label} [${destinationContext.lng}, ${destinationContext.lat}]`,
    `Destination route names: ${destinationRouteNames.size}`,
    '',
    '## Probe origins',
    '',
    ...probeResults.flatMap((result) => result.lines),
    '## Geo box verification',
    '',
    ...geoBoxResults.flatMap((result) => result.lines),
    '## Decision',
    '',
    'Based on the data above:',
    '',
    `1. Is the absent-candidate hypothesis confirmed for Terminal Cartago -> Sanatorio? ${!top12Target ? 'yes' : 'no'}${top12Target ? `, target appears in top 12 at ${top12Target.distanceMeters} m.` : top24Target ? `, target is absent from top 12 but appears in top 24 at rank ${terminalProbe.top24.indexOf(top24Target) + 1} (${top24Target.distanceMeters} m).` : ', target is absent from top 24 too.'}`,
    `2. Does bumping limit 12 -> 24 close the gap? ${quickFixRecommended ? 'yes' : 'no'}.`,
    `3. Are any geo box centers broken? ${brokenBoxes.length ? brokenBoxes.map((result) => result.box.key).join(', ') : 'none'}.`,
    '',
    'Recommended next step:',
    `${quickFixRecommended ? '- [x]' : '- [ ]'} Quick fix: bump DEFAULT_STOP_CANDIDATES 12 -> 24`,
    `${diversityRecommended ? '- [x]' : '- [ ]'} Better fix: add route-pattern diversity to findNearestStops`,
    `${brokenBoxes.length ? '- [x]' : '- [ ]'} Geo box correction: ${brokenBoxes.length ? brokenBoxes.map((result) => `${result.box.key}${result.suggested ? ` -> [${result.suggested.lng}, ${result.suggested.lat}]` : ''}`).join('; ') : 'none'}`,
    '- [x] Track A safety net (FU2 tiered penalty)',
    '',
  ];

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, lines.join('\n'), 'utf8');

  console.log(`Candidate diagnostic report written to ${path.relative(repoRoot, reportPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
