import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEvmService, createSolanaService, createStellarService } from '@/core/chains';

describe('Chain Services', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('EVM Service', () => {
    it('gets balance via eth_getBalance', async () => {
      const service = createEvmService('http://localhost:8545');

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: '0x0de0b6b3a7640000',
          id: 1,
        }),
      });

      const balance = await service.getBalance('0x1234567890123456789012345678901234567890');

      expect(balance).toBe(BigInt('0x0de0b6b3a7640000'));
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('eth_getBalance'),
      });
    });

    it('estimates gas via eth_estimateGas', async () => {
      const service = createEvmService();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: '0x5208',
          id: 1,
        }),
      });

      const gas = await service.estimateGas({ to: '0x456', value: '0x100' });

      expect(gas).toBe(BigInt('0x5208'));
    });

    it('sends a transaction via eth_sendRawTransaction', async () => {
      const service = createEvmService();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: '0xabcdef1234567890',
          id: 1,
        }),
      });

      const txHash = await service.sendTransaction('0x02f86...');

      expect(txHash).toBe('0xabcdef1234567890');
    });

    it('propagates JSON-RPC errors', async () => {
      const service = createEvmService();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request' },
          id: 1,
        }),
      });

      await expect(service.getBalance('0x123')).rejects.toThrow(/Invalid Request/);
    });

    it('propagates HTTP errors', async () => {
      const service = createEvmService();

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(service.getBalance('0x123')).rejects.toThrow(/HTTP 500/);
    });
  });

  describe('Solana Service', () => {
    it('gets balance via getBalance RPC', async () => {
      const service = createSolanaService();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: { value: 5000000000 },
          id: 1,
        }),
      });

      const balance = await service.getBalance(
        'So11111111111111111111111111111111111111112',
      );

      expect(balance).toBe(BigInt(5000000000));
    });

    it('estimates gas as a fixed fee', async () => {
      const service = createSolanaService();

      const gas = await service.estimateGas({});

      expect(gas).toBe(BigInt(5000));
    });

    it('sends a transaction via sendTransaction RPC', async () => {
      const service = createSolanaService();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: 'tx_signature_base58',
          id: 1,
        }),
      });

      const signature = await service.sendTransaction('base64encodedtx');

      expect(signature).toBe('tx_signature_base58');
    });

    it('gets sequence number via getAccountInfo RPC', async () => {
      const service = createSolanaService();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            value: {
              lamports: 1000000,
              owner: 'TokenkegQfeZyiNwAJsyFbPVwwQQfHub6PuCvjLjsm6',
            },
          },
          id: 1,
        }),
      });

      const seq = await service.getSequence('Some11111111111111111111111111111111111112');

      // Solana doesn't have a sequence number; we return 0 as a placeholder.
      expect(seq).toBe(BigInt(0));
    });
  });

  describe('Stellar Service', () => {
    it('gets balance from Horizon /accounts', async () => {
      const service = createStellarService();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'GDZST3XVCDTUJ76ZAV2HA72KYQJPOTPXP4NO5WYOXQJ5FNJR7G64AAAA',
          account_id: 'GDZST3XVCDTUJ76ZAV2HA72KYQJPOTPXP4NO5WYOXQJ5FNJR7G64AAAA',
          balances: [
            {
              balance: '50.0000000',
              asset_type: 'native',
            },
          ],
          sequence: '123',
        }),
      });

      const balance = await service.getBalance('GDZST3XVCDTUJ76ZAV2HA72KYQJPOTPXP4NO5WYOXQJ5FNJR7G64AAAA');

      // 50 XLM = 500000000 stroops
      expect(balance).toBe(BigInt(500000000));
    });

    it('estimates gas as 100 stroops', async () => {
      const service = createStellarService();

      const gas = await service.estimateGas({});

      expect(gas).toBe(BigInt(100));
    });

    it('sends a transaction via Horizon /transactions POST', async () => {
      const service = createStellarService();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hash: 'abc123...',
          ledger: 100,
        }),
      });

      const txHash = await service.sendTransaction('xdr_base64_string');

      expect(txHash).toBe('abc123...');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/transactions'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('gets sequence number from Horizon /accounts', async () => {
      const service = createStellarService();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'GDZST3XVCDTUJ76ZAV2HA72KYQJPOTPXP4NO5WYOXQJ5FNJR7G64AAAA',
          sequence: '456',
        }),
      });

      const seq = await service.getSequence('GDZST3XVCDTUJ76ZAV2HA72KYQJPOTPXP4NO5WYOXQJ5FNJR7G64AAAA');

      expect(seq).toBe(BigInt(456));
    });

    it('treats a 404 (never-funded account) as a zero balance', async () => {
      const service = createStellarService();

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Horizon returns 404 for addresses that have never been funded — that is
      // a fresh account (0 balance / no sequence), not an error.
      expect(await service.getBalance('GDZST3XVCDTUJ76ZAV2HA72KYQJPOTPXP4NO5WYOXQJ5FNJR7G64AAAA')).toBe(0n);
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });
      expect(await service.getSequence('GDZST3XVCDTUJ76ZAV2HA72KYQJPOTPXP4NO5WYOXQJ5FNJR7G64AAAA')).toBe(0n);
    });

    it('propagates non-404 Horizon HTTP errors', async () => {
      const service = createStellarService();

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(service.getBalance('GDZST3XVCDTUJ76ZAV2HA72KYQJPOTPXP4NO5WYOXQJ5FNJR7G64AAAA')).rejects.toThrow(
        /HTTP 500/,
      );
    });

    it('reports an unfunded account as not funded (isFunded=false)', async () => {
      const service = createStellarService();
      const funded = service.isFunded as ((a: string) => Promise<boolean>) | undefined;
      expect(funded).toBeTypeOf('function');
      const isFunded = (funded as (a: string) => Promise<boolean>).bind(service);

      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
      expect(await isFunded('GDZST3XVCDTUJ76ZAV2HA72KYQJPOTPXP4NO5WYOXQJ5FNJR7G64AAAA')).toBe(false);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balances: [], sequence: '456' }),
      });
      expect(await isFunded('GDZST3XVCDTUJ76ZAV2HA72KYQJPOTPXP4NO5WYOXQJ5FNJR7G64AAAA')).toBe(true);
    });

    it('surfaces Horizon transaction rejection detail (not just the HTTP code)', async () => {
      const service = createStellarService();

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ detail: 'tx_bad_seq: bad sequence', title: 'Transaction Failed' }),
      });

      await expect(service.sendTransaction('xdr_base64_string')).rejects.toThrow(/tx_bad_seq/);
    });
  });

  describe('cross-chain interface', () => {
    it('all services expose the chain property', () => {
      const evm = createEvmService();
      const solana = createSolanaService();
      const stellar = createStellarService();

      expect(evm.chain).toBe('evm');
      expect(solana.chain).toBe('solana');
      expect(stellar.chain).toBe('stellar');
    });

    it('all services support getBalance', async () => {
      const services = [createEvmService(), createSolanaService(), createStellarService()];

      for (const service of services) {
        expect(typeof service.getBalance).toBe('function');
      }
    });
  });
});
