#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';

function getArgValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function findLanIp() {
  const preferred = process.env.PLANNER_LAB_LAN_IP ?? getArgValue('lan-ip');
  if (preferred) return preferred;

  const candidates = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue;
      candidates.push(entry.address);
    }
  }

  return (
    candidates.find((address) => address.startsWith('192.168.')) ??
    candidates.find((address) => address.startsWith('10.')) ??
    candidates.find((address) => address.startsWith('172.')) ??
    candidates[0] ??
    '127.0.0.1'
  );
}

function readLocalSupabaseStatus() {
  const result = spawnSync('npx', ['supabase', 'status'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return { output, status: result.status };
}

function parseLocalSupabaseStatus() {
  const { output, status } = readLocalSupabaseStatus();
  const publishableMatch = output.match(/Publishable[^\w]+([\w.-]+)/);
  const projectUrlMatch = output.match(/Project URL[^\r\n]+(https?:\/\/[^\s]+)/);

  return {
    projectUrl: projectUrlMatch?.[1],
    publishableKey: publishableMatch?.[1],
    status,
  };
}

function lanUrlFromLocalProjectUrl(projectUrl, lanIp) {
  if (!projectUrl) return null;

  try {
    const parsed = new URL(projectUrl);
    parsed.hostname = lanIp;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function getLocalSupabasePublishableKey(localSupabaseStatus) {
  const explicitLabKey = process.env.PLANNER_LAB_SUPABASE_PUBLISHABLE_KEY;
  if (explicitLabKey) return explicitLabKey;

  if (localSupabaseStatus.publishableKey) return localSupabaseStatus.publishableKey;

  const expoKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (expoKey) return expoKey;

  console.error('Could not read local Supabase publishable key from `npx supabase status`.');
  console.error('Start Supabase with `npx supabase start`, or set PLANNER_LAB_SUPABASE_PUBLISHABLE_KEY.');
  process.exit(localSupabaseStatus.status || 1);
}

const lanIp = findLanIp();
const localSupabaseStatus = parseLocalSupabaseStatus();
const statusSupabaseUrl = lanUrlFromLocalProjectUrl(localSupabaseStatus.projectUrl, lanIp);
const supabasePort = getArgValue('supabase-port') ?? process.env.PLANNER_LAB_SUPABASE_PORT;
const supabaseUrl =
  process.env.PLANNER_LAB_SUPABASE_URL ??
  getArgValue('supabase-url') ??
  (supabasePort ? `http://${lanIp}:${supabasePort}` : null) ??
  statusSupabaseUrl ??
  `http://${lanIp}:54321`;
const publishableKey = getLocalSupabasePublishableKey(localSupabaseStatus);
const useWeb = hasFlag('web');
const extraExpoArgs = process.argv.slice(2).filter((arg) => {
  return !arg.startsWith('--lan-ip=') &&
    !arg.startsWith('--supabase-port=') &&
    !arg.startsWith('--supabase-url=') &&
    arg !== '--web';
});

const expoArgs = ['expo', 'start', '--host', 'lan', ...extraExpoArgs];
if (useWeb) expoArgs.push('--web');

const env = {
  ...process.env,
  EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: publishableKey,
  EXPO_PUBLIC_USE_RAPTOR_RUNTIME: '1',
  EXPO_PUBLIC_DISABLE_RAPTOR_RUNTIME: '',
};

console.log('Planner Lab local runtime');
console.log(`- Supabase API: ${supabaseUrl}`);
console.log(`- RAPTOR runtime: forced on`);
console.log(`- Expo host: LAN (${lanIp})`);
console.log('');
console.log('Open on your phone:');
console.log('- Expo Go: scan the QR code, then navigate to /planner-lab in the app.');
if (useWeb) {
  console.log(`- Web browser: use the Expo web URL and path /planner-lab.`);
}
console.log('');

const child = spawn('npx', expoArgs, {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
