import { create } from 'zustand';
import { createClient } from '@/core/messaging/client';
import type { ChainId, MessageSource, VaultState, ZkCapability } from '@/core/messaging/protocol';
import type { X402Challenge } from '@/core/x402/types';
import type { GrantCaps } from '@/core/vap/grant';

/**
 * UI-side wallet state.
 *
 * Holds only what a surface can safely see: vault state, addresses, balances,
 * and the measured ZK capability. No key material crosses into this store,
 * because everything it knows is one `chrome.runtime.sendMessage` away from a
 * page context if a surface is ever compromised.
 *
 * Actions map one-to-one onto request kinds the background implements. The
 * lifecycle actions return a boolean rather than throwing, so a caller can keep
 * the user on the current screen and show `error` without a try/catch at every
 * call site. A freshly generated recovery phrase is the one value returned to
 * the caller instead of being stored — see `generateMnemonic`.
 */

export interface AccountView {
  chain: ChainId;
  index: number;
  address: string;
  path: string;
}

/** Keyed `chain:address`, since one address is only meaningful for its chain. */
export type BalanceKey = `${ChainId}:${string}`;

export function balanceKey(chain: ChainId, address: string): BalanceKey {
  return `${chain}:${address}`;
}

export interface SecurityStatus {
  pinEnabled: boolean;
  webauthnEnabled: boolean;
}

export interface PendingConnection {
  origin: string;
  requestedAccounts: { chain: string; address: string }[];
  createdAt: number;
}

/** Pending dapp transaction/signature request awaiting a human decision. */
export interface PendingApproval {
  id: string;
  kind: 'tx' | 'sign';
  origin: string;
  address: string;
  to?: string;
  value?: string;
  data?: string;
  message?: string;
  createdAt: number;
}

/** Pending x402 payment request awaiting a human decision. */
export interface PendingX402Payment {
  id: string;
  origin: string;
  /** The challenge issued by the server's 402 response. */
  challenge: X402Challenge;
  createdAt: number;
}

/** Pending VAP grant request awaiting a human decision. */
export interface PendingGrantRequest {
  id: string;
  origin: string;
  /** The caps the page asked for; shown verbatim in the approval overlay. */
  requestedCaps: GrantCaps;
  /** Requested lifetime in seconds. */
  expiresInSeconds: number;
  createdAt: number;
}

interface WalletState {
  vaultState: VaultState;
  unlockedUntil: number | null;
  accounts: AccountView[];
  accountIndex: number;
  /** Native units (wei / lamports / stroops). Absent until fetched. */
  balances: Partial<Record<BalanceKey, bigint>>;
  zkCapability: ZkCapability | null;
  securityStatus: SecurityStatus | null;
  isLoading: boolean;
  /** Display-safe message from the protocol layer. */
  error: string | null;
  /** Pending dapp connection request (set by background, consumed by popup). */
  pendingConnection: PendingConnection | null;
  /** Pending dapp transaction/signature request (set by background, shown by UI). */
  pendingApproval: PendingApproval | null;
  /** Pending x402 payment request (set by background, shown by UI). */
  pendingX402Payment: PendingX402Payment | null;
  /** Pending VAP grant request (set by background, shown by UI). */
  pendingGrantRequest: PendingGrantRequest | null;
}

interface WalletActions {
  /** Reads vault state and the cached ZK capability. Safe while locked. */
  refresh(): Promise<void>;
  loadAccounts(): Promise<void>;
  loadBalance(chain: ChainId, address: string): Promise<void>;
  loadAllBalances(): Promise<void>;
  /**
   * A new phrase for the user to write down, or null if the request failed.
   *
   * Returned to the caller and never placed in the store: a recovery phrase
   * parked in observable state is one devtools session away from being read.
   * The caller must not persist it either — hand it straight to `createVault`.
   */
  generateMnemonic(strength?: 128 | 256): Promise<string | null>;
  createVault(mnemonic: string, passphrase: string): Promise<boolean>;
  unlock(passphrase: string): Promise<boolean>;
  /** Destructive: wipes the encrypted vault on this device. */
  reset(): Promise<boolean>;
  lock(): Promise<void>;
  setAccountIndex(index: number): void;
  clearError(): void;
  /** Fetch a fee estimate for a transfer. Throws on failure. */
  estimateTransfer(
    chain: ChainId,
    index: number,
    to: string,
    amountNative: string,
  ): Promise<{ feeNative: string; gasLimit: string }>;
  /** Export a private key for a chain account. Security-sensitive. */
  exportKey(chain: ChainId, index: number): Promise<{ privateKey: string; address: string }>;
  /** Build, sign, and broadcast a transfer. Returns the tx hash. Throws on failure. */
  sendTransfer(
    chain: ChainId,
    index: number,
    to: string,
    amountNative: string,
  ): Promise<{ hash: string }>;
  /** Security settings for the setup flow. Safe while locked. */
  loadSecurityStatus(): Promise<void>;
  setupSecurityPin(pin: string): Promise<boolean>;
  verifySecurityPin(pin: string): Promise<boolean>;
  setupSecurityWebAuthn(): Promise<boolean>;
  /** Reads the current pending dapp connection request, if any. */
  loadPendingConnection(): Promise<void>;
  /** Approves (grants) or denies the pending dapp connection. */
  resolvePendingConnection(
    origin: string,
    addresses: string[],
    action: 'approve' | 'deny',
  ): Promise<boolean>;
  /** Reads the current pending dapp transaction/signature request, if any. */
  loadPendingApproval(): Promise<void>;
  /** Approves or denies the pending dapp transaction/signature request. */
  resolvePendingApproval(id: string, action: 'approve' | 'deny'): Promise<boolean>;
  /** Reads the current pending x402 payment request, if any. */
  loadPendingX402(): Promise<void>;
  /** Approves or denies the pending x402 payment request. */
  resolvePendingX402(id: string, action: 'approve' | 'deny'): Promise<boolean>;
  /** Reads the current pending VAP grant request, if any. */
  loadPendingGrantRequest(): Promise<void>;
  /**
   * Approves or denies the pending VAP grant request.
   * `pin` is required on approve when the wallet has a PIN configured (VAP-01).
   */
  resolvePendingGrantRequest(
    id: string,
    action: 'approve' | 'deny',
    pin?: string,
  ): Promise<boolean>;
}

