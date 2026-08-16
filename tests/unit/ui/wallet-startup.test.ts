import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWallet } from '@/ui/store/useWallet';

const INITIAL = {
  vaultState: 'uninitialized' as const,
  unlockedUntil: null,
  accounts: [],
  accountIndex: 0,
  balances: {},
  zkCapability: null,
  pendingConnection: null,
  pendingApproval: null,
  isLoading: false,
  error: null,
};

function kindOf(message: unknown): string {
  return typeof message === 'object' && message !== null && 'kind' in message
    ? String((message as { kind: unknown }).kind)
    : '';
}

describe('wallet startup refresh', () => {
  beforeEach(() => {
    useWallet.setState(INITIAL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('coalesces concurrent refresh calls into one status read', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation((message) => {
      const kind = kindOf(message);
      if (kind === 'vault.status') {
        return Promise.resolve({
          id: crypto.randomUUID(),
          ok: true,
          data: { state: 'uninitialized', unlockedUntil: null },
        }) as never;
      }
      return Promise.resolve({ id: crypto.randomUUID(), ok: true, data: null }) as never;
    });

    await Promise.all([useWallet.getState().refresh(), useWallet.getState().refresh()]);

    const calls = vi.mocked(chrome.runtime.sendMessage).mock.calls;
    expect(calls.filter(([message]) => kindOf(message) === 'vault.status')).toHaveLength(1);
    expect(calls.filter(([message]) => kindOf(message) === 'zk.capability')).toHaveLength(1);
    expect(useWallet.getState().isLoading).toBe(false);
  });

  it('a failing optional pending-read does not pollute the global error', async () => {
    // The four optional `loadPending*` reads run at boot alongside `refresh`.
    // A timeout on one of them must not flip the popup to the error screen when
    // the status read itself succeeded.
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      () => Promise.reject(new Error('background not ready')) as never,
    );

    await useWallet.getState().loadPendingConnection();
    await useWallet.getState().loadPendingApproval();
    await useWallet.getState().loadPendingX402();
    await useWallet.getState().loadPendingGrantRequest();

    expect(useWallet.getState().error).toBeNull();
    expect(useWallet.getState().pendingConnection).toBeNull();
    expect(useWallet.getState().pendingApproval).toBeNull();
    expect(useWallet.getState().pendingX402Payment).toBeNull();
    expect(useWallet.getState().pendingGrantRequest).toBeNull();
  });
});
