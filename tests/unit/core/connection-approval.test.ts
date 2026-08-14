import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setPendingConnection,
  getPendingConnection,
  clearPendingConnection,
} from '@/background/connection-approval';

const SESSION_KEY = 'veilpay:pendingConnection';

/**
 * The pending dapp connection record must be transient and readable across
 * surfaces. These tests pin the storage-backed contract so it cannot silently
 * become a durable grant.
 *
 * The shared chrome stub's `session` methods are independent no-op mocks, so for
 * these tests we wire a coherent in-memory session store to exercise the real
 * set→get→clear contract.
 */
describe('connection-approval (pending record)', () => {
  let backing: Record<string, unknown>;

  beforeEach(() => {
    backing = {};
    vi.mocked(chrome.storage.session.set).mockImplementation(
      (items) => Promise.resolve((Object.assign(backing, items), undefined)),
    );
    vi.mocked(chrome.storage.session.get).mockImplementation(() =>
      Promise.resolve({ [SESSION_KEY]: backing[SESSION_KEY] }),
    );
    // The chrome.storage.session.remove overloads are complex; the simplest
    // correct mock clears the backing map regardless of the key passed.
    (chrome.storage.session.remove as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => Promise.resolve((delete backing[SESSION_KEY], undefined)),
    );
  });

  it('round-trips a pending connection through chrome.storage.session', async () => {
    await setPendingConnection({
      origin: 'https://dapp.example',
      requestedAccounts: [{ chain: 'evm', address: '0xabc' }],
      createdAt: 123,
    });

    const record = await getPendingConnection();
    expect(record).toEqual({
      origin: 'https://dapp.example',
      requestedAccounts: [{ chain: 'evm', address: '0xabc' }],
      createdAt: 123,
    });
  });

  it('returns null when no request is pending', async () => {
    expect(await getPendingConnection()).toBeNull();
  });

  it('clears the pending record on deny', async () => {
    await setPendingConnection({
      origin: 'https://dapp.example',
      requestedAccounts: [],
      createdAt: 1,
    });
    await clearPendingConnection();
    expect(await getPendingConnection()).toBeNull();
  });

  it('rejects a malformed stored record as absent', async () => {
    // A corrupted/foreign value must read as "no pending request", never throw.
    backing[SESSION_KEY] = { notTheRightShape: true };
    expect(await getPendingConnection()).toBeNull();
  });
});
