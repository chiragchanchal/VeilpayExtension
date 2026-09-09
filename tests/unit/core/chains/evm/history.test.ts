import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchEvmHistory, type EvmHistoryTx } from '@/core/chains/evm/history';

const ADDR = '0x0000000000000000000000000000000000000001';

/** A raw tx fixture. `extra` lets tests tweak fields per case. */
function rawTx(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    hash: '0xhash',
    blockNumber: '0x2',
    from: '0x0000000000000000000000000000000000000011',
    to: ADDR,
    value: '0xde0b6b3a7640000', // 10^18 wei = 1 ETH
    gasPrice: '0x2a', // 42
    gas: '0x5208', // 21000
    ...overrides,
  };
}

/** Registries of blocks keyed by hex block number. */
type BlockMap = Record<string, unknown>;

/**
 * Builds a global fetch mock that dispatches on the JSON-RPC method/params so
 * tests can serve `eth_blockNumber` plus per-block `eth_getBlockByNumber`.
 */
function mockRpc(latest: string, blocks: BlockMap): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: unknown[];
      };
      let result: unknown;
      if (body.method === 'eth_blockNumber') {
        result = latest;
      } else if (body.method === 'eth_getBlockByNumber') {
        const blockKey = String(body.params[0]);
        result = blocks[blockKey] ?? { transactions: [] };
      } else {
        throw new Error(`Unexpected RPC method: ${body.method}`);
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

const EMPTY_BLOCK = (num: string) => ({ number: num, timestamp: '0x5f5e100', transactions: [] });

describe('fetchEvmHistory', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns normalized txs where the address is `to` and `from`', async () => {
    const txTo = rawTx({
      hash: '0xaaaa',
      from: '0x0000000000000000000000000000000000000011',
      to: ADDR,
      value: '0xde0b6b3a7640000', // 1 ETH
    });
    const txFrom = rawTx({
      hash: '0xbbbb',
      from: ADDR,
      to: '0x0000000000000000000000000000000000000022',
      value: '0x1', // 1 wei
    });
    mockRpc('0x2', {
      '0x2': { number: '0x2', timestamp: '0x5f5e100', transactions: [txTo, txFrom] },
      '0x1': EMPTY_BLOCK('0x1'),
      '0x0': EMPTY_BLOCK('0x0'),
    });

    const result = await fetchEvmHistory(ADDR, 10);

    expect(result.transactions).toHaveLength(2);
    expect(result.nextCursor).toBeNull();

    const first = result.transactions[0] as EvmHistoryTx;
    expect(first).toMatchObject({
      hash: '0xaaaa',
      chain: 'evm',
      block: 2,
      from: '0x0000000000000000000000000000000000000011',
      to: ADDR,
      amount: '1000000000000000000',
      status: 'confirmed',
    });
    // fee = gasPrice(42) * gas(21000) = 882000
    expect(first.fee).toBe('882000');
    // hex-seconds → ISO-8601
    expect(first.timestamp).toBe(new Date(100_000_000_000).toISOString());

    const second = result.transactions[1] as EvmHistoryTx;
    expect(second).toMatchObject({
      hash: '0xbbbb',
      block: 2,
      from: ADDR,
      to: '0x0000000000000000000000000000000000000022',
      amount: '1',
    });
  });

  it('filters out txs not involving the address', async () => {
    const involved = rawTx({ hash: '0xaaaa' });
    const unrelated1 = rawTx({
      hash: '0x1111',
      from: '0x0000000000000000000000000000000000000033',
      to: '0x0000000000000000000000000000000000000044',
    });
    const unrelated2 = rawTx({
      hash: '0x2222',
      from: '0x0000000000000000000000000000000000000055',
      to: '0x0000000000000000000000000000000000000066',
    });
    mockRpc('0x0', {
      '0x0': { number: '0x0', timestamp: '0x5f5e100', transactions: [involved, unrelated1, unrelated2] },
    });

    const result = await fetchEvmHistory(ADDR, 10);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.hash).toBe('0xaaaa');
  });

  it('throws on a JSON-RPC error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32000, message: 'method not found' },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(fetchEvmHistory(ADDR)).rejects.toThrow(/RPC|method/i);
  });

  it('returns an empty list (no throw) when no matching txs exist', async () => {
    const unrelated = rawTx({
      hash: '0x9999',
      from: '0x0000000000000000000000000000000000000077',
      to: '0x0000000000000000000000000000000000000088',
    });
    mockRpc('0x0', {
      '0x0': { number: '0x0', timestamp: '0x5f5e100', transactions: [unrelated] },
    });

    const result = await fetchEvmHistory(ADDR, 10);

    expect(result.transactions).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});
