/**
 * Privacy commitments repository — typed access to the `privacyCommitments`
 * store (keyPath `commitmentId`, index `status`).
 *
 * Security rule: the `nullifier` field stores the commitment (hash), never a
 * preimage. Repositories must not be the place where secrets are introduced;
 * callers pushing preimages here are a bug.
 */

import { openStorageDatabase } from '@/core/vault/storage';
import { PrivacyCommitmentRecordSchema } from '@/core/vault/storage-schemas';
import type { PrivacyCommitmentRecord } from '@/core/vault/storage-types';

function parse(row: unknown): PrivacyCommitmentRecord {
  return PrivacyCommitmentRecordSchema.parse(row) as PrivacyCommitmentRecord;
}

export async function putCommitment(record: PrivacyCommitmentRecord): Promise<void> {
  const parsed = parse(record);
  await (await openStorageDatabase()).put('privacyCommitments', parsed);
}

export async function getCommitment(
  commitmentId: string,
): Promise<PrivacyCommitmentRecord | undefined> {
  const row = await (await openStorageDatabase()).get('privacyCommitments', commitmentId);
  return row === undefined ? undefined : parse(row);
}

export async function listCommitmentsByStatus(status: string): Promise<PrivacyCommitmentRecord[]> {
  const rows = await (await openStorageDatabase()).getAllFromIndex(
    'privacyCommitments',
    'status',
    status,
  );
  return rows.map(parse);
}

export async function deleteCommitment(commitmentId: string): Promise<void> {
  await (await openStorageDatabase()).delete('privacyCommitments', commitmentId);
}