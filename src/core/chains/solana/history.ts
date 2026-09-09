/**
 * Solana devnet transaction-history fetcher.
 *
 * Reads an address's recent signatures from the Solana JSON-RPC and normalizes
 * them into the `IndexerTx`-compatible `SolanaHistoryTx` shape used by the
 * wallet's transaction dashboard. Kept lightweight: signature + slot +
 * blockTime are available directly from `getSignaturesForAddress` without a
 * per-transaction decode, so amount/fee/to are left empty (informational).
 *
 * Testnet-only (matches the extension's scope). Fetches directly over JSON-RPC;
 * the extension holds host permission for api.devnet.solana.com.
 */

/** A single normalized Solana history entry. */
export interface SolanaHistoryTx {
  /** Transaction signature. */
  hash: string;
  chain: 'solana';
  /** Slot number, or 0 if unknown. */
  block: number;
  /** ISO-8601 timestamp (from blockTime), or '' if unknown. */
  timestamp: string;
  /** Sender address (the account queried). */
  from: string;
  /** Recipient address (best known; '' when not decoded). */
  to: string;
  /** Native amount in lamports as a decimal string ('' when unknown). */
  amount: string;
  /** Fee in lamports as a decimal string ('' when unknown). */
  fee: string;
  status: 'confirmed' | 'pending' | 'failed';
}

export interface SolanaHistory {
  transactions: SolanaHistoryTx[];
  nextCursor: string | null;
}

/** Official Solana devnet RPC endpoint. */
const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';

/**
 * Fetches and normalizes an address's recent signatures from Solana.
 *
 * @param address - Solana address whose history to fetch.
 * @param limit - Max signatures to return.
 * @param before - Optional signature cursor (passed through to the RPC).
 * @param rpcUrl - Optional RPC override (defaults to devnet).
 * @returns Normalized history plus the last signature as the next cursor.
 */
export async function fetchSolanaHistory(
  address: string,
  limit?: number,
  before?: string,
  rpcUrl?: string,
): Promise<SolanaHistory> {
  const url = rpcUrl ?? DEFAULT_RPC_URL;

  const params: unknown[] = [
    address,
    {
      ...(limit !== undefined && limit > 0 ? { limit } : {}),
      ...(before !== undefined && before.length > 0 ? { before } : {}),
    },
  ];
  const records = (await rpcCall(url, 'getSignaturesForAddress', params)) as unknown;

  if (records === null || records === undefined) {
    return { transactions: [], nextCursor: null };
  }
  if (!Array.isArray(records)) {
    throw new Error(`Solana getSignaturesForAddress returned a non-array: ${JSON.stringify(records)}`);
  }

  const rows = records as SolanaSignature[];
  const transactions = rows
    .filter((r) => r && typeof r.signature === 'string')
    .map((r) => normalizeSignature(r, address));

  const last = transactions[transactions.length - 1];
  return { transactions, nextCursor: last?.hash ?? null };
}

interface SolanaSignature {
  signature: string;
  slot: number | null;
  blockTime: number | null;
  err: unknown;
  memo?: unknown;
  confirmationStatus?: string | null;
}

function normalizeSignature(record: SolanaSignature, address: string): SolanaHistoryTx {
  const slot = typeof record.slot === 'number' ? record.slot : 0;
  const blockTime = typeof record.blockTime === 'number' ? record.blockTime : null;
  const status = record.err != null ? 'failed' : 'confirmed';

  return {
    hash: record.signature,
    chain: 'solana',
    block: slot,
    timestamp: blockTime !== null ? new Date(blockTime * 1000).toISOString() : '',
    from: address,
    to: '',
    amount: '',
    fee: '',
    status,
  };
}

/** Minimal JSON-RPC POST over fetch, mirroring the SolanaService pattern. */
async function rpcCall(url: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
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
