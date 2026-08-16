import { beforeEach, describe, expect, it } from 'vitest';
import { writeMeta, resetConnectionForTests } from '@/core/vault/storage';
import { listPermissions } from '@/core/permissions';
import { getAddressBook } from '@/core/addressbook';
import { getCustomNetworks } from '@/core/networks';
import { readSettings, getSecurityStatus } from '@/core/security';

beforeEach(() => {
  resetConnectionForTests();
  indexedDB.deleteDatabase('veilpay');
});

/**
 * Boundary validation for the legacy meta-backed domains (storage-migration
 * Phase 5). Malformed rows must be dropped/fall back to defaults, never
 * propagated to callers as if valid.
 */

describe('meta domain boundary validation', () => {
  it('drops malformed permission rows instead of propagating them', async () => {
    await writeMeta('permissions:origins', [
      { origin: 'https://ok.example', addresses: ['0x1111'] },
      { origin: 42 },
      { origin: 'https://broken.example' }, // no addresses
      null,
    ]);
    const perms = await listPermissions();
    expect(perms).toHaveLength(1);
    expect(perms[0]?.origin).toBe('https://ok.example');
  });

  it('drops malformed address book entries instead of propagating them', async () => {
    await writeMeta('addressbook:entries', [
      { id: 'a1', chain: 'evm', label: 'Friend', address: '0x1111', createdAt: 1 },
      { id: 'a2', chain: 'evm' }, // missing label/address
      'garbage',
    ]);
    const book = await getAddressBook();
    expect(book).toHaveLength(1);
    expect(book[0]?.label).toBe('Friend');
  });

  it('drops malformed custom networks instead of propagating them', async () => {
    await writeMeta('networks:custom', [
      { chain: 'solana', name: 'Dev', rpcUrl: 'https://api.devnet.solana.com' },
      { chain: 'evm' }, // missing name/rpcUrl
      { name: 'no-chain' },
    ]);
    const networks = await getCustomNetworks();
    expect(networks).toHaveLength(1);
    expect(networks[0]?.name).toBe('Dev');
  });

  it('falls back to defaults when security settings are malformed', async () => {
    await writeMeta('security:settings', { pinHash: undefined, webauthnEnabled: 'yes' });
    const status = await getSecurityStatus();
    expect(status).toEqual({ pinEnabled: false, webauthnEnabled: false });
    expect(await readSettings()).toMatchObject({ pinHash: null, webauthnEnabled: false });
  });

  it('preserves valid security settings', async () => {
    await writeMeta('security:settings', {
      pinHash: '0xabc',
      pinSalt: '0xsalt',
      webauthnCredentialId: null,
      webauthnPublicKey: null,
      webauthnEnabled: true,
    });
    const status = await getSecurityStatus();
    expect(status).toEqual({ pinEnabled: true, webauthnEnabled: true });
  });
});