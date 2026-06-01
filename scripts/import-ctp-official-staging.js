'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function getArg(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return fallback;
  }
  return process.argv[index + 1];
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function readEnvFile(envPath) {
  const values = {};
  if (!fs.existsSync(envPath)) {
    return values;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    values[key] = value;
  }

  return values;
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

  return null;
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
        source_id: Number(props.id),
        source_identifier: props.identifica,
        description_raw: props.descripcio ?? null,
        lng: Number(coords[0]),
        lat: Number(coords[1]),
        metadata: props,
      };
    })
    .filter((row) => Number.isFinite(row?.source_id) && Number.isFinite(row?.lat) && Number.isFinite(row?.lng) && row?.source_identifier);
}

function buildRouteRows(features) {
  return features
    .map((feature) => {
      const props = feature.properties ?? {};
      const geometry = toMultiLineGeometry(feature.geometry);
      if (!geometry || !props.identifica) {
        return null;
      }

      return {
        source_id: Number(props.id),
        route_code: props.ruta,
        variant_code: props.identifica,
        description_raw: props.descripcio ?? null,
        direction_raw: props.sentido ?? null,
        geometry,
        metadata: props,
      };
    })
    .filter((row) => Number.isFinite(row?.source_id) && row?.route_code && row?.variant_code && row?.geometry);
}

function chunk(array, size) {
  const items = [];
  for (let i = 0; i < array.length; i += size) {
    items.push(array.slice(i, i + size));
  }
  return items;
}

async function runRpcInChunks(client, rpcName, argName, rows, batchSize, label) {
  let processed = 0;
  const batches = chunk(rows, batchSize);

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const { data, error } = await client.rpc(rpcName, { [argName]: batch });
    if (error) {
      throw new Error(`${label} batch ${index + 1}/${batches.length} failed: ${error.message}`);
    }

    processed += Number(data ?? 0);
    console.log(`${label} ${index + 1}/${batches.length} -> ${batch.length} rows (server upserted: ${data ?? 0})`);
  }

  return processed;
}

async function main() {
  const cwd = process.cwd();
  const envValues = readEnvFile(path.join(cwd, '.env'));

  const stopsPath = getArg('--stops');
  const routesPath = getArg('--routes');
  const stopBatchSize = Number(getArg('--stopBatchSize', '1000'));
  const routeBatchSize = Number(getArg('--routeBatchSize', '100'));
  const doRefresh = getArg('--skipRefresh', '0') !== '1';

  const url = getArg('--url', process.env.EXPO_PUBLIC_SUPABASE_URL || envValues.EXPO_PUBLIC_SUPABASE_URL);
  const anonKey = getArg('--key', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || envValues.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  if (!stopsPath || !routesPath) {
    throw new Error('Usage: node scripts/import-ctp-official-staging.js --stops <stops.geojson> --routes <routes.geojson> [--stopBatchSize N] [--routeBatchSize N]');
  }

  if (!url || !anonKey) {
    throw new Error('Missing Supabase URL or anon key. Check .env or pass --url/--key.');
  }

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const stopRows = buildStopRows(readJson(stopsPath).features ?? []);
  const routeRows = buildRouteRows(readJson(routesPath).features ?? []);

  console.log(JSON.stringify({
    url,
    stopRows: stopRows.length,
    routeRows: routeRows.length,
    stopBatchSize,
    routeBatchSize,
  }, null, 2));

  const routeProcessed = await runRpcInChunks(
    client,
    'import_staging_ctp_route_variants',
    'p_rows',
    routeRows,
    routeBatchSize,
    'routes'
  );

  const stopProcessed = await runRpcInChunks(
    client,
    'import_staging_ctp_stops',
    'p_rows',
    stopRows,
    stopBatchSize,
    'stops'
  );

  let refreshData = null;
  if (doRefresh) {
    const { data, error } = await client.rpc('refresh_staging_ctp_route_stop_inference', {
      p_max_snap_m: 65,
      p_high_confidence_snap_m: 25,
      p_progress_bucket_m: 35,
    });
    if (error) {
      throw new Error(`refresh failed: ${error.message}`);
    }
    refreshData = data;
  }

  console.log(JSON.stringify({
    routeProcessed,
    stopProcessed,
    refreshData,
  }, null, 2));
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
