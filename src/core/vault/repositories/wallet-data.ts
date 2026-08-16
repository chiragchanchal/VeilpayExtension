/**
 * walletData repository.
 *
 * A compatibility projection store (v2), NOT a secrets store. The authoritative
 * encrypted wallet remains `vault.primary`. This repository is intentionally
 * small — it stores opaque `{ id, value }` rows for future feature data and
 * performs a light shape check so consumers never read undefined/object soup.
 */

import { openStorageDatabase } from '@/core/vault/storage';

export interface WalletDataRecord {
  id: string;
  value: unknown;
}

function parse(row: unknown): WalletDataRecord {
  if (typeof row !== 'object' || row === null || typeof (row as { id?: unknown }).id !== 'string') {
    throw new Error('Malformed walletData row: expected { id, value }.');
  }
  return row as WalletDataRecord;
}

export async function putWalletData(id: string, value: unknown): Promise<void> {
  await (await openStorageDatabase()).put('walletData', { id, value });
}

export async function getWalletData(id: string): Promise<unknown> {
  const row = await (await openStorageDatabase()).get('walletData', id);
  return row === undefined ? undefined : parse(row).value;
}

export async function deleteWalletData(id: string): Promise<void> {
  await (await openStorageDatabase()).delete('walletData', id);
}