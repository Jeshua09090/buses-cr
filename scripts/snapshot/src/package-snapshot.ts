import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import type { SnapshotMetadata } from './types.ts';

const MAGIC = Buffer.from('MNTR', 'ascii');
const BUNDLE_VERSION = 1;

export type SnapshotPackageResult = {
  binPath: string;
  metadataPath: string;
  linearizationReportPath: string;
  snapshotStatsPath: string;
  rawBytes: number;
  gzippedBytes: number;
};

function encodeBundle(blobs: Map<string, Uint8Array>): Buffer {
  if (blobs.size > 255) {
    throw new Error(`Too many blobs for MNTR bundle: ${blobs.size}`);
  }

  const parts: Buffer[] = [MAGIC, Buffer.from([BUNDLE_VERSION, blobs.size])];

  for (const [name, blob] of blobs.entries()) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const blobBuffer = Buffer.from(blob);
    const header = Buffer.alloc(1 + 4);

    if (nameBuffer.length > 255) {
      throw new Error(`Blob name is too long: ${name}`);
    }

    header.writeUInt8(nameBuffer.length, 0);
    header.writeUInt32BE(blobBuffer.length, 1);
    parts.push(header, nameBuffer, blobBuffer);
  }

  return Buffer.concat(parts);
}

export function decodeBundle(gzippedBundle: Uint8Array): Map<string, Uint8Array> {
  const raw = Buffer.from(gunzipSync(gzippedBundle));

  if (!raw.subarray(0, 4).equals(MAGIC)) {
    throw new Error('Invalid snapshot bundle: missing MNTR magic bytes.');
  }

  const version = raw.readUInt8(4);
  if (version !== BUNDLE_VERSION) {
    throw new Error(`Unsupported snapshot bundle version: ${version}`);
  }

  const blobCount = raw.readUInt8(5);
  const blobs = new Map<string, Uint8Array>();
  let offset = 6;

  for (let index = 0; index < blobCount; index += 1) {
    const nameLength = raw.readUInt8(offset);
    const blobLength = raw.readUInt32BE(offset + 1);
    offset += 5;

    const name = raw.subarray(offset, offset + nameLength).toString('utf8');
    offset += nameLength;

    const blob = raw.subarray(offset, offset + blobLength);
    offset += blobLength;
    blobs.set(name, new Uint8Array(blob));
  }

  return blobs;
}

function snapshotBaseName(metadata: SnapshotMetadata): string {
  return metadata.version.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export async function writeSnapshotPackage(params: {
  outDir: string;
  metadata: SnapshotMetadata;
  blobs: Map<string, Uint8Array>;
  linearizationReport: string;
  snapshotStats: string | ((metadata: SnapshotMetadata) => string);
}): Promise<SnapshotPackageResult> {
  await mkdir(params.outDir, { recursive: true });

  const raw = encodeBundle(params.blobs);
  const gzipped = gzipSync(raw, { level: 9 });
  const metadata: SnapshotMetadata = {
    ...params.metadata,
    byte_size: {
      raw: raw.byteLength,
      gzipped: gzipped.byteLength,
    },
  };
  const baseName = snapshotBaseName(metadata);
  const binPath = path.join(params.outDir, `${baseName}.bin.gz`);
  const metadataPath = path.join(params.outDir, `${baseName}.meta.json`);
  const linearizationReportPath = path.join(params.outDir, `${baseName}.linearization-report.md`);
  const snapshotStatsPath = path.join(params.outDir, `${baseName}.snapshot-stats.md`);
  const snapshotStats = typeof params.snapshotStats === 'function' ? params.snapshotStats(metadata) : params.snapshotStats;

  await Promise.all([
    writeFile(binPath, gzipped),
    writeFile(metadataPath, `${JSON.stringify(metadata)}\n`),
    writeFile(linearizationReportPath, params.linearizationReport),
    writeFile(snapshotStatsPath, snapshotStats),
  ]);

  return {
    binPath,
    metadataPath,
    linearizationReportPath,
    snapshotStatsPath,
    rawBytes: raw.byteLength,
    gzippedBytes: gzipped.byteLength,
  };
}
