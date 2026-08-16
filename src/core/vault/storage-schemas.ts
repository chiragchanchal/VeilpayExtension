/**
 * Zod schemas for the v2 storage records.
 *
 * Values read from IndexedDB are untrusted (a compromised surface, an old buggy
 * migration, or manual tampering can write anything). These schemas validate at
 * the storage boundary before any typed repository returns a record, so a
 * caller never receives a shape that violates its contract.
 */

import { z } from 'zod';

const Decimal = z.string().regex(/^\d+$/, 'Decimal string expected.');
const Timestamp = z.number().int().nonnegative();

/** Stable subset validated on every read regardless of future evolution. */
export const TransactionRecordSchema = z.object({
  id: z.string().min(1),
  hash: z.string().min(1),
  chain: z.string().min(1),
  address: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  amount: Decimal,
  network: z.string().min(1),
  status: z.enum(['confirmed', 'pending', 'failed']),
  timestamp: z.string(),
  type: z.string().min(1),
});
export type TransactionRecordSchema = z.infer<typeof TransactionRecordSchema>;

export const X402ChannelRecordSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  service: z.string().min(1),
  limit: Decimal,
  spent: Decimal,
  expiration: Timestamp,
  isActive: z.boolean(),
});
export type X402ChannelRecordSchema = z.infer<typeof X402ChannelRecordSchema>;

export const SessionRecordSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  createdAt: Timestamp,
  lastActivityAt: Timestamp,
  expiresAt: Timestamp,
  userAddress: z.string().min(1),
});
export type SessionRecordSchema = z.infer<typeof SessionRecordSchema>;

export const PrivacyCommitmentRecordSchema = z.object({
  id: z.string().min(1),
  commitmentId: z.string().min(1),
  nullifier: z.string().min(1),
  secret: z.string().min(1),
  amount: Decimal,
  token: z.string().min(1),
  status: z.string().min(1),
});
export type PrivacyCommitmentRecordSchema = z.infer<typeof PrivacyCommitmentRecordSchema>;

export const AuditLedgerRecordSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  timestamp: Timestamp,
  operationType: z.string().min(1),
  // Must be preserved on read: `verifyAuditChain` recomputes entryHash from it.
  sanitizedPayload: z.unknown(),
  previousHash: z.string().nullable(),
  entryHash: z.string().min(1),
});
export type AuditLedgerRecordSchema = z.infer<typeof AuditLedgerRecordSchema>;

/** Coerces Uint8Array/ArrayBuffer to base64 for crypto fields where raw bytes
 *  must not be JSON-mangled. Currently unused but part of the boundary toolkit. */
export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}