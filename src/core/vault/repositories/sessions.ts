/**
 * Sessions repository — typed access to the `sessions` store (keyPath
 * `sessionId`). Used for dapp/agent session persistence; validation at the
 * boundary so a malformed row is never returned as a valid session.
 */

import { openStorageDatabase } from '@/core/vault/storage';
import { SessionRecordSchema } from '@/core/vault/storage-schemas';
import type { SessionRecord } from '@/core/vault/storage-types';

function parse(row: unknown): SessionRecord {
  return SessionRecordSchema.parse(row) as SessionRecord;
}

export async function putSession(record: SessionRecord): Promise<void> {
  const parsed = parse(record);
  await (await openStorageDatabase()).put('sessions', parsed);
}

export async function getSession(sessionId: string): Promise<SessionRecord | undefined> {
  const row = await (await openStorageDatabase()).get('sessions', sessionId);
  return row === undefined ? undefined : parse(row);
}

export async function listSessions(): Promise<SessionRecord[]> {
  const rows = await (await openStorageDatabase()).getAll('sessions');
  return rows.map(parse);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await (await openStorageDatabase()).delete('sessions', sessionId);
}