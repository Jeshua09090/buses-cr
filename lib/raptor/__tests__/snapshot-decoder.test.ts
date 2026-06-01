import assert from 'node:assert/strict';
import test from 'node:test';

import { gzip } from 'pako';

import { decodeSnapshotBundle } from '../snapshot-decoder';

function encodeTestBundle(blobs: Map<string, Uint8Array>) {
  const parts: number[] = [77, 78, 84, 82, 1, blobs.size];

  for (const [name, blob] of blobs.entries()) {
    const nameBytes = Array.from(name).map((char) => char.charCodeAt(0));
    const length = blob.byteLength;
    parts.push(
      nameBytes.length,
      (length >>> 24) & 0xff,
      (length >>> 16) & 0xff,
      (length >>> 8) & 0xff,
      length & 0xff,
      ...nameBytes,
      ...blob,
    );
  }

  return gzip(new Uint8Array(parts)) as Uint8Array;
}

test('decodeSnapshotBundle reads MNTR blobs', () => {
  const input = new Map([
    ['stops', new Uint8Array([1, 2, 3])],
    ['tt-habil', new Uint8Array([4, 5])],
  ]);
  const decoded = decodeSnapshotBundle(encodeTestBundle(input));

  assert.deepEqual(Array.from(decoded.blobs.get('stops') ?? []), [1, 2, 3]);
  assert.deepEqual(Array.from(decoded.blobs.get('tt-habil') ?? []), [4, 5]);
});

test('decodeSnapshotBundle rejects invalid magic bytes', () => {
  const bad = gzip(new Uint8Array([0, 0, 0, 0, 1, 0])) as Uint8Array;

  assert.throws(() => decodeSnapshotBundle(bad), /MNTR/);
});
