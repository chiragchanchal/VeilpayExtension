import { readMeta, writeMeta } from './storage';

export const SCHEMA_MARKER_KEY = '_internal:schema';

export interface StorageSchemaMarker {
  version: number;
  status: 'complete';
  migratedAt: number;
}

export function isCompleteSchemaMarker(value: unknown, version: number): value is StorageSchemaMarker {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === version &&
    candidate.status === 'complete' &&
    typeof candidate.migratedAt === 'number' &&
    Number.isFinite(candidate.migratedAt)
  );
}

export async function readSchemaMarker(): Promise<StorageSchemaMarker | undefined> {
  const marker = await readMeta<unknown>(SCHEMA_MARKER_KEY).catch(() => undefined);
  return isCompleteSchemaMarker(marker, 2) ? marker : undefined;
}

/** Records that the native IndexedDB migration completed; vault remains authoritative. */
export async function markSchemaMigrationComplete(now = Date.now()): Promise<void> {
  await writeMeta(SCHEMA_MARKER_KEY, {
    version: 2,
    status: 'complete',
    migratedAt: now,
  } satisfies StorageSchemaMarker);
}
