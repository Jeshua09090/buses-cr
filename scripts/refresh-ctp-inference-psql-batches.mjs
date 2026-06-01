#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

function getArg(flag, fallback = null) {
  const inline = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return fallback;
  }
  return process.argv[index + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTextArray(values) {
  return `array[${values.map(sqlString).join(',')}]::text[]`;
}

const container = getArg('--container', process.env.SUPABASE_DB_CONTAINER || 'supabase_db_busescr');
const database = getArg('--database', 'postgres');
const user = getArg('--user', 'postgres');
const stopBatchSize = Number(getArg('--stopBatchSize', '500'));
const routeBatchSize = Number(getArg('--routeBatchSize', '25'));
const maxSnapM = Number(getArg('--maxSnapM', '65'));
const highConfidenceSnapM = Number(getArg('--highConfidenceSnapM', '25'));
const progressBucketM = Number(getArg('--progressBucketM', '35'));
const maxStopBatches = Number(getArg('--maxStopBatches', '0'));
const maxRouteBatches = Number(getArg('--maxRouteBatches', '0'));
const routeCodesArg = getArg('--routeCodes', '');
const routeCodes = routeCodesArg
  .split(',')
  .map((code) => code.trim())
  .map((code) => (/^\d+$/.test(code) && code.length < 4 ? code.padStart(4, '0') : code))
  .filter(Boolean);
const dryRun = hasFlag('--dryRun');
const noReset = hasFlag('--noReset');
const skipCandidates = hasFlag('--skipCandidates');
const skipInferred = hasFlag('--skipInferred');

function runPsql(sql, options = {}) {
  const args = [
    'exec',
    container,
    'psql',
    '-U',
    user,
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
    '-F',
    '\t',
    '-c',
    sql,
  ];
  const startedAt = Date.now();
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    stdio: options.inherit ? 'inherit' : 'pipe',
  });
  const elapsedMs = Date.now() - startedAt;

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      [
        `psql failed with exit code ${result.status}`,
        result.stdout?.trim(),
        result.stderr?.trim(),
        `SQL: ${sql}`,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    elapsedMs,
  };
}

function scalar(sql) {
  return runPsql(sql).stdout.trim();
}

function rows(sql) {
  const output = runPsql(sql).stdout.trim();
  if (!output) {
    return [];
  }
  return output.split(/\r?\n/).map((line) => line.split('\t'));
}

function logJson(label, value) {
  console.log(`${label} ${JSON.stringify(value)}`);
}

