import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(repoRoot, 'local-snapshots');
const targetDir = path.join(repoRoot, 'assets', 'snapshots');

function snapshotVersionFromBin(fileName) {
  const match = fileName.match(/^(v.+)\.bin\.gz$/);
  return match?.[1] ?? null;
}

async function main() {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const versions = entries
    .filter((entry) => entry.isFile())
    .map((entry) => snapshotVersionFromBin(entry.name))
    .filter(Boolean)
    .sort();

  const latest = versions.at(-1);
  if (!latest) {
    throw new Error(`No local snapshot .bin.gz found in ${sourceDir}`);
  }

  const binSource = path.join(sourceDir, `${latest}.bin.gz`);
  const metaSource = path.join(sourceDir, `${latest}.meta.json`);

  await mkdir(targetDir, { recursive: true });
  await Promise.all([
    copyFile(binSource, path.join(targetDir, 'cartago-local.bin.gz')),
    copyFile(metaSource, path.join(targetDir, 'cartago-local.meta.json')),
  ]);

  console.log(JSON.stringify({ bundled: latest, targetDir }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
