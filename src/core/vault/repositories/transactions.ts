/**
 * Transactions repository — typed access to the `transactions` store.
 *
 * Indexes mirror the v2 schema (`from`, `to`, `network`, `timestamp`). Every
 * read/write validates at the boundary with `TransactionRecordSchema`, so a
 * malformed row (old migration, manual tampering, compromised surface) never
 * reaches a consumer as if it were a valid record.
 */

import { openStorageDatabase } from '@/core/vault/storage';
import { TransactionRecordSchema } from '@/core/vault/storage-schemas';
import type { TransactionRecord } from '@/core/vault/storage-types';

function parse(row: unknown): TransactionRecord {
  return TransactionRecordSchema.parse(row) as TransactionRecord;
}

export async function putTransaction(record: TransactionRecord): Promise<void> {
  const parsed = parse(record);
  await (await openStorageDatabase()).put('transactions', parsed);
}

export async function getTransaction(hash: string): Promise<TransactionRecord | undefined> {
  const row = await (await openStorageDatabase()).get('transactions', hash);
  return row === undefined ? undefined : parse(row);
}

export async function listTransactionsByAddress(address: string): Promise<TransactionRecord[]> {
  const db = await openStorageDatabase();
  const [from, to] = await Promise.all([
    db.getAllFromIndex('transactions', 'from', address),
    db.getAllFromIndex('transactions', 'to', address),
  ]);
  // A wallet's history is both directions: everything this address sent and
  // everything it received, deduplicated by hash.
  const seen = new Map<string, TransactionRecord>();
  for (const row of [...from, ...to]) {
    const record = parse(row);
    seen.set(record.hash, record);
  }
  return [...seen.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function listTransactionsByNetwork(network: string): Promise<TransactionRecord[]> {
  const rows = await (await openStorageDatabase()).getAllFromIndex(
    'transactions',
    'network',
    network,
  );
  return rows.map(parse);
}

export async function listTransactionsByTimeRange(
  from: string,
  to: string,
): Promise<TransactionRecord[]> {
  const range = IDBKeyRange.bound(from, to);
  const rows = await (await openStorageDatabase()).getAllFromIndex(
    'transactions',
    'timestamp',
    range,
  );
  return rows.map(parse);
}

export async function deleteTransaction(hash: string): Promise<void> {
  await (await openStorageDatabase()).delete('transactions', hash);
}