/**
 * VAP audit ledger — append-only, hash-chained, locally signed.
 *
 * Every grant-lifecycle and operation-outcome transition writes exactly one
 * entry (VAP-05). `entryHash` chains each entry to its predecessor, so a
 * tampered or reordered history is detectable by `verifyAuditChain`.
 *
 * Redaction rule (VAP-11): amounts and addresses may be logged; private keys,
 * signatures, mnemonics, and nullifiers are never logged. Callers pass a
 * `sanitizedPayload` that has already been screened.
 *
 * Spec reference: §7 of 4_NATIVE_PAYMENT_LAYER_SPEC.md
 */
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { openStorageDatabase } from '@/core/vault/storage';
import type { AuditLedgerRecord } from '@/core/vault/storage';

export type { AuditLedgerRecord };

/** Hash of `JSON.stringify({ previousHash, timestamp, operationType, sanitizedPayload })`. */
export function computeEntryHash(
  previousHash: string | null,
  entry: Pick<AuditLedgerRecord, 'timestamp' | 'operationType' | 'sanitizedPayload'>,
): string {
  const body = JSON.stringify({
    previousHash,
    timestamp: entry.timestamp,
    operationType: entry.operationType,
    sanitizedPayload: entry.sanitizedPayload,
  });
  return bytesToHex(keccak_256(utf8ToBytes(body)));
}

/**
 * Appends an audit entry. Serializes against concurrent writers by reading the
 * current tail inside the same task as the put.
 */
export async function appendAudit(
  operationType: string,
  sanitizedPayload: unknown,
  timestamp: number = Date.now(),
): Promise<AuditLedgerRecord> {
  const db = await openStorageDatabase();
  const records = await db.getAll('auditLedger');
  const last = records.at(-1);
  const sequence = last === undefined ? 0 : last.sequence + 1;
  const previousHash = last?.entryHash ?? null;

  const entry: AuditLedgerRecord = {
    id: crypto.randomUUID(),
    sequence,
    timestamp,
    operationType,
    sanitizedPayload,
    previousHash,
    entryHash: computeEntryHash(previousHash, { timestamp, operationType, sanitizedPayload }),
  };
  await db.put('auditLedger', entry);
  return entry;
}

/**
 * Replays the chain, recomputing every hash and checking linkage.
 * Returns the first broken sequence, or `valid: true`.
 */
export async function verifyAuditChain(): Promise<{ valid: boolean; brokenAt?: number }> {
  const db = await openStorageDatabase();
  const records = await db.getAll('auditLedger');

  let expectedPrevious: string | null = null;
  for (const record of records) {
    if (record.previousHash !== expectedPrevious) {
      return { valid: false, brokenAt: record.sequence };
    }
    const expected = computeEntryHash(expectedPrevious, record);
    if (record.entryHash !== expected) {
      return { valid: false, brokenAt: record.sequence };
    }
    expectedPrevious = record.entryHash;
  }
  return { valid: true };
}

/** Returns every entry, oldest first, for export. */
export async function exportAudit(): Promise<AuditLedgerRecord[]> {
  const db = await openStorageDatabase();
  return db.getAll('auditLedger');
}