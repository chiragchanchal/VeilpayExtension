import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSolanaHistory } from '@/core/chains/solana/history';

describe('Solana history', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes confirmed signatures with blockTime into ISO timestamps', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: [
          {
            signature: 'sig1',
            slot: 42,
            blockTime: 1700000000,
            err: null,
            confirmationStatus: 'finalized',
          },
        ],
        id: 1,
      }),
    });

    const history = await fetchSolanaHistory('SoL11111111111111111111111111111111111111111', 5);
    expect(history.transactions).toHaveLength(1);
    const tx = history.transactions[0] as NonNullable<typeof history.transactions[0]>;
    expect(tx).toMatchObject({
      hash: 'sig1',
      chain: 'solana',
      block: 42,
      from: 'SoL11111111111111111111111111111111111111111',
      status: 'confirmed',
    });
    expect(tx.timestamp).toBe(new Date(1700000000 * 1000).toISOString());
    expect(history.nextCursor).toBe('sig1');

    // Called the JSON-RPC method with address + options.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.devnet.solana.com',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('getSignaturesForAddress'),
      }),
    );
  });

  it('marks failed signatures and handles empty history without erroring', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: [
          { signature: 'good', slot: 1, blockTime: null, err: null },
          { signature: 'bad', slot: 2, blockTime: null, err: { InstructionError: [0, {}] } },
        ],
        id: 1,
      }),
    });

    const history = await fetchSolanaHistory('ADDR', 5);
    expect(history.transactions.map((t) => t.status)).toEqual(['confirmed', 'failed']);
    expect(history.nextCursor).toBe('bad');
  });

  it('returns empty history for a null/empty result', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', result: [], id: 1 }),
    });
    const history = await fetchSolanaHistory('ADDR', 5);
    expect(history.transactions).toHaveLength(0);
    expect(history.nextCursor).toBeNull();
  });

  it('throws on a JSON-RPC error response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Node is behind by 229 slots' },
        id: 1,
      }),
    });
    await expect(fetchSolanaHistory('ADDR', 5)).rejects.toThrow(/Node is behind/);
  });

  it('throws on non-OK HTTP', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchSolanaHistory('ADDR', 5)).rejects.toThrow(/HTTP 503/);
  });
});
