/**
 * Page-world shim — defines `window.veilpay`.
 *
 * Runs in the page's own realm, so it must be assumed readable and observable by
 * the page. It therefore holds nothing sensitive: it is a postMessage courier to
 * the content script and nothing more.
 *
 * The object is frozen and defined non-configurably so a page script cannot
 * silently replace `window.veilpay` with a lookalike after we install it.
 */
import { EIP1193, eip1193CodeFor, eip1193Error } from '@/core/chains/evm/eip1193';
import { isX402Challenge } from '@/core/x402/types';

const CHANNEL = 'veilpay:v1';
const TIMEOUT_MS = 30_000;

/**
 * Read-only EVM methods proxied to the background without approval. These are
 * exactly the reads a dapp makes on connect (balance, block, nonce, calls); the
 * background re-checks this against its own allowlist before touching the node.
 */
const READ_ONLY_METHODS = new Set([
  'eth_blockNumber',
  'eth_getBalance',
  'eth_getCode',
  'eth_getTransactionCount',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getLogs',
  'eth_gasPrice',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_maxPriorityFeePerGas',
  'eth_call',
  'eth_syncing',
  'net_version',
  'web3_clientVersion',
]);

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: number;
}

const pending = new Map<string, Pending>();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  const data = event.data as Record<string, unknown> | null;
  if (
    typeof data !== 'object' ||
    data === null ||
    data.channel !== CHANNEL ||
    data.direction !== 'response' ||
    typeof data.nonce !== 'string'
  ) {
    return;
  }

  const entry = pending.get(data.nonce);
  if (entry === undefined) return;
  pending.delete(data.nonce);
  clearTimeout(entry.timer);

  if (data.ok === true) {
    entry.resolve(data.data);
    return;
  }

  const error = data.error as { code?: string; message?: string } | undefined;
  const err = new Error(error?.message ?? 'The wallet rejected the request.') as Error & {
    code?: string | number;
  };
  // Preserve the protocol error code, and map it to the EIP-1193 numeric code
  // dapps branch on (e.g. 4902 for an unrecognized chain). Unmapped codes keep
  // only the string form.
  if (typeof error?.code === 'string') {
    err.code = error.code;
    const eip1193 = eip1193CodeFor(error.code);
    if (eip1193 !== undefined) err.code = eip1193;
  }
  entry.reject(err);
});

function request(kind: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const nonce = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      pending.delete(nonce);
      reject(new Error(`Veilpay did not respond to "${kind}" in time.`));
    }, TIMEOUT_MS);

    pending.set(nonce, { resolve, reject, timer });
    window.postMessage(
      { channel: CHANNEL, direction: 'request', nonce, kind, payload },
      window.origin,
    );
  });
}

