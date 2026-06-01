import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageDir, '..', '..');

for (const envPath of [path.join(repoRoot, '.env'), path.join(packageDir, '.env')]) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false, quiet: true });
  }
}

function readEnvFileValue(filePath: string, key: string) {
  if (!existsSync(filePath)) return null;
  const line = readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`));
  if (!line) return null;
  return line.slice(key.length + 1).trim();
}

export function getEnvValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key] ?? readEnvFileValue(path.join(repoRoot, '.env'), key);
    if (value) return value;
  }
  return null;
}

export function getPackageDir() {
  return packageDir;
}

export function getRepoRoot() {
  return repoRoot;
}
