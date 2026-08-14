import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vault from '@/core/vault';
import { readVault, vaultExists } from '@/core/vault/storage';
import { MAX_SESSION_MS, SessionService } from '@/core/vault/session';

/**
 * Vault lifecycle: create → lock → unlock → reset, plus the session guarantees
 * the agent-payment layer will rely on.
 *
 * These exercise real PBKDF2 and AES-GCM against fake-indexeddb rather than a
 * mocked crypto layer, so each create/unlock costs a real key stretch. The suite
 * is kept deliberately narrow for that reason — one derivation per assertion
 * that needs one, and no repetition for its own sake.
 */

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PASSPHRASE = 'correct-horse-battery-staple';

beforeEach(async () => {
  // Drops in-memory session state and any vault a previous test created. Uses
  // the real reset path, so isolation and the reset code share one mechanism.
  vault.resetSessionForTests();
  await vault.reset();
});

describe('vault lifecycle', () => {
  it('reports uninitialized before a vault exists', async () => {
    expect(await vault.getState()).toBe('uninitialized');
    expect(await vaultExists()).toBe(false);
  });

  it('creates a vault and leaves it unlocked', async () => {
    await vault.create(PHRASE, PASSPHRASE);

    expect(await vault.getState()).toBe('unlocked');
    expect(await vaultExists()).toBe(true);
    expect(vault.unlockedUntil()).toBeGreaterThan(Date.now());
  });

  it('persists ciphertext only — no phrase or passphrase at rest', async () => {
    await vault.create(PHRASE, PASSPHRASE);

    const record = await readVault();
    expect(record).toBeDefined();

    // Byte arrays are flattened so a plaintext run of characters would show up
    // as readable text if the sealing step were ever bypassed.
    const serialized = JSON.stringify(record, (_key, value) =>
      value instanceof Uint8Array ? Array.from(value) : value,
    );

    expect(serialized).not.toContain('abandon');
    expect(serialized).not.toContain('about');
    expect(serialized).not.toContain(PASSPHRASE);
  });

  it('locks on demand and refuses derivation while locked', async () => {
    await vault.create(PHRASE, PASSPHRASE);
    vault.lock();

    expect(await vault.getState()).toBe('locked');
    expect(vault.unlockedUntil()).toBeNull();
    await expect(vault.getAllAccountAddresses(0)).rejects.toThrow(vault.VaultLocked);
  });

  it('unlocks with the right passphrase and derives the same addresses', async () => {
    await vault.create(PHRASE, PASSPHRASE);
    const before = await vault.getAllAccountAddresses(0);

    vault.lock();
    await vault.unlock(PASSPHRASE);

    expect(await vault.getState()).toBe('unlocked');
    expect(await vault.getAllAccountAddresses(0)).toEqual(before);
  });

  it('derives one address per chain, all distinct', async () => {
    await vault.create(PHRASE, PASSPHRASE);
    const accounts = await vault.getAllAccountAddresses(0);

    expect(accounts.map((account) => account.chain).sort()).toEqual([
      'evm',
      'solana',
      'stellar',
    ]);
    expect(new Set(accounts.map((account) => account.address)).size).toBe(3);
    for (const account of accounts) {
      expect(account.address.length).toBeGreaterThan(0);
      expect(account.path).toMatch(/^m\//);
    }
  });

  it('rejects a wrong passphrase without unlocking', async () => {
    await vault.create(PHRASE, PASSPHRASE);
    vault.lock();

    await expect(vault.unlock('not-the-passphrase')).rejects.toThrow(
      vault.DecryptionFailed,
    );
    expect(await vault.getState()).toBe('locked');
  });

  it('rejects a trivially weak passphrase before writing anything', async () => {
    await expect(vault.create(PHRASE, 'short')).rejects.toThrow(vault.WeakPassphrase);
    await expect(vault.create(PHRASE, 'aaaaaaaaaaaa')).rejects.toThrow(
      vault.WeakPassphrase,
    );

    expect(await vaultExists()).toBe(false);
  });

  it('rejects a phrase that fails BIP-39 checksum validation', async () => {
    // Valid wordlist entries, invalid checksum.
    const bad = PHRASE.replace('about', 'abandon');
    expect(vault.validateMnemonic(bad)).toBe(false);
    await expect(vault.create(bad, PASSPHRASE)).rejects.toThrow();
    expect(await vaultExists()).toBe(false);
  });

  it('refuses to overwrite an existing vault', async () => {
    await vault.create(PHRASE, PASSPHRASE);
    await expect(vault.create(PHRASE, 'another-good-passphrase')).rejects.toThrow(
      vault.VaultAlreadyExists,
    );
  });

  it('normalizes surrounding and repeated whitespace in a phrase', async () => {
    await vault.create(`  ${PHRASE.replace(/ /g, '   ')}  `, PASSPHRASE);
    expect(await vault.getState()).toBe('unlocked');
  });

  it('returns to uninitialized after a reset', async () => {
    await vault.create(PHRASE, PASSPHRASE);
    await vault.reset();

    expect(await vault.getState()).toBe('uninitialized');
    expect(await vaultExists()).toBe(false);
    expect(await readVault()).toBeUndefined();
  });

  it('relocks once the idle window has elapsed', async () => {
    await vault.create(PHRASE, PASSPHRASE);
    expect(await vault.getState()).toBe('unlocked');

    // Only Date is faked: faking timers wholesale would stall fake-indexeddb's
    // internal scheduling, and the expiry decision reads the clock directly.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + vault.DEFAULT_IDLE_MS + 1_000);
      expect(await vault.getState()).toBe('locked');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an idle timeout outside the supported range', () => {
    expect(() => vault.setIdleTimeout(60_000)).toThrow(RangeError);
    expect(() => vault.setIdleTimeout(9 * 60 * 60 * 1000)).toThrow(RangeError);
  });
});

describe('session expiry rules', () => {
  const IDLE = 15 * 60 * 1000;

  it('expires on an idle window with no activity', () => {
    const session = new SessionService(IDLE, 0);

    expect(session.expiry(IDLE - 1)).toBeNull();
    expect(session.expiry(IDLE)).toBe('idle');
  });

  it('extends the window on recorded activity', () => {
    const session = new SessionService(IDLE, 0);

    session.recordActivity(IDLE - 1);
    expect(session.expiry(IDLE + 1)).toBeNull();
    expect(session.timeRemaining(IDLE - 1)).toBe(IDLE);
  });

  /**
   * The property that matters for autonomous payments: continuous activity must
   * not be able to hold one unlock open forever. Without the absolute ceiling,
   * an agent loop touching the session would keep a wallet unlocked
   * indefinitely.
   */
  it('ends the session at the absolute ceiling despite continuous activity', () => {
    const session = new SessionService(IDLE, 0);

    session.recordActivity(MAX_SESSION_MS - 1);
    expect(session.expiry(MAX_SESSION_MS - 1)).toBeNull();
    expect(session.expiry(MAX_SESSION_MS)).toBe('max-session');
    expect(session.timeRemaining(MAX_SESSION_MS)).toBe(0);
  });

  it('reports recent human activity within the asked-for window', () => {
    const session = new SessionService(IDLE, 0);

    session.recordActivity(1_000);
    expect(session.hasRecentActivity(60_000, 30_000)).toBe(true);
    expect(session.hasRecentActivity(60_000, 90_000)).toBe(false);
  });

  it('reports no active session once stopped', () => {
    const session = new SessionService(IDLE, 0);

    session.stop();
    expect(session.isActive(1)).toBe(false);
  });

  it('refuses an out-of-range idle timeout at construction', () => {
    expect(() => new SessionService(1_000, 0)).toThrow(RangeError);
    expect(() => new SessionService(2 * 60 * 60 * 1000, 0)).toThrow(RangeError);
  });
});