const send = createClient('popup' as MessageSource);
let refreshInFlight: Promise<void> | null = null;

function messageFor(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export const useWallet = create<WalletState & WalletActions>((set, get) => ({
  vaultState: 'uninitialized',
  unlockedUntil: null,
  accounts: [],
  accountIndex: 0,
  balances: {},
  zkCapability: null,
  securityStatus: null,
  pendingConnection: null,
  pendingApproval: null,
  pendingX402Payment: null,
  pendingGrantRequest: null,
  isLoading: false,
  error: null,

  refresh: async () => {
    if (refreshInFlight !== null) return refreshInFlight;
    refreshInFlight = (async () => {
      set({ isLoading: true, error: null });
      try {
        const [status, zk] = await Promise.all([
          send('vault.status', {}),
          send('zk.capability', {}),
        ]);
        set({
          vaultState: status.state,
          unlockedUntil: status.unlockedUntil,
          zkCapability: zk,
        });
      } catch (cause) {
        set({ error: messageFor(cause, 'Could not read wallet status.') });
      } finally {
        set({ isLoading: false });
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  },

  loadAccounts: async () => {
    set({ isLoading: true, error: null });
    try {
      const accounts = await send('accounts.list', { accountIndex: get().accountIndex });
      // Coalesce so the store invariant `accounts: AccountView[]` holds even if
      // a malformed/absent response comes back — otherwise consumers reading
      // `accounts.length` crash on `undefined`.
      set({ accounts: Array.isArray(accounts) ? accounts : [] });
    } catch (cause) {
      // A locked vault arrives here as VAULT_LOCKED; surface it and clear stale
      // addresses rather than leaving the previous account list on screen.
      set({ accounts: [], error: messageFor(cause, 'Could not load accounts.') });
    } finally {
      set({ isLoading: false });
    }
  },

  loadBalance: async (chain, address) => {
    set({ error: null });
    try {
      const result = await send('account.balance', { chain, address });
      set({
        balances: {
          ...get().balances,
          [balanceKey(chain, address)]: BigInt(result.balance),
        },
      });
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not fetch balance.') });
    }
  },

  loadAllBalances: async () => {
    const { accounts } = get();
    if (accounts.length === 0) return;

    set({ isLoading: true, error: null });
    // One slow or down RPC must not hide the chains that did answer, so failures
    // are collected per account instead of rejecting the whole batch.
    const settled = await Promise.allSettled(
      accounts.map(async (account) => ({
        key: balanceKey(account.chain, account.address),
        balance: BigInt((await send('account.balance', account)).balance),
      })),
    );

    const balances = { ...get().balances };
    let failures = 0;
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        balances[outcome.value.key] = outcome.value.balance;
      } else {
        failures += 1;
      }
    }

    set({
      balances,
      isLoading: false,
      error:
        failures === 0
          ? null
          : `${failures} of ${settled.length} balances could not be fetched.`,
    });
  },

  generateMnemonic: async (strength = 256) => {
    set({ error: null });
    try {
      return (await send('mnemonic.generate', { strength })).mnemonic;
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not generate a recovery phrase.') });
      return null;
    }
  },

  createVault: async (mnemonic, passphrase) => {
    set({ isLoading: true, error: null });
    try {
      const { state } = await send('vault.create', { mnemonic, passphrase });
      // Creation leaves the vault unlocked; addresses are loaded by the caller
      // so onboarding controls when the first derivation happens.
      set({ vaultState: state });
      return true;
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not create the wallet.') });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  unlock: async (passphrase) => {
    set({ isLoading: true, error: null });
    try {
      const { state, unlockedUntil } = await send('vault.unlock', { passphrase });
      set({ vaultState: state, unlockedUntil });
      return true;
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not unlock the wallet.') });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  reset: async () => {
    set({ isLoading: true, error: null });
    try {
      const { state } = await send('vault.reset', { confirmation: 'DELETE' });
      set({ vaultState: state, unlockedUntil: null, accounts: [], balances: {} });
      return true;
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not reset the wallet.') });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  lock: async () => {
    set({ isLoading: true, error: null });
    try {
      const { state } = await send('session.lock', {});
      // Addresses and balances are dropped on lock: leaving them rendered would
      // imply a live session that no longer exists.
      set({ vaultState: state, unlockedUntil: null, accounts: [], balances: {} });
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not lock the wallet.') });
    } finally {
      set({ isLoading: false });
    }
  },

  setAccountIndex: (index) => {
    if (!Number.isInteger(index) || index < 0) return;
    set({ accountIndex: index, accounts: [], balances: {} });
  },

  estimateTransfer: async (chain, index, to, amountNative) => {
    set({ error: null });
    try {
      return await send('tx.estimate', { chain, index, to, amountNative });
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not estimate the transfer fee.') });
      throw cause;
    }
  },

  sendTransfer: async (chain, index, to, amountNative) => {
    set({ error: null });
    try {
      return await send('tx.transfer', { chain, index, to, amountNative });
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not send the transfer.') });
      throw cause;
    }
  },

  exportKey: async (chain, index) => {
    set({ error: null });
    try {
      return await send('account.exportKey', { chain, index });
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not export the key.') });
      throw cause;
    }
  },

  loadSecurityStatus: async () => {
    set({ error: null });
    try {
      const status = await send('security.status', {});
      set({ securityStatus: status });
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not read security settings.') });
    }
  },

  setupSecurityPin: async (pin) => {
    set({ isLoading: true, error: null });
    try {
      const { ok } = await send('security.pin.setup', { pin });
      return ok;
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not set up a PIN.') });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  verifySecurityPin: async (pin) => {
    set({ error: null });
    try {
      const { ok } = await send('security.pin.verify', { pin });
      return ok;
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not verify the PIN.') });
      return false;
    }
  },

  setupSecurityWebAuthn: async () => {
    set({ isLoading: true, error: null });
    try {
      const { ok } = await send('security.webauthn.setup', {});
      return ok;
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not register a passkey.') });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  loadPendingConnection: async () => {
    set({ error: null });
    try {
      const pending = await send('permissions.pending', {});
      // Coalesce so the store invariant is `null | PendingConnection`, never
      // `undefined` — a malformed/absent response would otherwise crash the UI.
      set({ pendingConnection: pending ?? null });
    } catch (cause) {
      // A pending request is optional; a read failure is not fatal.
      set({ error: messageFor(cause, 'Could not read the connection request.') });
    }
  },

  resolvePendingConnection: async (origin, addresses, action) => {
    set({ isLoading: true, error: null });
    try {
      const { ok } = await send('permissions.connection', { origin, addresses, action });
      if (ok) set({ pendingConnection: null });
      return ok;
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not resolve the connection request.') });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  loadPendingApproval: async () => {
    set({ error: null });
    try {
      const pending = await send('tx.pending', {});
      // Coalesce so the store invariant is `null | PendingApproval`.
      set({ pendingApproval: pending ?? null });
    } catch (cause) {
      // A pending approval is optional; a read failure is not fatal.
      set({ error: messageFor(cause, 'Could not read the approval request.') });
    }
  },

  resolvePendingApproval: async (id, action) => {
    set({ isLoading: true, error: null });
    try {
      const { ok } = await send('tx.resolve', { id, action });
      if (ok) set({ pendingApproval: null });
      return ok;
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not resolve the approval request.') });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  loadPendingX402: async () => {
    set({ error: null });
    try {
      const pending = await send('x402.pending', {});
      // Coalesce so the store invariant is `null | PendingX402Payment`.
      set({ pendingX402Payment: pending ?? null });
    } catch (cause) {
      // A pending payment is optional; a read failure is not fatal.
      set({ error: messageFor(cause, 'Could not read the payment request.') });
    }
  },

  resolvePendingX402: async (id, action) => {
    set({ isLoading: true, error: null });
    try {
      const { ok } = await send('x402.resolve', { id, action });
      if (ok) set({ pendingX402Payment: null });
      return ok;
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not resolve the payment request.') });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  loadPendingGrantRequest: async () => {
    set({ error: null });
    try {
      const pending = await send('vap.grant.pending', {});
      // Coalesce so the store invariant is `null | PendingGrantRequest`.
      set({ pendingGrantRequest: pending ?? null });
    } catch (cause) {
      // A pending grant request is optional; a read failure is not fatal.
      set({ error: messageFor(cause, 'Could not read the grant request.') });
    }
  },

  resolvePendingGrantRequest: async (id, action, pin) => {
    set({ isLoading: true, error: null });
    try {
      const { ok } = await send('vap.grant.resolve', { id, action, pin });
      if (ok) set({ pendingGrantRequest: null });
      return ok;
    } catch (cause) {
      set({ error: messageFor(cause, 'Could not resolve the grant request.') });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