const veilpay = Object.freeze({
  version: '0.0.1' as const,
  /** True when the extension is installed. Deliberately reveals nothing else. */
  isVeilpay: true as const,

  /** Liveness check. Useful for dapps deciding whether to show a connect button. */
  async ping(): Promise<{ receivedAt: number }> {
    return (await request('ping', { sentAt: Date.now() })) as { receivedAt: number };
  },

  /**
   * Whether the wallet is set up and unlocked. No addresses, no balances —
   * those require explicit per-origin consent, which lands in Phase 3.
   */
  async status(): Promise<{ state: 'uninitialized' | 'locked' | 'unlocked' }> {
    return (await request('vault.status', {})) as {
      state: 'uninitialized' | 'locked' | 'unlocked';
    };
  },

  /**
   * EIP-1193 Ethereum provider.
   * Injected so dapps can call `window.veilpay.ethereum.request(...)`.
   * Supports the core EVM methods needed for testnet dapp interaction.
   */
  ethereum: Object.freeze({
    isVeilpay: true as const,
    isMetaMask: false as const,

    _events: new Map<string, Array<(...args: unknown[]) => void>>(),

    /**
     * EIP-1193 request method.
     * https://eips.ethereum.org/EIPS/eip-1193
     */
    async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
      const { method, params = [] } = args;

      switch (method) {
        case 'eth_chainId':
          return ((await request('eth.chainId', {})) as { chainId: string }).chainId;

        case 'eth_requestAccounts':
          return ((await request('eth.requestAccounts', { origin: window.origin })) as { accounts: string[] }).accounts;

        case 'eth_accounts':
          return ((await request('eth.accounts', { origin: window.origin })) as { accounts: string[] }).accounts;

        case 'eth_sendTransaction': {
          const tx = params[0] as Record<string, string | undefined>;
          return ((await request('eth.sendTransaction', { origin: window.origin, tx })) as { hash: string }).hash;
        }

        case 'personal_sign': {
          const [message, address] = params as [string, string];
          return ((await request('personal.sign', { origin: window.origin, address, message })) as { signature: string }).signature;
        }

        case 'wallet_switchEthereumChain': {
          const { chainId } = params[0] as { chainId: string };
          const result = (await request('eth.switchChain', {
            origin: window.origin,
            chainId,
          })) as { chainId: string };
          // EIP-1193: emit chainChanged after a successful switch so dapps
          // listening for it re-read their chain context.
          this._emit('chainChanged', result.chainId);
          return null; // EIP-1193 requires a null result on success
        }

        case 'wallet_addEthereumChain':
          // The wallet is single-chain testnet and does not support adding
          // chains. EIP-1193 error 4200: method not supported.
          throw eip1193Error(EIP1193.UNSUPPORTED_METHOD, 'wallet_addEthereumChain is not supported.');

        case 'eth_signTypedData':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData_v4': {
          const [address, data] = params as [string, unknown];
          // Dapps pass typed data as either an object or a JSON string.
          const typedData = typeof data === 'string' ? JSON.parse(data) : data;
          return (
            (await request('eth.signTypedData', {
              origin: window.origin,
              address,
              typedData,
            })) as { signature: string }
          ).signature;
        }

        default:
          // Read-only passthrough for the calls dapps make on connect.
          if (READ_ONLY_METHODS.has(method)) {
            const { result } = (await request('eth.rpc', { method, params })) as { result: unknown };
            return result;
          }
          throw eip1193Error(
            EIP1193.UNSUPPORTED_METHOD,
            `Veilpay: unsupported method "${method}".`,
          );
      }
    },

    /** EIP-1193 event listener registration. */
    on(event: string, fn: (...args: unknown[]) => void): void {
      const listeners = this._events.get(event) ?? [];
      listeners.push(fn);
      this._events.set(event, listeners);
    },

    /** EIP-1193 event listener removal. */
    removeListener(event: string, fn: (...args: unknown[]) => void): void {
      const listeners = this._events.get(event) ?? [];
      this._events.set(
        event,
        listeners.filter((l) => l !== fn),
      );
    },

    /** Emits an event to all registered listeners. */
    _emit(event: string, ...args: unknown[]): void {
      const listeners = this._events.get(event) ?? [];
      for (const fn of listeners) {
        try {
          fn(...args);
        } catch {
          // Swallow listener errors (per EIP-1193).
        }
      }
    },
  }),

  solana: Object.freeze({
    isVeilpay: true as const,
    isPhantom: false as const,

    _events: new Map<string, Array<(...args: unknown[]) => void>>(),

    async connect(): Promise<{ publicKey: { toString: () => string } }> {
      const result = (await request('solana.connect', { origin: window.origin })) as { publicKey: string };
      return { publicKey: { toString: () => result.publicKey } };
    },

    async signTransaction(transaction: string): Promise<{ signature: string; signedTransaction: string }> {
      return (await request('solana.signTransaction', { origin: window.origin, transaction })) as { signature: string; signedTransaction: string };
    },

    async signMessage(message: string, publicKey?: string): Promise<{ signature: string; publicKey: string }> {
      // Matches Phantom's `signMessage(message, publicKey)` shape; the address is
      // the connected account the dapp wants the message signed by.
      return (await request('solana.signMessage', { origin: window.origin, message, address: publicKey })) as { signature: string; publicKey: string };
    },

    on(event: string, fn: (...args: unknown[]) => void): void {
      const listeners = this._events.get(event) ?? [];
      listeners.push(fn);
      this._events.set(event, listeners);
    },

    removeListener(event: string, fn: (...args: unknown[]) => void): void {
      const listeners = this._events.get(event) ?? [];
      this._events.set(event, listeners.filter((l) => l !== fn));
    },
  }),

  /**
   * Agent payment surface — page-injected `window.veilpay.agent`.
   *
   * Lets a page or in-browser agent satisfy an x402 challenge received from a
   * server's 402 response. Every payment prompts for human approval in the
   * wallet UI (always-prompt; grants arrive in a later phase).
   */
  agent: Object.freeze({
    /**
     * Pays an x402 challenge by signing a payment payload.
     *
     * The challenge is validated in the background and shown in the approval
     * overlay; on approval this resolves to the `X-PAYMENT` header value to
     * attach to a replay of the original request.
     */
    async payChallenge(challenge: unknown): Promise<{ paymentHeader: string }> {
      if (!isX402Challenge(challenge)) {
        throw new Error('Veilpay: payChallenge expects an x402 challenge object.');
      }
      return (await request('x402.pay', { challenge })) as { paymentHeader: string };
    },

    /**
     * Negotiates a grant. Always opens the wallet's approval overlay — a grant
     * is never created silently. The wallet returns the created grant id.
     */
    async requestGrant(requestInput: unknown): Promise<{ grantId: string }> {
      return (await request('vap.grant.request', requestInput)) as { grantId: string };
    },

    /** Lists the grants this origin holds. */
    async listGrants(): Promise<unknown> {
      return request('vap.grants.list', {});
    },

    /** Revokes a grant by id. */
    async revokeGrant(id: string): Promise<{ ok: boolean }> {
      return (await request('vap.grant.revoke', { id })) as { ok: boolean };
    },

    /** Describes the current capability surface, for agents doing discovery. */
    async getCapabilities(): Promise<{ x402: boolean; grants: boolean }> {
      return { x402: true, grants: true };
    },
  }),
});

