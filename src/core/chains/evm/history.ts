/**
 * EVM (Sepolia) transaction-history fetcher.
 *
 * Standalone module: fetches an address's recent transactions from a Sepolia
 * RPC and normalizes them into the wallet's canonical history shape.
 *
 * Approach (pragmatic, no block explorer dependency):
 *  - Call `eth_blockNumber` for the latest block.
 *  - Scan recent blocks backwards via `eth_getBlockByNumber` (full tx objects).
 *  - Keep txs where `from` or `to` matches the address, up to `limit`.
 *
 * `eth_getLogs` is avoided because it cannot enumerate plain value transfers.
 * Scanning blocks is O(blocks scanned) and deterministic. There is no
 * pagination for now, so `nextCursor` is always null.
 */

/** A single normalized EVM history entry. */
export interface EvmHistoryTx {
  /** 0x tx hash. */
  hash: string;
  /** Chain tag, always 'evm'. */
  chain: 'evm';
  /** Block number decimal, 0 if pending/unknown. */
  block: number;
  /** ISO-8601 timestamp, empty if unknown. */
  timestamp: string;
  /** From address (lowercase). */
  from: string;
  /** To address (lowercase), or empty for a contract creation. */
  to: string;
  /** Value in wei, as a decimal string. */
  amount: string;
  /** Fee (gasPrice * gas) in wei, as a decimal string, empty if unknown. */
  fee: string;
  /** 'confirmed' | 'pending' | 'failed' (always 'confirmed' for mined blocks). */
  status: 'confirmed' | 'pending' | 'failed';
}

/** The fetched history for an address. */
export interface EvmHistory {
  transactions: EvmHistoryTx[];
  /** No cursor-based pagination for this approach; always null. */
  nextCursor: string | null;
}

/** Public Sepolia RPC fallbacks, mirroring EvmService.ENDPOINTS. */
const ENDPOINTS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://sepolia.gateway.tenderly.co',
  'https://1rpc.io/sepolia',
];

/**
 * One JSON-RPC call across the fallback endpoints, in the same style as
 * `EvmService.call`: POST jsonrpc 2.0 id 1, throw on non-OK, throw on an RPC
 * `error` field, else return `result`. If every endpoint fails, the last error
 * bubbles up as a throw.
 */
async function callRpc(
  endpoints: string[],
  method: string,
  params: unknown[],
): Promise<unknown> {
  let lastError: Error | null = null;
  for (const url of endpoints) {
    if (url === undefined || url.length === 0) continue;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });

      if (!response.ok) {
        throw new Error(`EVM RPC ${method} failed: HTTP ${response.status}`);
      }

      const data = (await response.json()) as unknown;
      if (typeof data !== 'object' || data === null) {
        throw new Error(`EVM RPC ${method} returned a non-object response.`);
      }

      // RPC error responses are valid JSON-RPC even without `result`.
      const err = (data as { error?: unknown }).error;
      if (err !== undefined && err !== null) {
        const message =
          typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err);
        throw new Error(`EVM RPC ${method} error: ${message}`);
      }

      if (!('result' in data)) {
        throw new Error(`EVM RPC ${method} returned no result.`);
      }

      return (data as { result: unknown }).result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Try the next endpoint.
    }
  }
  throw lastError ?? new Error(`EVM RPC ${method} failed on all endpoints.`);
}

/** A block returned by `eth_getBlockByNumber` with full tx objects. */
interface BlockWithTxs {
  number?: unknown;
  timestamp?: unknown;
  transactions?: unknown;
}

/** A raw transaction object inside a full-tx block. */
interface RawTx {
  hash?: unknown;
  blockNumber?: unknown;
  from?: unknown;
  to?: unknown;
  value?: unknown;
  gasPrice?: unknown;
  gas?: unknown;
}

/** Whether the raw object looks like a block we can read txs from. */
function isValidBlock(raw: unknown): raw is BlockWithTxs {
  return typeof raw === 'object' && raw !== null && 'transactions' in raw;
}

