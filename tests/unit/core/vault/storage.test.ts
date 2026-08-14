import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import {
  DB_VERSION,
  destroyVault,
  readMeta,
  resetConnectionForTests,
  storageSchemaVersion,
  writeMeta,
  writeVault,
} from '@/core/vault/storage';

const DB_NAME = 'veilpay';

beforeEach(async () => {
  resetConnectionForTests();
  indexedDB.deleteDatabase(DB_NAME);
});

describe('versioned IndexedDB storage', () => {
  it('reports schema version 2', () => {
    expect(DB_VERSION).toBe(2);
    expect(storageSchemaVersion()).toBe(2);
  });

  it('upgrades a v1 database additively and preserves legacy stores/data', async () => {
    const legacy = await openDB(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore('vault', { keyPath: 'id' });
        database.createObjectStore('meta', { keyPath: 'key' });
      },
    });
    await legacy.put('meta', { key: 'legacy', value: { retained: true } });
    legacy.close();

    resetConnectionForTests();
    expect(await readMeta<{ retained: boolean }>('legacy')).toEqual({ retained: true });

    const upgraded = await openDB(DB_NAME, 2);
    expect([...upgraded.objectStoreNames].sort()).toEqual([
      'auditLedger',
      'meta',
      'privacyCommitments',
      'sessions',
      'transactions',
      'vault',
      'walletData',
      'x402Channels',
    ]);
    upgraded.close();
  });

  it('destroyVault clears vault, metadata, and all v2 stores', async () => {
    await writeMeta('keep-before-reset', { value: 1 });
    await writeVault({
      v: 1,
      kdf: 'PBKDF2-SHA512',
      iterations: 1,
      salt: new Uint8Array([1]),
      iv: new Uint8Array([2]),
      ciphertext: new Uint8Array([3]),
    });
    await destroyVault();
    expect(await readMeta('keep-before-reset')).toBeUndefined();

    const database = await openDB(DB_NAME, DB_VERSION);
    for (const name of database.objectStoreNames) {
      expect(await database.count(name)).toBe(0);
    }
    database.close();
  });
});
