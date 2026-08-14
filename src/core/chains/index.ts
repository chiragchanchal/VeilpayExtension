import type { Chain } from '@/core/vault/key-derivation';

/**
 * Chain service abstraction — thin HTTP wrappers around each chain's RPC.
 *
 * Design:
 *  - No heavy SDKs (ethers.js, @solana/web3.js, @stellar/js-sdk). Each is
 *    300–500 KB minified; we can't afford that footprint in an extension.
 *  - HTTP-only. No WebSocket subscriptions or persistent connections.
 *  - Public RPCs only. The extension ships with fallbacks (Infura, Alchemy,
 *    Solana mainnet RPC, Stellar Horizon); users can override.
 *  - RPC errors are propagated as-is. The caller (message router, UI) decides
 *    whether to retry, fall back, or show an error.
 */

export interface ChainService {
  /** Chain this service serves. */
  readonly chain: Chain;

  /** Get the balance of an address in the chain's native unit (wei, lamports, stroops). */
  getBalance(address: string): Promise<bigint>;

  /**
   * Estimate gas or compute units for a transaction.
   * For EVM, returns gas in units; for Solana, returns the fee in lamports.
   * For Stellar, returns the fee in stroops.
   */
  estimateGas(tx: unknown): Promise<bigint>;

  /**
   * Send a signed transaction and return its hash or ID.
   * The transaction must be fully signed by the caller.
   */
  sendTransaction(signedTx: unknown): Promise<string>;

  /**
   * Get the account's current sequence/nonce.
   * EVM returns the transaction nonce; Stellar returns the ledger sequence.
   * Solana has no per-account sequence and returns 0.
   */
  getSequence(address: string): Promise<bigint>;
}

/**
 * Only testnet endpoints are wired.
 *
 * The manifest ships testnet-only and `host_permissions` lists exactly these
 * origins. Adding a mainnet entry here without a matching permission would fail
 * at runtime with an opaque CORS error, and adding the permission would widen
 * the extension's reach past what the security model allows. Mainnet is a
 * deliberate later decision, not an omission.
 */
export const TESTNET_ENDPOINTS: Record<Chain, string> = {
  evm: 'https://ethereum-sepolia-rpc.publicnode.com',
  solana: 'https://api.devnet.solana.com',
  stellar: 'https://horizon-testnet.stellar.org',
};

/** Thin HTTP wrapper for EVM JSON-RPC. */
export function createEvmService(rpcUrl: string = TESTNET_ENDPOINTS.evm): ChainService {
  return new EvmService(rpcUrl);
}

/** Thin HTTP wrapper for Solana RPC. */
export function createSolanaService(
  rpcUrl: string = TESTNET_ENDPOINTS.solana,
): ChainService {
  return new SolanaService(rpcUrl);
}

/** Thin HTTP wrapper for Stellar Horizon. */
export function createStellarService(
  horizonUrl: string = TESTNET_ENDPOINTS.stellar,
): ChainService {
  return new StellarService(horizonUrl);
}

/** Dispatches to the right service for a chain. */
export function createChainService(chain: Chain, rpcUrl?: string): ChainService {
  switch (chain) {
    case 'evm':
      return createEvmService(rpcUrl);
    case 'solana':
      return createSolanaService(rpcUrl);
    case 'stellar':
      return createStellarService(rpcUrl);
  }
}

// ---------------------------------------------------------------------------
// EVM
// ---------------------------------------------------------------------------

class EvmService implements ChainService {
  readonly chain = 'evm';

  constructor(private rpcUrl: string) {}

  async getBalance(address: string): Promise<bigint> {
    const response = await this.call('eth_getBalance', [address, 'latest']);
    if (typeof response !== 'string') {
      throw new Error(`eth_getBalance returned non-string: ${typeof response}`);
    }
    return BigInt(response);
  }

  async estimateGas(tx: unknown): Promise<bigint> {
    const response = await this.call('eth_estimateGas', [tx]);
    if (typeof response !== 'string') {
      throw new Error(`eth_estimateGas returned non-string: ${typeof response}`);
    }
    return BigInt(response);
  }

  async sendTransaction(signedTx: unknown): Promise<string> {
    if (typeof signedTx !== 'string') {
      throw new Error('EVM transaction must be a serialized hex string.');
    }
    const response = await this.call('eth_sendRawTransaction', [signedTx]);
    if (typeof response !== 'string') {
      throw new Error(`eth_sendRawTransaction returned non-string: ${typeof response}`);
    }
    return response;
  }

  async getSequence(address: string): Promise<bigint> {
    const response = await this.call('eth_getTransactionCount', [address, 'latest']);
    if (typeof response !== 'string') {
      throw new Error(`eth_getTransactionCount returned non-string: ${typeof response}`);
    }
    return BigInt(response);
  }

