import { bytesToHex } from '@noble/hashes/utils';
import { EVM_CHAIN_ID } from './transaction';

/**
 * EVM fee and gas estimation over JSON-RPC.
 *
 * EIP-1559 separates the fee a transaction pays into two parts:
 *   - `maxPriorityFeePerGas` — the tip to the block producer;
 *   - `maxFeePerGas` — the absolute cap, which must cover the base fee plus the
 *     tip once the block is mined.
 *
 * We estimate both from live RPC rather than guessing:
 *   - the tip comes from `eth_maxPriorityFeePerGas` (the network's own
 *     suggestion), with a floor so a zero-fee recommendation still confirms;
 *   - the base fee comes from the latest block header's `baseFeePerGas`, and the
 *     cap is set to twice that plus the tip, hedging the risk of the base fee
 *     rising between estimation and inclusion.
 *
 * Gas for the *transfer* is estimated with `eth_estimateGas` on an unsigned
 * `from`/`to`/`value` call. It is fixed at 21,000 for a plain value transfer in
 * practice, but asking the node keeps the estimate honest if the recipient is a
 * contract with non-trivial receive logic.
 */

const MIN_PRIORITY_FEE = 1_000_000_000n; // 1 gwei

export interface EvmFeeEstimate {
  /** Suggested tip to the block producer, in wei. */
  maxPriorityFeePerGas: bigint;
  /** Absolute per-gas cap, in wei. */
  maxFeePerGas: bigint;
  /** Expected total gas the transfer will consume, in units. */
  gasLimit: bigint;
  /** Total fee = gasLimit * maxFeePerGas, in wei, for display. */
  totalFeeWei: bigint;
}

export interface EvmFeeSource {
  maxPriorityFeePerGas(): Promise<bigint>;
  baseFeePerGas(): Promise<bigint>;
  estimateGas(from: string, to: string, valueWei: bigint, data?: Uint8Array): Promise<bigint>;
}

/** JSON-RPC-backed fee source. Errors are thrown up to the caller. */
export class RpcFeeSource implements EvmFeeSource {
  constructor(private rpcUrl: string) {}

  async maxPriorityFeePerGas(): Promise<bigint> {
    const raw = await this.call('eth_maxPriorityFeePerGas', []);
    return BigInt(assertHex(raw));
  }

  async baseFeePerGas(): Promise<bigint> {
    const block = await this.call('eth_getBlockByNumber', ['latest', false]);
    if (typeof block !== 'object' || block === null || !('baseFeePerGas' in block)) {
      throw new Error('Latest block has no baseFeePerGas (pre-London or bad RPC).');
    }
    return BigInt(assertHex((block as { baseFeePerGas: unknown }).baseFeePerGas));
  }

  async estimateGas(from: string, to: string, valueWei: bigint, data?: Uint8Array): Promise<bigint> {
    const params: Record<string, string> = { from, to, value: `0x${valueWei.toString(16)}` };
    if (data !== undefined && data.length > 0) {
      params.data = `0x${bytesToHex(data)}`;
    }
    const raw = await this.call('eth_estimateGas', [params]);
    return BigInt(assertHex(raw));
  }

  private async call(method: string, params: unknown[]): Promise<unknown> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
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
      throw new Error(`EVM RPC ${method} returned invalid JSON-RPC.`);
    }
    const { error, result } = data as { error?: unknown; result: unknown };
    if (error !== undefined && error !== null) {
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : JSON.stringify(error);
      throw new Error(`EVM RPC ${method} error: ${message}`);
    }
    return result;
  }
}

function assertHex(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`Expected a 0x hex quantity, got ${JSON.stringify(value)}.`);
  }
  return value;
}

/**
 * Estimates the full fee picture for a transaction, querying the live node.
 * `data` is optional and used for contract-call gas estimation.
 */
export async function estimateTransferFee(
  source: EvmFeeSource,
  from: string,
  to: string,
  valueWei: bigint,
  data?: Uint8Array,
): Promise<EvmFeeEstimate> {
  const [tip, baseFee, gasLimit] = await Promise.all([
    source.maxPriorityFeePerGas(),
    source.baseFeePerGas(),
    source.estimateGas(from, to, valueWei, data),
  ]);

  const maxPriorityFeePerGas = tip < MIN_PRIORITY_FEE ? MIN_PRIORITY_FEE : tip;
  // 2x the base fee plus the tip gives headroom against a rising base fee.
  const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas;

  return {
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasLimit,
    totalFeeWei: gasLimit * maxFeePerGas,
  };
}

export { EVM_CHAIN_ID };
