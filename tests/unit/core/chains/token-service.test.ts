import { describe, expect, it, vi, afterEach } from 'vitest';
import { createEvmService, createSolanaService, createStellarService } from '@/core/chains';

function stubFetch(handler: (url: string, init: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = handler(String(url), init ?? ({} as RequestInit));
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as unknown as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// A valid 6-decimals ERC20 `decimals()` result: 32-byte word for 6 (right-aligned).
function uint256Word(n: bigint): string {
  return '0x' + n.toString(16).padStart(64, '0');
}

describe('EVM ERC20 token reads', () => {
  it("decodes erc20Decimals from a decimals() eth_call", async () => {
    stubFetch(() => ({ jsonrpc: '2.0', id: 1, result: uint256Word(6n) }));
    const svc = createEvmService('http://rpc.test');
    const result = await (svc as { erc20Decimals: (c: string) => Promise<number> }).erc20Decimals('0x' + 'ab'.repeat(20));
    expect(result).toBe(6);
  });

  it('decodes erc20BalanceOf from a balanceOf() eth_call', async () => {
    stubFetch(() => ({ jsonrpc: '2.0', id: 1, result: uint256Word(123000000n) }));
    const svc = createEvmService('http://rpc.test');
    const result = await (svc as { erc20BalanceOf: (c: string, o: string) => Promise<bigint> }).erc20BalanceOf('0x' + 'cd'.repeat(20), '0x' + 'ef'.repeat(20));
    expect(result).toBe(123000000n);
  });

  it('rejects a non-numeric decimals() result', async () => {
    stubFetch(() => ({ jsonrpc: '2.0', id: 1, result: '0x' }) as unknown);
    const svc = createEvmService('http://rpc.test');
    const call = (svc as { erc20Decimals: (c: string) => Promise<number> }).erc20Decimals('0x' + 'ab'.repeat(20));
    await expect(call).rejects.toThrow();
  });
});

describe('Solana SPL mint/balance reads', () => {
  // An SPL mint account with decimals at byte 44 (0x2c) — here set to 9.
  // Build a 165-byte base64 payload where byte 44 = 9.
  function mintBase64(decimals: number): string {
    const buf = new Uint8Array(165);
    buf[44] = decimals;
    return Buffer.from(buf).toString('base64');
  }

  it('decodes mintDecimals from the byte at offset 44', async () => {
    stubFetch(() => ({
      jsonrpc: '2.0',
      id: 1,
      result: { context: {}, value: { data: [mintBase64(9), 'base64'], executable: false, owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', lamports: 1461600 } },
    }));
    const svc = createSolanaService('http://solana.test');
    const result = await (svc as { mintDecimals: (m: string) => Promise<number> }).mintDecimals('9' + 'a'.repeat(31));
    expect(result).toBe(9);
  });

  it('sums tokenBalance from getTokenAccountsByOwner amounts', async () => {
    stubFetch(() => ({
      jsonrpc: '2.0',
      id: 1,
      result: {
        context: { slot: 1 },
        value: [
          { pubkey: 'a1', account: { data: { parsed: { info: { tokenAmount: { amount: '5000000' } } } } } },
          { pubkey: 'a2', account: { data: { parsed: { info: { tokenAmount: { amount: '2500000' } } } } } },
        ],
      },
    }));
    const svc = createSolanaService('http://solana.test');
    const result = await (svc as { tokenBalance: (o: string, m: string) => Promise<bigint> }).tokenBalance('owner', 'mint');
    expect(result).toBe(7_500_000n);
  });

  it('mintDecimals throws when the account data is too short', async () => {
    stubFetch(() => ({
      jsonrpc: '2.0',
      id: 1,
      result: { value: { data: [Buffer.from('short').toString('base64'), 'base64'] } },
    }));
    const svc = createSolanaService('http://solana.test');
    await expect((svc as { mintDecimals: (m: string) => Promise<number> }).mintDecimals('mint')).rejects.toThrow();
  });
});

describe('Stellar issued-asset balance reads', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the issued-asset balance from a Horizon account', async () => {
    const accountJson = {
      balances: [
        { asset_type: 'native', balance: '1000.0000000' },
        { asset_code: 'USDC', asset_issuer: 'G' + 'B'.repeat(55), asset_type: 'credit_alphanum4', balance: '25.5000000' },
        { asset_code: 'OTHER', asset_issuer: 'G' + 'C'.repeat(55), asset_type: 'credit_alphanum4', balance: '1.0000000' },
      ],
      sequence: '1',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => accountJson,
      }) as unknown as Response),
    );
    const service = createStellarService(['http://horizon.test']);
    const result = await service.getAssetBalance!('addr', 'USDC', 'G' + 'B'.repeat(55));
    // 25.5000000 XLM-equivalent asset => 255000000 stroops (7 decimals).
    expect(result).toBe(255000000n);
  });

  it('returns 0 for an issued asset the account does not hold', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ balances: [{ asset_type: 'native', balance: '10.0000000' }], sequence: '1' }),
      }) as unknown as Response),
    );
    const service = createStellarService(['http://horizon.test']);
    const result = await service.getAssetBalance!('addr', 'USDC', 'G' + 'B'.repeat(55));
    expect(result).toBe(0n);
  });
});