  private async call(method: string, params: unknown[]): Promise<unknown> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`EVM RPC ${method} failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    if (
      typeof data !== 'object' ||
      data === null ||
      !('result' in data) ||
      !('jsonrpc' in data)
    ) {
      throw new Error(`EVM RPC ${method} returned invalid JSON-RPC: ${JSON.stringify(data)}`);
    }

    if ('error' in data && data.error !== null) {
      const err = data.error;
      const message =
        typeof err === 'object' && err !== null && 'message' in err
          ? String(err.message)
          : JSON.stringify(err);
      throw new Error(`EVM RPC ${method} error: ${message}`);
    }

    return (data as unknown as { result: unknown }).result;
  }
}

// ---------------------------------------------------------------------------
// Solana
// ---------------------------------------------------------------------------

class SolanaService implements ChainService {
  readonly chain = 'solana';

  constructor(private rpcUrl: string) {}

  async getBalance(address: string): Promise<bigint> {
    const response = (await this.call('getBalance', [address])) as unknown;
    if (typeof response !== 'object' || response === null || !('value' in response)) {
      throw new Error(`getBalance returned unexpected shape: ${JSON.stringify(response)}`);
    }
    const value = (response as unknown as { value: unknown }).value;
    if (typeof value !== 'number') {
      throw new Error(`getBalance value is not a number: ${typeof value}`);
    }
    return BigInt(value);
  }

  async estimateGas(): Promise<bigint> {
    // Solana doesn't pre-estimate; we return a fixed fee for now.
    // A real implementation would fetch current network fees via getFeeForMessage.
    return BigInt(5000); // 5000 lamports
  }

  async sendTransaction(signedTx: unknown): Promise<string> {
    if (typeof signedTx !== 'string') {
      throw new Error('Solana transaction must be a base64 string.');
    }
    const response = await this.call('sendTransaction', [signedTx]);
    if (typeof response !== 'string') {
      throw new Error(`sendTransaction returned non-string: ${typeof response}`);
    }
    return response;
  }

  async getSequence(address: string): Promise<bigint> {
    const response = (await this.call('getAccountInfo', [address])) as unknown;
    if (typeof response !== 'object' || response === null || !('value' in response)) {
      throw new Error(
        `getAccountInfo returned unexpected shape: ${JSON.stringify(response)}`,
      );
    }
    const value = (response as unknown as { value: unknown }).value;
    if (
      typeof value !== 'object' ||
      value === null ||
      !('lamports' in value) ||
      !('owner' in value)
    ) {
      throw new Error(
        `getAccountInfo value has unexpected shape: ${JSON.stringify(value)}`,
      );
    }
    // Solana accounts don't have a sequence number like Stellar.
    // This is a placeholder; real use might return the account's owner/authority.
    return BigInt(0);
  }

  private async call(method: string, params: unknown[]): Promise<unknown> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`Solana RPC ${method} failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    if (
      typeof data !== 'object' ||
      data === null ||
      !('result' in data) ||
      !('jsonrpc' in data)
    ) {
      throw new Error(`Solana RPC ${method} returned invalid JSON-RPC: ${JSON.stringify(data)}`);
    }

    if ('error' in data && data.error !== null) {
      const err = data.error;
      const message =
        typeof err === 'object' && err !== null && 'message' in err
          ? String(err.message)
          : JSON.stringify(err);
      throw new Error(`Solana RPC ${method} error: ${message}`);
    }

    return (data as unknown as { result: unknown }).result;
  }
}

// ---------------------------------------------------------------------------
// Stellar
// ---------------------------------------------------------------------------

class StellarService implements ChainService {
  readonly chain = 'stellar';

  constructor(private horizonUrl: string) {}

  async getBalance(address: string): Promise<bigint> {
    const response = await fetch(`${this.horizonUrl}/accounts/${address}`);
    if (!response.ok) {
      throw new Error(`Horizon /accounts/${address} failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    if (
      typeof data !== 'object' ||
      data === null ||
      !('balances' in data) ||
      !Array.isArray((data as unknown as { balances: unknown }).balances)
    ) {
      throw new Error(`Horizon account returned unexpected shape: ${JSON.stringify(data)}`);
    }

    const balances = (data as unknown as { balances: unknown[] }).balances;
    const nativeBalance = balances.find(
      (b) =>
        typeof b === 'object' &&
        b !== null &&
        'asset_type' in b &&
        (b as unknown as { asset_type: unknown }).asset_type === 'native',
    );

    if (
      !nativeBalance ||
      typeof nativeBalance !== 'object' ||
      !('balance' in nativeBalance)
    ) {
      throw new Error(`No native balance found for ${address}`);
    }

    const balance = (nativeBalance as unknown as { balance: unknown }).balance;
    if (typeof balance !== 'string') {
      throw new Error(`Native balance is not a string: ${typeof balance}`);
    }

    // Stellar balance is in stroops (1 XLM = 10^7 stroops), represented as a string.
    return BigInt(Math.round(parseFloat(balance) * 1e7));
  }

  async estimateGas(): Promise<bigint> {
    // Stellar fees are deterministic: 100 stroops per operation.
    return BigInt(100);
  }

  async sendTransaction(signedTx: unknown): Promise<string> {
    if (typeof signedTx !== 'string') {
      throw new Error('Stellar transaction must be XDR (base64).');
    }

    const response = await fetch(`${this.horizonUrl}/transactions`, {
      method: 'POST',
      body: new URLSearchParams({ tx: signedTx }),
    });

    if (!response.ok) {
      throw new Error(`Horizon /transactions POST failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    if (typeof data !== 'object' || data === null || !('hash' in data)) {
      throw new Error(`Horizon transaction response unexpected: ${JSON.stringify(data)}`);
    }

    const hash = (data as unknown as { hash: unknown }).hash;
    if (typeof hash !== 'string') {
      throw new Error(`Horizon transaction hash is not a string: ${typeof hash}`);
    }

    return hash;
  }

  async getSequence(address: string): Promise<bigint> {
    const response = await fetch(`${this.horizonUrl}/accounts/${address}`);
    if (!response.ok) {
      throw new Error(`Horizon /accounts/${address} failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    if (typeof data !== 'object' || data === null || !('sequence' in data)) {
      throw new Error(`Horizon account returned unexpected shape: ${JSON.stringify(data)}`);
    }

    const sequence = (data as unknown as { sequence: unknown }).sequence;
    if (typeof sequence !== 'string') {
      throw new Error(`Horizon sequence is not a string: ${typeof sequence}`);
    }

    return BigInt(sequence);
  }
}

export { EvmService, SolanaService, StellarService };
