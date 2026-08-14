import { beforeEach, describe, expect, it } from 'vitest';
import {
  isCompleteSchemaMarker,
  markSchemaMigrationComplete,
  readSchemaMarker,
} from '@/core/vault/storage-migrations';
import { resetConnectionForTests } from '@/core/vault/storage';

describe('storage migration marker', () => {
  beforeEach(() => {
    indexedDB.deleteDatabase('veilpay');
    resetConnectionForTests();
  });

  it('validates only complete version-2 markers', () => {
    expect(isCompleteSchemaMarker({ version: 2, status: 'complete', migratedAt: 10 }, 2)).toBe(true);
    expect(isCompleteSchemaMarker({ version: 1, status: 'complete', migratedAt: 10 }, 2)).toBe(false);
    expect(isCompleteSchemaMarker({ version: 2, status: 'pending', migratedAt: 10 }, 2)).toBe(false);
    expect(isCompleteSchemaMarker(null, 2)).toBe(false);
  });

  it('writes and reads the completion marker through legacy metadata', async () => {
    await markSchemaMigrationComplete(1234);
    expect(await readSchemaMarker()).toEqual({
      version: 2,
      status: 'complete',
      migratedAt: 1234,
    });
  });
});
