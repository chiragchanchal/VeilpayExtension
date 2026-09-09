import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchStellarHistory } from '@/core/chains/stellar/history';

describe('fetchStellarHistory', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns normalized native payment transactions (amount to stroops)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        _embedded: {
          records: [
            {
              type: 'payment',
              asset_type: 'native',
              amount: '100.0000000',
              from: 'GABC1234FROM',
              to: 'GABC1234TO',
              transaction_hash: 'txhash1',
              created_at: '2026-09-01T12:00:00.000Z',
              ledger: 1234,
              transaction_successful: true,
              paging_token: '1234-1',
            },
          ],
        },
        _links: {
          next: { href: 'https://horizon-testnet.stellar.org/accounts/GABC1234FROM/payments?cursor=1234-1' },
        },
      }),
    });

    const result = await fetchStellarHistory('GABC1234FROM');

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      hash: 'txhash1',
      chain: 'stellar',
      block: 1234,
      timestamp: '2026-09-01T12:00:00.000Z',
      from: 'GABC1234FROM',
      to: 'GABC1234TO',
      amount: '1000000000',
      fee: '',
      status: 'confirmed',
    });
    expect(result.nextCursor).toBe(
      'https://horizon-testnet.stellar.org/accounts/GABC1234FROM/payments?cursor=1234-1',
    );
    // The request targets the payments endpoint with order=desc.
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/accounts/GABC1234FROM/payments?'));
  });

  it('returns empty history for a never-funded address (404)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await fetchStellarHistory('GNEVERFUNDED1111111111');

    expect(result).toEqual({ transactions: [], nextCursor: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on a malformed response missing _embedded.records', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ hello: 'world' }),
    });

    await expect(fetchStellarHistory('GABC1234FROM')).rejects.toThrow(
      /missing _embedded|_embedded.records/,
    );
  });

  it('marks records with transaction_successful=false as failed', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        _embedded: {
          records: [
            {
              type: 'payment',
              asset_type: 'native',
              amount: '5.0000000',
              from: 'GABC1234FROM',
              to: 'GABC1234TO',
              transaction_hash: 'txfailed1',
              created_at: '2026-09-01T13:00:00.000Z',
              ledger: 1235,
              transaction_successful: false,
              paging_token: '1235-1',
            },
          ],
        },
        _links: { next: { href: 'https://x.test/next' } },
      }),
    });

    const result = await fetchStellarHistory('GABC1234FROM');

    expect(result.transactions[0]?.status).toBe('failed');
    expect(result.transactions[0]?.amount).toBe('50000000');
  });
});
