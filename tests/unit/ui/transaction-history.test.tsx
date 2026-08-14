import { describe, expect, it } from 'vitest';
import {
  explorerUrlFor,
  transactionsToCsv,
} from '@/ui/components/TransactionHistoryView';
import type { IndexerTx } from '@/core/chains/indexer-service';

const tx = (overrides: Partial<IndexerTx> = {}): IndexerTx => ({
  hash: '0xabc',
  chain: 'evm',
  block: 1,
  timestamp: '2026-08-12T00:00:00Z',
  from: '0xfrom',
  to: '0xto',
  amount: '1000000000000000000',
  fee: '21000',
  status: 'confirmed',
  ...overrides,
});

describe('explorerUrlFor', () => {
  it('builds a Sepolia Etherscan URL for EVM transactions', () => {
    expect(explorerUrlFor('evm', '0xdeadbeef')).toBe(
      'https://sepolia.etherscan.io/tx/0xdeadbeef',
    );
  });

  it('builds a devnet Solana explorer URL', () => {
    expect(explorerUrlFor('solana', 'hash')).toBe(
      'https://explorer.solana.com/tx/hash?cluster=devnet',
    );
  });

  it('builds a Stellar expert testnet URL', () => {
    expect(explorerUrlFor('stellar', 'hash')).toBe(
      'https://stellar.expert/explorer/testnet/tx/hash',
    );
  });
});

describe('transactionsToCsv', () => {
  it('emits a header row followed by one row per transaction', () => {
    const csv = transactionsToCsv([tx(), tx({ chain: 'solana', hash: 'solhash' })]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'chain,hash,status,timestamp,block,from,to,amount,fee',
    );
    expect(lines).toHaveLength(3);
  });

  it('quotes fields that contain commas or quotes', () => {
    const csv = transactionsToCsv([
      tx({ from: 'addr,1', to: 'say "hi"' }),
    ]);
    const row = csv.split('\n')[1]!;
    expect(row).toContain('"addr,1"');
    expect(row).toContain('"say ""hi"""');
  });

  it('renders the header only for an empty list', () => {
    expect(transactionsToCsv([])).toBe(
      'chain,hash,status,timestamp,block,from,to,amount,fee',
    );
  });

  it('preserves decimal strings exactly (no float mangling)', () => {
    const csv = transactionsToCsv([tx({ amount: '123456789012345678901234567890' })]);
    expect(csv).toContain('123456789012345678901234567890');
  });
});