Object.defineProperty(window, 'veilpay', {
  value: veilpay,
  writable: false,
  configurable: false,
  enumerable: false,
});

// ---------------------------------------------------------------------------
// Wallet discovery
//
// Two mechanisms, because dapps use both:
//
//  1. EIP-6963 — the modern standard. Dapps dispatch `eip6963:requestProvider`
//     and wallets answer with `eip6963:announceProvider`. This is what makes
//     Veilpay appear as a selectable option alongside MetaMask, Phantom, etc.
//     We re-announce on every request so a dapp that boots after us still sees
//     the provider.
//  2. `window.ethereum` — the legacy heuristic. If no other wallet claimed it we
//     define it ourselves; if one did, we register into its `.providers` array
//     (the multi-wallet convention) instead of clobbering it.
// ---------------------------------------------------------------------------

const PROVIDER_INFO = Object.freeze({
  uuid: 'b1c2d3e4-f5a6-4b7c-8d9e-0a1b2c3d4e5f',
  name: 'Veilpay',
  icon:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Ccircle cx='64' cy='64' r='64' fill='%23F59E0B'/%3E%3Cpath d='M52 50 L64 74 L76 50 L84 50 L68 80 L60 80 L44 50 Z' fill='%23110B02'/%3E%3C/svg%3E",
  rdns: 'io.veilpay',
});

function announceProvider(): void {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({ info: PROVIDER_INFO, provider: veilpay.ethereum }),
    }),
  );
}

window.addEventListener('eip6963:requestProvider', announceProvider);
announceProvider();

try {
  const target = window as unknown as { ethereum?: unknown };
  const existing = target.ethereum as
    | (Record<string, unknown> & { providers?: unknown[] })
    | undefined;
  if (existing === undefined) {
    Object.defineProperty(window, 'ethereum', {
      value: veilpay.ethereum,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } else if (Array.isArray(existing.providers)) {
    if (!existing.providers.includes(veilpay.ethereum)) {
      existing.providers.push(veilpay.ethereum);
    }
  } else {
    existing.providers = [existing, veilpay.ethereum];
  }
} catch {
  // Another wallet locked the property. EIP-6963 above still announces us, so
  // dapps that follow the standard can still discover Veilpay.
}

window.dispatchEvent(new Event('veilpay#initialized'));
window.dispatchEvent(new Event('ethereum#initialized'));