/** ISO-8601 timestamp from a block's hex-seconds `timestamp`, or empty if unknown. */
function blockTimestamp(block: BlockWithTxs): string {
  const ts = block.timestamp;
  if (typeof ts !== 'string') return '';
  try {
    const seconds = BigInt(ts);
    return new Date(Number(seconds * 1000n)).toISOString();
  } catch {
    return '';
  }
}

/** Whether a raw tx involves `addr` (as from or to), comparing lowercase. */
function transactionInvolves(tx: unknown, addr: string): boolean {
  if (typeof tx !== 'object' || tx === null) return false;
  const t = tx as RawTx;
  const from = typeof t.from === 'string' ? t.from.toLowerCase() : '';
  const to = typeof t.to === 'string' && t.to !== '' ? t.to.toLowerCase() : '';
  return from === addr || to === addr;
}

/** Normalizes a raw tx object into EvmHistoryTx. */
function mapTx(tx: unknown, timestamp: string): EvmHistoryTx {
  const t = tx as RawTx;

  const hash = typeof t.hash === 'string' ? t.hash : '';

  let block = 0;
  if (typeof t.blockNumber === 'string') {
    try {
      const parsed = Number.parseInt(t.blockNumber, 16);
      block = Number.isNaN(parsed) ? 0 : parsed;
    } catch {
      block = 0;
    }
  }

  const from = typeof t.from === 'string' ? t.from.toLowerCase() : '';
  const to =
    typeof t.to === 'string' && t.to !== '' ? t.to.toLowerCase() : '';

  let amount = '0';
  if (typeof t.value === 'string') {
    try {
      amount = BigInt(t.value).toString();
    } catch {
      amount = '0';
    }
  }

  let fee = '';
  if (typeof t.gasPrice === 'string' && typeof t.gas === 'string') {
    try {
      fee = (BigInt(t.gasPrice) * BigInt(t.gas)).toString();
    } catch {
      fee = '';
    }
  }

  return {
    hash,
    chain: 'evm',
    block,
    timestamp,
    from,
    to,
    amount,
    fee,
    status: 'confirmed',
  };
}

/**
 * Fetches the recent transaction history for an EVM address from Sepolia.
 *
 * Scans at most `limit` recent blocks (starting from the latest) and returns
 * at most `limit` transactions involving the address (as `from` or `to`), most
 * recent first. If none are found, returns an empty list rather than throwing.
 *
 * Throws if `eth_blockNumber` (or every block read) fails - network down, or
 * a JSON-RPC error from the node.
 */
export async function fetchEvmHistory(
  address: string,
  limit = 20,
): Promise<EvmHistory> {
  const addr = address.toLowerCase();

  const latestResult = await callRpc(ENDPOINTS, 'eth_blockNumber', []);
  if (typeof latestResult !== 'string') {
    throw new Error(`eth_blockNumber returned non-string: ${typeof latestResult}`);
  }

  let latest = 0;
  try {
    const parsed = Number.parseInt(latestResult, 16);
    latest = Number.isNaN(parsed) ? 0 : parsed;
  } catch {
    latest = 0;
  }

  const transactions: EvmHistoryTx[] = [];
  const take = Math.max(0, limit);
  const scan = Math.min(take, latest + 1);

  for (let i = 0; i < scan && transactions.length < take; i += 1) {
    const blockNumber = latest - i;
    const hex = `0x${blockNumber.toString(16)}`;
    const rawBlock = await callRpc(ENDPOINTS, 'eth_getBlockByNumber', [hex, true]);

    // Invalid block shape: treat as empty/skip.
    if (!isValidBlock(rawBlock)) continue;

    const timestamp = blockTimestamp(rawBlock);
    const rawTxs = rawBlock.transactions;
    if (!Array.isArray(rawTxs)) continue;

    for (const tx of rawTxs) {
      if (!transactionInvolves(tx, addr)) continue;
      transactions.push(mapTx(tx, timestamp));
      if (transactions.length >= take) break;
    }
  }

  return { transactions, nextCursor: null };
}
