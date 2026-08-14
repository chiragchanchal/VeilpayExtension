import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RpcService } from '@/core/chains/rpc-service';

function mockFetch(result: unknown, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn(async () =>
    new Response(JSON.stringify(result), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('RpcService (fallback + cache)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the primary endpoint and returns the result', async () => {
    const fetch = mockFetch({ jsonrpc: '2.0', id: 1, result: '0x1' });
    const rpc = new RpcService(['https://primary.example.com'], 5000, fetch);

    const result = await rpc.call('eth_blockNumber', []);

    expect(result).toBe('0x1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rotates to the fallback endpoint when the primary fails with 5xx', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Internal', code: -32603 } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x2' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const rpc = new RpcService(['https://primary.example.com', 'https://fallback.example.com'], 5000, fetch);

    const result = await rpc.call('eth_blockNumber', []);

    expect(result).toBe('0x2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries on HTTP 5xx and falls through to a working endpoint', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Server Error', code: -32603 } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0xabc' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const rpc = new RpcService(['https://primary.example.com', 'https://fallback.example.com'], 5000, fetch);

    const result = await rpc.call('eth_blockNumber', []);

    expect(result).toBe('0xabc');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('caches cacheable methods and serves from cache on subsequent calls', async () => {
    const fetch = mockFetch({ jsonrpc: '2.0', id: 1, result: '0xabc' });
    const rpc = new RpcService(['https://primary.example.com'], 5000, fetch);
    rpc.clearCache();

    const a = await rpc.call('eth_blockNumber', []);
    expect(a).toBe('0xabc');
    expect(fetch).toHaveBeenCalledTimes(1);

    const b = await rpc.call('eth_blockNumber', []);
    expect(b).toBe('0xabc');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not cache non-cacheable methods', async () => {
    const fetch = mockFetch({ jsonrpc: '2.0', id: 1, result: '0xdead' });
    const rpc = new RpcService(['https://primary.example.com'], 5000, fetch);

    await rpc.call('eth_sendRawTransaction', ['0x']);
    await rpc.call('eth_sendRawTransaction', ['0x']);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('clears the cache', async () => {
    const fetch = mockFetch({ jsonrpc: '2.0', id: 1, result: '0x1' });
    const rpc = new RpcService(['https://primary.example.com'], 5000, fetch);
    rpc.clearCache();

    await rpc.call('eth_blockNumber', []);
    rpc.clearCache();
    await rpc.call('eth_blockNumber', []);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws when all endpoints fail', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('Network error');
    });
    const rpc = new RpcService(['https://primary.example.com', 'https://fallback.example.com'], 5000, fetch);

    await expect(rpc.call('eth_blockNumber', [])).rejects.toThrow('Network error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});