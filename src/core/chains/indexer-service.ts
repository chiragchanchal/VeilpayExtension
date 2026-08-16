/**
 * Indexer service — transaction history from the Veilpay backend.
 *
 * The backend indexer tracks on-chain transactions for all supported chains
 * and exposes a unified API. This service is read-only: it fetches history
 * for display in the wallet UI.
 *
 * Testnet-only (matches the extension's scope). The backend URL is configured
 * at build time; if absent, the service returns empty results.
 *
 * Response format mirrors the Veilpay backend indexer API:
 *   GET /api/v1/indexer/tx?address={address}&chain={chain}&limit={limit}&before={cursor}
 *
 * Each transaction includes a `chain` field so the UI can display them
 * uniformly without per-chain parsing.
 */

import type { ChainId } from '@/core/messaging/protocol';
import { putTransaction, listTransactionsByAddress } from '@/core/vault/repositories/transactions';
import type { TransactionRecord } from '@/core/vault/storage-types';

/**
 * Backend URL. Set at build time via `VITE_INDEXER_URL`.
 *
 * There is deliberately no localhost fallback: silently targeting a hardcoded
 * dev server would (a) leak wallet addresses to a process on the user's machine
 * and (b) mask a misconfiguration by "working" only on a developer's box. When
 * unset, the service returns empty history rather than fetching anywhere.
 *
 * Read at call time (not module load) so tests can stub the env var.
 */
function backendUrl(): string | undefined {
  return import.meta.env?.VITE_INDEXER_URL as string | undefined;
}

function baseUrl(): string {
  return backendUrl() ?? '';
}

export interface IndexerTx {
  /** Transaction hash. */
  hash: string;
  chain: ChainId;
  /** Block number or slot (0 if pending). */
  block: number;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Sender address. */
  from: string;
  /** Recipient address. */
  to: string;
  /** Native amount as a decimal string (wei / lamports / stroops). */
  amount: string;
  /** Fee as a decimal string. */
  fee: string;
  /** 'confirmed' | 'pending' | 'failed' */
  status: 'confirmed' | 'pending' | 'failed';
}

export interface IndexerHistory {
  transactions: IndexerTx[];
  /** Cursor for the next page, or null if there are no more results. */
  nextCursor: string | null;
}

const FETCH_TIMEOUT_MS = 10_000;

interface FetchOutcome {
  ok: boolean;
  history: IndexerHistory;
}

/**
 * Fetches transaction history for a given address on a given chain.
 *
 * @param chain - Chain identifier.
 * @param address - Wallet address for the chain.
 * @param limit - Maximum number of transactions to return (default 20).
 * @param before - Cursor for pagination (from a previous response's `nextCursor`).
 * @returns Transaction history, or empty array if the backend is unreachable.
 */
export async function fetchTransactionHistory(
  chain: ChainId,
  address: string,
  limit = 20,
  before?: string,
): Promise<IndexerHistory> {
  const outcome = await rawFetch(chain, address, limit, before);
  return outcome.history;
}

/**
 * Distinguishes "authoritative empty" from "backend unreachable".
 *
 * Cache policy this module owns: a non-empty remote answer is authoritative.
 * An unreachable/errored backend falls back to the validated local cache; a
 * healthy backend that returns zero transactions is also authoritative and must
 * NOT be masked by stale cache rows.
 */
export async function fetchTransactionHistoryCached(
  chain: ChainId,
  address: string,
  limit = 20,
): Promise<IndexerHistory & { source: 'remote' | 'cache' }> {
  const outcome = await rawFetch(chain, address, limit);
  if (outcome.ok) {
    return { ...outcome.history, source: 'remote' };
  }

  // Backend unreachable: read validated rows from the repository as a fallback.
  const cached = await listTransactionsByAddress(address).catch(() => []);
  const txs: IndexerTx[] = cached
    .filter((record) => record.chain === chain)
    .map((record) => ({
      hash: record.hash,
      chain: record.chain as ChainId,
      block: 0,
      timestamp: record.timestamp,
      from: record.from,
      to: record.to,
      amount: record.amount,
      fee: '',
      status: record.status,
    }))
    .slice(0, limit);
  return { transactions: txs, nextCursor: null, source: 'cache' };
}

async function rawFetch(
  chain: ChainId,
  address: string,
  limit: number,
  before?: string,
): Promise<FetchOutcome> {
  const params = new URLSearchParams({
    address,
    chain,
    limit: String(limit),
  });
  if (before !== undefined) {
    params.set('before', before);
  }

  // The backend is not configured at build time: return empty rather than
  // fetching to an unset/empty URL (which would throw and be logged as noise).
  if (baseUrl() === '') {
    return { ok: false, history: { transactions: [], nextCursor: null } };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(
      `${baseUrl()}/api/v1/indexer/tx?${params.toString()}`,
      { signal: controller.signal },
    );
    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`[veilpay] Indexer returned HTTP ${response.status} for ${chain}:${address}`);
      return { ok: false, history: { transactions: [], nextCursor: null } };
    }

    const data = (await response.json()) as unknown;
    if (typeof data !== 'object' || data === null || !('transactions' in data)) {
      return { ok: false, history: { transactions: [], nextCursor: null } };
    }

    const result = data as {
      transactions: IndexerTx[];
      nextCursor: string | null;
    };
    const transactions = Array.isArray(result.transactions) ? result.transactions : [];
    // Persist validated results through the typed repository. Remote results
    // are authoritative and always win; the cache is only a fallback.
    await persistTransactions(chain, address, transactions).catch(() => undefined);
    return {
      ok: true,
      history: {
        transactions,
        nextCursor: typeof result.nextCursor === 'string' ? result.nextCursor : null,
      },
    };
  } catch (cause) {
    // Network error or timeout — surface a warning but don't throw.
    console.warn('[veilpay] Indexer fetch failed:', cause instanceof Error ? cause.message : cause);
    return { ok: false, history: { transactions: [], nextCursor: null } };
  }
}

/** Maps indexer rows to repository records and persists them (idempotent). */
async function persistTransactions(
  chain: ChainId,
  address: string,
  txs: IndexerTx[],
): Promise<void> {
  for (const tx of txs) {
    const record: TransactionRecord = {
      id: tx.hash,
      hash: tx.hash,
      chain: tx.chain,
      address,
      from: tx.from,
      to: tx.to,
      amount: tx.amount,
      network: chain,
      status: tx.status,
      timestamp: tx.timestamp,
      type: 'indexer',
    };
    await putTransaction(record);
  }
}

/**
 * Fetches history for all of a wallet's addresses (one per chain).
 */
export async function fetchAllTransactionHistory(
  accounts: Array<{ chain: ChainId; address: string }>,
  limit = 5,
): Promise<Map<string, IndexerTx[]>> {
  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const history = await fetchTransactionHistory(acc.chain, acc.address, limit);
      return { key: `${acc.chain}:${acc.address}`, txs: history.transactions };
    }),
  );

  const map = new Map<string, IndexerTx[]>();
  for (const outcome of results) {
    if (outcome.status === 'fulfilled') {
      map.set(outcome.value.key, outcome.value.txs);
    }
  }
  return map;
}