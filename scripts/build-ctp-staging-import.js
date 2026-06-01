'use strict';

const fs = require('fs');
const path = require('path');

function getArg(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return fallback;
  }
  return process.argv[index + 1];
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function sqlString(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  return `'${escapeSqlLiteral(value)}'`;
}

function sqlJson(value) {
  const json = JSON.stringify(value ?? {});
  return `${sqlString(json)}::jsonb`;
}

function toMultiLineGeometry(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === 'MultiLineString') {
    return geometry;
  }

  if (geometry.type === 'LineString') {
    return {
      type: 'MultiLineString',
      coordinates: [geometry.coordinates],
    };
  }

  return geometry;
}

function chunk(array, size) {
  const items = [];
  for (let i = 0; i < array.length; i += size) {
    items.push(array.slice(i, i + size));
  }
  return items;
}

function buildStopRows(features) {
  return features
    .map((feature) => {
      const props = feature.properties ?? {};
      const coords = feature.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) {
        return null;
      }

      return {
        sourceId: Number(props.id),
        sourceIdentifier: props.identifica,
        descriptionRaw: props.descripcio ?? null,
        lng: Number(coords[0]),
        lat: Number(coords[1]),
        metadata: props,
      };
    })
    .filter((row) => Number.isFinite(row?.sourceId) && Number.isFinite(row?.lat) && Number.isFinite(row?.lng) && row?.sourceIdentifier);
}

function buildRouteRows(features) {
  return features
    .map((feature) => {
      const props = feature.properties ?? {};
      const geom = toMultiLineGeometry(feature.geometry);
      if (!geom || !props.identifica) {
        return null;
      }

      return {
        sourceId: Number(props.id),
        routeCode: props.ruta,
        variantCode: props.identifica,
        descriptionRaw: props.descripcio ?? null,
        directionRaw: props.sentido ?? null,
        geometry: geom,
        metadata: props,
      };
    })
    .filter((row) => Number.isFinite(row?.sourceId) && row?.routeCode && row?.variantCode && row?.geometry);
}

function writeSqlBatches(outDir, prefix, rows, batchSize, formatter) {
  const files = [];
  chunk(rows, batchSize).forEach((batch, index) => {
    const fileName = `${String(index + 1).padStart(3, '0')}_${prefix}.sql`;
    const fullPath = path.join(outDir, fileName);
    fs.writeFileSync(fullPath, formatter(batch), 'utf8');
    files.push(fullPath);
  });
  return files;
}

function formatStopsSql(batch) {
  const values = batch.map((row) => `(${row.sourceId}, ${sqlString(row.sourceIdentifier)}, ${sqlString(row.descriptionRaw)}, ${row.lat}, ${row.lng}, ${sqlJson(row.metadata)})`).join(',\n');
  return [
    'insert into public.staging_ctp_official_stops (',
    '  source_id,',
    '  source_identifier,',
    '  description_raw,',
    '  lat,',
    '  lng,',
    '  metadata',
    ') values',
    values,
    'on conflict (source_id) do update set',
    '  source_identifier = excluded.source_identifier,',
    '  description_raw = excluded.description_raw,',
    '  lat = excluded.lat,',
    '  lng = excluded.lng,',
    '  metadata = excluded.metadata,',
    "  updated_at = timezone('utc', now());",
    '',
  ].join('\n');
}

function formatRoutesSql(batch) {
  const values = batch.map((row) => {
    const geometryJson = escapeSqlLiteral(JSON.stringify(row.geometry));
    return `(${row.sourceId}, ${sqlString(row.routeCode)}, ${sqlString(row.variantCode)}, ${sqlString(row.descriptionRaw)}, ${sqlString(row.directionRaw)}, st_setsrid(st_geomfromgeojson('${geometryJson}'), 4326)::geometry(MultiLineString, 4326), ${sqlJson(row.metadata)})`;
  }).join(',\n');

  return [
    'insert into public.staging_ctp_official_route_variants (',
    '  source_id,',
    '  route_code,',
    '  variant_code,',
    '  description_raw,',
    '  direction_raw,',
    '  geom,',
    '  metadata',
    ') values',
    values,
    'on conflict (source_id) do update set',
    '  route_code = excluded.route_code,',
    '  variant_code = excluded.variant_code,',
    '  description_raw = excluded.description_raw,',
    '  direction_raw = excluded.direction_raw,',
    '  geom = excluded.geom,',
    '  metadata = excluded.metadata,',
    "  updated_at = timezone('utc', now());",
    '',
  ].join('\n');
}

function writeManifest(outDir, summary) {
  const manifestPath = path.join(outDir, 'README.txt');
  const lines = [
    'CTP official staging SQL batches',
    '',
    `Stops rows: ${summary.stopCount}`,
    `Route variant rows: ${summary.routeCount}`,
    `Stop batch files: ${summary.stopFiles.length}`,
    `Route batch files: ${summary.routeFiles.length}`,
    '',
    'Recommended execution order:',
    '1. Run every routes batch .sql file.',
    '2. Run every stops batch .sql file.',
    '3. Run refresh_inference.sql.',
    '',
    'Generated files:',
    ...summary.routeFiles.map((file) => `routes: ${path.basename(file)}`),
    ...summary.stopFiles.map((file) => `stops: ${path.basename(file)}`),
  ];
  fs.writeFileSync(manifestPath, lines.join('\n'), 'utf8');
}

function main() {
  const stopsPath = getArg('--stops');
  const routesPath = getArg('--routes');
  const outDir = getArg('--outDir', path.join(process.cwd(), '.generated', 'ctp-staging-import'));
  const stopBatchSize = Number(getArg('--stopBatchSize', '250'));
  const routeBatchSize = Number(getArg('--routeBatchSize', '40'));

  if (!stopsPath || !routesPath) {
    console.error('Usage: node scripts/build-ctp-staging-import.js --stops <stops.geojson> --routes <routes.geojson> [--outDir <dir>] [--stopBatchSize <n>] [--routeBatchSize <n>]');
    process.exit(1);
  }

  ensureDir(outDir);

  const stopRows = buildStopRows(readJson(stopsPath).features ?? []);
  const routeRows = buildRouteRows(readJson(routesPath).features ?? []);

  const stopFiles = writeSqlBatches(outDir, 'staging_ctp_stops', stopRows, stopBatchSize, formatStopsSql);
  const routeFiles = writeSqlBatches(outDir, 'staging_ctp_routes', routeRows, routeBatchSize, formatRoutesSql);

  fs.writeFileSync(
    path.join(outDir, 'refresh_inference.sql'),
    "select * from public.refresh_staging_ctp_route_stop_inference();\n",
    'utf8'
  );

  writeManifest(outDir, {
    stopCount: stopRows.length,
    routeCount: routeRows.length,
    stopFiles,
    routeFiles,
  });

  console.log(JSON.stringify({
    outDir,
    stopCount: stopRows.length,
    routeCount: routeRows.length,
    stopFiles: stopFiles.length,
    routeFiles: routeFiles.length,
  }, null, 2));
}

main();
