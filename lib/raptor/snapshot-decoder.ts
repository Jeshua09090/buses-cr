import { ungzip } from 'pako';

import type { DecodedSnapshotBundle } from './types';

const MAGIC = [77, 78, 84, 82]; // MNTR
const BUNDLE_VERSION = 1;

function assertCanRead(raw: Uint8Array, offset: number, length: number, label: string) {
  if (offset + length > raw.byteLength) {
    throw new Error(`Invalid snapshot bundle: truncated ${label}.`);
  }
}

function readUint32Be(raw: Uint8Array, offset: number) {
  assertCanRead(raw, offset, 4, 'uint32');
  return (
    raw[offset] * 0x1000000 +
    raw[offset + 1] * 0x10000 +
    raw[offset + 2] * 0x100 +
    raw[offset + 3]
  );
}

function readAscii(raw: Uint8Array, offset: number, length: number) {
  assertCanRead(raw, offset, length, 'blob name');
  let output = '';
  for (let index = offset; index < offset + length; index += 1) {
    output += String.fromCharCode(raw[index]);
  }
  return output;
}

export function decodeSnapshotBundle(gzippedBundle: Uint8Array): DecodedSnapshotBundle {
  const raw = ungzip(gzippedBundle) as Uint8Array;

  assertCanRead(raw, 0, 6, 'header');
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (raw[index] !== MAGIC[index]) {
      throw new Error('Invalid snapshot bundle: missing MNTR magic bytes.');
    }
  }

  const version = raw[4];
  if (version !== BUNDLE_VERSION) {
    throw new Error(`Unsupported snapshot bundle version: ${version}`);
  }

  const blobCount = raw[5];
  const blobs = new Map<string, Uint8Array>();
  let offset = 6;

  for (let index = 0; index < blobCount; index += 1) {
    assertCanRead(raw, offset, 5, 'blob header');
    const nameLength = raw[offset];
    const blobLength = readUint32Be(raw, offset + 1);
    offset += 5;

    const name = readAscii(raw, offset, nameLength);
    offset += nameLength;

    assertCanRead(raw, offset, blobLength, `blob ${name}`);
    blobs.set(name, raw.slice(offset, offset + blobLength));
    offset += blobLength;
  }

  if (offset !== raw.byteLength) {
    throw new Error('Invalid snapshot bundle: trailing bytes after final blob.');
  }

  return { blobs };
}
