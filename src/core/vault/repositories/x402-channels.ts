/**
 * x402 channels repository — typed access to the `x402Channels` store
 * (keyPath `channelId`, indexes `service` + `expiration`).
 */

import { openStorageDatabase } from '@/core/vault/storage';
import { X402ChannelRecordSchema } from '@/core/vault/storage-schemas';
import type { X402ChannelRecord } from '@/core/vault/storage-types';

function parse(row: unknown): X402ChannelRecord {
  return X402ChannelRecordSchema.parse(row) as X402ChannelRecord;
}

export async function putChannel(record: X402ChannelRecord): Promise<void> {
  const parsed = parse(record);
  await (await openStorageDatabase()).put('x402Channels', parsed);
}

export async function getChannel(channelId: string): Promise<X402ChannelRecord | undefined> {
  const row = await (await openStorageDatabase()).get('x402Channels', channelId);
  return row === undefined ? undefined : parse(row);
}

export async function listChannelsByService(service: string): Promise<X402ChannelRecord[]> {
  const rows = await (await openStorageDatabase()).getAllFromIndex(
    'x402Channels',
    'service',
    service,
  );
  return rows.map(parse);
}

export async function listExpiringChannels(before: number): Promise<X402ChannelRecord[]> {
  const rows = await (await openStorageDatabase()).getAllFromIndex(
    'x402Channels',
    'expiration',
    IDBKeyRange.upperBound(before),
  );
  return rows.map(parse);
}

export async function deleteChannel(channelId: string): Promise<void> {
  await (await openStorageDatabase()).delete('x402Channels', channelId);
}