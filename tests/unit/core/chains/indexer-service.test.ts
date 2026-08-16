import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStorageDatabase, resetConnectionForTests } from '@/core/vault/storage';
import {
  fetchTransactionHistory,
  fetchTransactionHistoryCached,
  type IndexerTx,
} from '@/core/chains/indexer-service';

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

function mockFetchOk(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ transactions: TXS, nextCursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

function mockFetchFail(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('network down');
    }),
  );
}

beforeEach(() => {
  resetConnectionForTests();
  indexedDB.deleteDatabase('veilpay');
  vi.stubEnv('VITE_INDEXER_URL', 'http://indexer.test');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('indexer-service cache policy', () => {
  it('persists validated transactions through the repository on a remote fetch', async () => {
    mockFetchOk();
    const result = await fetchTransactionHistory('evm', ADDR, 5);
    expect(result.transactions).toHaveLength(1);

    const db = await openStorageDatabase();
    const records = await db.getAll('transactions');
    db.close();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ hash: '0xabc', chain: 'evm', status: 'confirmed' });
  });

  it('falls back to the repository cache when the backend is unreachable', async () => {
    // Prime the cache with a successful remote fetch, then take the backend down.
    mockFetchOk();
    await fetchTransactionHistory('evm', ADDR, 5);
    vi.unstubAllGlobals();

    mockFetchFail();
    const cached = await fetchTransactionHistoryCached('evm', ADDR, 5);
    expect(cached.source).toBe('cache');
    expect(cached.transactions[0]?.hash).toBe('0xabc');
  });

  it('remote results win over the cache once the backend returns', async () => {
    mockFetchOk();
    await fetchTransactionHistory('evm', ADDR, 5);

    vi.unstubAllGlobals();
    mockFetchOk(); // backend is back
    const result = await fetchTransactionHistoryCached('evm', ADDR, 5);
    expect(result.source).toBe('remote');
    expect(result.transactions).toHaveLength(1);
  });

  it('treats a healthy-but-empty backend as authoritative remote, not cache', async () => {
    // Prime the cache first so the assertion is meaningful: even with valid
    // cache rows, a backend that answers with zero transactions must win.
    mockFetchOk();
    await fetchTransactionHistory('evm', ADDR, 5);
    vi.unstubAllGlobals();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ transactions: [], nextCursor: null }), { status: 200 }),
      ),
    );
    const result = await fetchTransactionHistoryCached('evm', ADDR, 5);
    expect(result.transactions).toHaveLength(0);
    expect(result.source).toBe('remote');
  });
});