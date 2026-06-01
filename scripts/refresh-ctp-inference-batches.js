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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rpcExpect(client, name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) {
    throw new Error(`${name} failed: ${error.message}`);
  }
  return data;
}

async function main() {
  const cwd = process.cwd();
  const envValues = readEnvFile(path.join(cwd, '.env'));

  const url = getArg('--url', process.env.EXPO_PUBLIC_SUPABASE_URL || envValues.EXPO_PUBLIC_SUPABASE_URL);
  const anonKey = getArg('--key', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || envValues.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const stopBatchSize = Number(getArg('--stopBatchSize', '500'));
  const routeBatchSize = Number(getArg('--routeBatchSize', '12'));
  const maxSnapM = Number(getArg('--maxSnapM', '65'));
  const highConfidenceSnapM = Number(getArg('--highConfidenceSnapM', '25'));
  const progressBucketM = Number(getArg('--progressBucketM', '35'));
  const pauseMs = Number(getArg('--pauseMs', '100'));

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

  console.log(JSON.stringify({
    url,
    stopBatchSize,
    routeBatchSize,
    maxSnapM,
    highConfidenceSnapM,
    progressBucketM,
    pauseMs,
  }, null, 2));

  await rpcExpect(client, 'reset_staging_ctp_route_stop_inference', {});

  const stopBatches = await rpcExpect(client, 'list_staging_ctp_stop_batches', {
    p_batch_size: stopBatchSize,
  });

  console.log(`stop batches: ${stopBatches.length}`);
  let candidateProcessed = 0;
  for (const batch of stopBatches) {
    const startedAt = Date.now();
    const inserted = await rpcExpect(client, 'refresh_staging_ctp_route_stop_candidates_batch', {
      p_stop_source_min: batch.stop_source_min,
      p_stop_source_max: batch.stop_source_max,
      p_max_snap_m: maxSnapM,
      p_high_confidence_snap_m: highConfidenceSnapM,
    });
    candidateProcessed += Number(inserted || 0);
    console.log(
      `candidates batch ${batch.batch_no}/${stopBatches.length} -> stops ${batch.stop_source_min}-${batch.stop_source_max} (${batch.row_count} rows), inserted ${inserted}, elapsed_ms ${Date.now() - startedAt}`
    );
    if (pauseMs > 0) {
      await sleep(pauseMs);
    }
  }

  const routeBatches = await rpcExpect(client, 'list_staging_ctp_route_code_batches', {
    p_batch_size: routeBatchSize,
  });

  console.log(`route-code batches: ${routeBatches.length}`);
  let inferredProcessed = 0;
  for (const batch of routeBatches) {
    const startedAt = Date.now();
    const inserted = await rpcExpect(client, 'refresh_staging_ctp_route_stops_inferred_batch', {
      p_route_codes: batch.route_codes,
      p_progress_bucket_m: progressBucketM,
    });
    inferredProcessed += Number(inserted || 0);
    console.log(
      `inferred batch ${batch.batch_no}/${routeBatches.length} -> codes ${batch.route_count}, inserted ${inserted}, elapsed_ms ${Date.now() - startedAt}`
    );
    if (pauseMs > 0) {
      await sleep(pauseMs);
    }
  }

  const counts = await rpcExpect(client, 'get_staging_ctp_inference_counts', {});

  console.log(JSON.stringify({
    candidateProcessed,
    inferredProcessed,
    counts,
  }, null, 2));
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