function assertRange(name, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} out of range (${value}); expected ${min}-${max}`);
  }
}

assertRange('stopBatchSize', stopBatchSize, 1, 5000);
assertRange('routeBatchSize', routeBatchSize, 1, 200);
assertRange('maxSnapM', maxSnapM, 10, 250);
assertRange('highConfidenceSnapM', highConfidenceSnapM, 5, maxSnapM);
assertRange('progressBucketM', progressBucketM, 5, 250);
assertRange('maxStopBatches', maxStopBatches, 0, 100000);
assertRange('maxRouteBatches', maxRouteBatches, 0, 100000);

console.log(
  JSON.stringify(
    {
      container,
      database,
      user,
      stopBatchSize,
      routeBatchSize,
      maxSnapM,
      highConfidenceSnapM,
      progressBucketM,
      routeCodes,
      maxStopBatches,
      maxRouteBatches,
      dryRun,
      noReset,
      skipCandidates,
      skipInferred,
    },
    null,
    2
  )
);

if (dryRun) {
  const stopBatchCount = scalar(`select count(*) from public.list_staging_ctp_stop_batches(${stopBatchSize});`);
  const routeBatchCount = routeCodes.length
    ? '1'
    : scalar(`select count(*) from public.list_staging_ctp_route_code_batches(${routeBatchSize});`);
  logJson('dryRun', { stopBatchCount: Number(stopBatchCount), routeBatchCount: Number(routeBatchCount) });
  process.exit(0);
}

if (!noReset) {
  console.log('reset inference tables');
  runPsql('select public.reset_staging_ctp_route_stop_inference();', { inherit: true });
}

let candidateTotal = 0;
if (!skipCandidates) {
  const stopBatches = rows(
    `select batch_no, stop_source_min, stop_source_max, row_count ` +
      `from public.list_staging_ctp_stop_batches(${stopBatchSize}) order by batch_no`
  );
  const limitedStopBatches = maxStopBatches > 0 ? stopBatches.slice(0, maxStopBatches) : stopBatches;
  console.log(`candidate stop batches: ${limitedStopBatches.length}/${stopBatches.length}`);

  for (const [batchNoRaw, minRaw, maxRaw, rowCountRaw] of limitedStopBatches) {
    const batchNo = Number(batchNoRaw);
    const stopMin = Number(minRaw);
    const stopMax = Number(maxRaw);
    const rowCount = Number(rowCountRaw);
    const sql = routeCodes.length
      ? `select public.refresh_staging_ctp_route_stop_candidates_batch(` +
        `${stopMin}, ${stopMax}, ${maxSnapM}, ${highConfidenceSnapM}, ${sqlTextArray(routeCodes)});`
      : `select public.refresh_staging_ctp_route_stop_candidates_batch(` +
        `${stopMin}, ${stopMax}, ${maxSnapM}, ${highConfidenceSnapM});`;
    const startedAt = Date.now();
    const inserted = Number(scalar(sql));
    const elapsedMs = Date.now() - startedAt;
    candidateTotal += inserted;
    logJson('candidateBatch', { batchNo, stopMin, stopMax, rowCount, inserted, elapsedMs });
  }
}

let inferredTotal = 0;
if (!skipInferred) {
  if (routeCodes.length) {
    const startedAt = Date.now();
    const inserted = Number(
      scalar(`select public.refresh_staging_ctp_route_stops_inferred_batch(${sqlTextArray(routeCodes)}, ${progressBucketM});`)
    );
    inferredTotal += inserted;
    logJson('inferredBatch', { routeCodes, inserted, elapsedMs: Date.now() - startedAt });
  } else {
    const routeBatches = rows(
      `select batch_no, array_to_string(route_codes, ','), route_count ` +
        `from public.list_staging_ctp_route_code_batches(${routeBatchSize}) order by batch_no`
    );
    const limitedRouteBatches = maxRouteBatches > 0 ? routeBatches.slice(0, maxRouteBatches) : routeBatches;
    console.log(`inferred route batches: ${limitedRouteBatches.length}/${routeBatches.length}`);

    for (const [batchNoRaw, routeCodesRaw, routeCountRaw] of limitedRouteBatches) {
      const batchNo = Number(batchNoRaw);
      const batchRouteCodes = routeCodesRaw.split(',').map((code) => code.trim()).filter(Boolean);
      const routeCount = Number(routeCountRaw);
      const startedAt = Date.now();
      const inserted = Number(
        scalar(
          `select public.refresh_staging_ctp_route_stops_inferred_batch(${sqlTextArray(batchRouteCodes)}, ${progressBucketM});`
        )
      );
      const elapsedMs = Date.now() - startedAt;
      inferredTotal += inserted;
      logJson('inferredBatch', { batchNo, routeCount, routeCodes: batchRouteCodes, inserted, elapsedMs });
    }
  }
}

const counts = rows(
  `select candidate_count, inferred_count, alta_count, media_count, baja_count, manual_count ` +
    `from public.get_staging_ctp_inference_counts();`
)[0];

logJson('summary', {
  candidateTotal,
  inferredTotal,
  counts: {
    candidateCount: Number(counts?.[0] ?? 0),
    inferredCount: Number(counts?.[1] ?? 0),
    altaCount: Number(counts?.[2] ?? 0),
    mediaCount: Number(counts?.[3] ?? 0),
    bajaCount: Number(counts?.[4] ?? 0),
    manualCount: Number(counts?.[5] ?? 0),
  },
});
