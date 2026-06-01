import { Asset } from 'expo-asset';

import snapshotAsset from '@/assets/snapshots/cartago-local.bin.gz';
import metadataJson from '@/assets/snapshots/cartago-local.meta.json';

import type { SnapshotMetadata } from './types';

export function loadBundledMetadata(): SnapshotMetadata {
  return metadataJson as SnapshotMetadata;
}

export async function loadBundledSnapshotBytes(): Promise<Uint8Array> {
  const asset = Asset.fromModule(snapshotAsset);
  await asset.downloadAsync();

  const uri = asset.localUri ?? asset.uri;
  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();

  return new Uint8Array(buffer);
}
