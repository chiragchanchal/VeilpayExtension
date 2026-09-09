/**
 * Transaction-history service.
 *
 * Fetches an account's recent transactions from the chain itself (Stellar
 * Horizon, Solana devnet RPC, EVM testnet RPC) and normalizes them into a
 * uniform `IndexerTx` shape for the wallet UI. This replaced the earlier
 * Veilpay-backend indexer, whose URL (`/api/v1/indexer/tx`) is not served by
 * the available backend; the chains expose the same history directly and the
 * extension already holds host permission for their testnet endpoints.
 *
 * Testnet-only (matches the extension's scope).
 */

import type { ChainId } from '@/core/messaging/protocol';
import { fetchStellarHistory } from '@/core/chains/stellar/history';
import { fetchSolanaHistory } from '@/core/chains/solana/history';
import { fetchEvmHistory } from '@/core/chains/evm/history';
import { putTransaction, listTransactionsByAddress } from '@/core/vault/repositories/transactions';
import type { TransactionRecord } from '@/core/vault/storage-types';

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

/**
 * Fetches transaction history for a given address on a given chain, straight
 * from the chain's own API.
 *
 * @param chain - Chain identifier.
 * @param address - Wallet address for the chain.
 * @param limit - Maximum number of transactions to return (default 20).
 * @param before - Cursor for pagination (from a previous response's `nextCursor`).
 * @returns Transaction history.
 */
export async function fetchTransactionHistory(
  chain: ChainId,
  address: string,
  limit = 20,
  before?: string,
): Promise<IndexerHistory> {
  switch (chain) {
    case 'stellar':
      return fetchStellarHistory(address, limit, before);
    case 'solana':
      return fetchSolanaHistory(address, limit, before);
    case 'evm':
      return fetchEvmHistory(address, limit);
    default: {
      const exhaustive: never = chain;
      throw new Error(`Unknown chain for history: ${String(exhaustive)}`);
    }
  }
}

/**
 * Distinguishes "authoritative empty" from "chain unreachable".
 *
 * Cache policy this module owns: a non-empty direct answer is authoritative.
 * An unreachable/errored chain falls back to the validated local cache; a
 * healthy chain that returns zero transactions is also authoritative and must
 * NOT be masked by stale cache rows.
 */
export async function fetchTransactionHistoryCached(
  chain: ChainId,
  address: string,
  limit = 20,
): Promise<IndexerHistory & { source: 'remote' | 'cache' }> {
  try {
    const history = await fetchTransactionHistory(chain, address, limit);
    // Persist validated rows through the repository. Direct answers are
    // authoritative and always win; the cache is only a fallback.
    await persistTransactions(chain, address, history.transactions).catch(() => undefined);
    return { ...history, source: 'remote' };
  } catch {
    // Chain unreachable: read validated rows from the repository as a fallback.
  }

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
