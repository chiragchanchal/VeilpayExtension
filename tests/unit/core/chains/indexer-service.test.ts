import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStorageDatabase, resetConnectionForTests } from '@/core/vault/storage';
import { fetchTransactionHistoryCached } from '@/core/chains/indexer-service';
import type { IndexerTx } from '@/core/chains/indexer-service';

/** Mock the per-chain native fetchers; the service dispatches to them. */
const fetchEvmHistory = vi.hoisted(() => vi.fn());

vi.mock('@/core/chains/evm/history', () => ({
  fetchEvmHistory,
}));
vi.mock('@/core/chains/solana/history', () => ({ fetchSolanaHistory: vi.fn() }));
vi.mock('@/core/chains/stellar/history', () => ({ fetchStellarHistory: vi.fn() }));

const ADDR = '0x0000000000000000000000000000000000000001';

const TXS: IndexerTx[] = [
  {
    hash: '0xabc',
    chain: 'evm',
    block: 1,
    timestamp: '2026-08-16T00:00:00Z',
    from: '0x1111',
    to: ADDR,
    amount: '1000000000000000000',
    fee: '21000',
    status: 'confirmed',
  },
];

function mockEvmOk(): void {
  fetchEvmHistory.mockResolvedValue({ transactions: TXS, nextCursor: null });
}

function mockEvmFail(): void {
  fetchEvmHistory.mockRejectedValue(new Error('network down'));
}

beforeEach(() => {
  resetConnectionForTests();
  indexedDB.deleteDatabase('veilpay');
  fetchEvmHistory.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('indexer-service cache policy', () => {
  it('persists validated transactions through the repository on a direct fetch', async () => {
    mockEvmOk();
    const result = await fetchTransactionHistoryCached('evm', ADDR, 5);
    expect(result.source).toBe('remote');
    expect(result.transactions).toHaveLength(1);

    const db = await openStorageDatabase();
    const records = await db.getAll('transactions');
    db.close();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ hash: '0xabc', chain: 'evm', status: 'confirmed' });
  });

  it('falls back to the repository cache when the chain is unreachable', async () => {
    // Prime the cache with a successful direct fetch, then take the chain down.
    mockEvmOk();
    await fetchTransactionHistoryCached('evm', ADDR, 5);
    mockEvmFail();

    const cached = await fetchTransactionHistoryCached('evm', ADDR, 5);
    expect(cached.source).toBe('cache');
    expect(cached.transactions[0]?.hash).toBe('0xabc');
  });

  it('direct results win over the cache once the chain is reachable', async () => {
    mockEvmOk();
    await fetchTransactionHistoryCached('evm', ADDR, 5);

    mockEvmFail();
    await fetchTransactionHistoryCached('evm', ADDR, 5);

    mockEvmOk(); // chain is back
    const result = await fetchTransactionHistoryCached('evm', ADDR, 5);
    expect(result.source).toBe('remote');
    expect(result.transactions).toHaveLength(1);
  });

  it('treats a healthy-but-empty chain as authoritative remote, not cache', async () => {
    // Prime the cache first so the assertion is meaningful: even with valid
    // cache rows, a chain that answers with zero transactions must win.
    mockEvmOk();
    await fetchTransactionHistoryCached('evm', ADDR, 5);
    fetchEvmHistory.mockResolvedValue({ transactions: [], nextCursor: null });

    const result = await fetchTransactionHistoryCached('evm', ADDR, 5);
    expect(result.transactions).toHaveLength(0);
    expect(result.source).toBe('remote');
  });
});
