import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { describe, it } from 'node:test';

import { decodeBundle } from '../src/package-snapshot.ts';
import { assertVerifyPassRatio } from '../src/verify.ts';

function encodeTestBundle(blobs: Map<string, Uint8Array>) {
  const parts: Buffer[] = [Buffer.from('MNTR', 'ascii'), Buffer.from([1, blobs.size])];

  for (const [name, blob] of blobs.entries()) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(5);
    header.writeUInt8(nameBuffer.length, 0);
    header.writeUInt32BE(blob.length, 1);
    parts.push(header, nameBuffer, Buffer.from(blob));
  }

  return gzipSync(Buffer.concat(parts));
}

describe('snapshot bundle decoder', () => {
  it('decodes named blobs from the MNTR gzip format', () => {
    const encoded = encodeTestBundle(
      new Map([
        ['stops', new Uint8Array([1, 2, 3])],
        ['tt-habil', new Uint8Array([4, 5])],
      ]),
    );
    const decoded = decodeBundle(encoded);

    assert.deepEqual(Array.from(decoded.keys()), ['stops', 'tt-habil']);
    assert.deepEqual(Array.from(decoded.get('stops') ?? []), [1, 2, 3]);
  });
});

describe('verify threshold', () => {
  it('passes when 16 of 20 pairs reach', () => {
    assert.doesNotThrow(() => assertVerifyPassRatio(16, 20));
  });

  it('fails when 15 of 20 pairs reach', () => {
    assert.throws(() => assertVerifyPassRatio(15, 20), /only 15\/20 pairs reachable/);
  });
});
