import { readFileSync } from 'node:fs';
import path from 'node:path';

import { getPackageDir } from './env.ts';

export const SNAPSHOT_SCHEMA_VERSION = 1;

function readPackageVersion(packageJsonPath: string): string {
  const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
  if (typeof parsed.version !== 'string') {
    throw new Error(`Missing version in ${packageJsonPath}`);
  }

  return parsed.version;
}

export function getVersionInfo() {
  const packageDir = getPackageDir();

  return {
    minotor_version: readPackageVersion(path.join(packageDir, 'node_modules', 'minotor', 'package.json')),
    generator_version: readPackageVersion(path.join(packageDir, 'package.json')),
    schema_version: SNAPSHOT_SCHEMA_VERSION,
  };
}
