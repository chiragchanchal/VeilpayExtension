import { beforeEach, describe, expect, it } from 'vitest';
import { resetConnectionForTests } from '@/core/vault/storage';
import { putTransaction, getTransaction, listTransactionsByNetwork } from '@/core/vault/repositories/transactions';
import { putSession, getSession, listSessions } from '@/core/vault/repositories/sessions';
import { putChannel, getChannel, listExpiringChannels } from '@/core/vault/repositories/x402-channels';
import { putCommitment, getCommitment } from '@/core/vault/repositories/privacy-commitments';
import { putWalletData, getWalletData } from '@/core/vault/repositories/wallet-data';
import { tail, putAuditEntry } from '@/core/vault/repositories/audit-ledger';
import type { TransactionRecord } from '@/core/vault/storage-types';

const TX: TransactionRecord = {
  id: 'tx-1',
  hash: '0xabc',
  chain: 'evm',
  address: '0x1111',
  from: '0x2222',
  to: '0x3333',
  amount: '1000000000000000000',
  network: 'sepolia',
  status: 'confirmed',
  timestamp: '2026-08-16T00:00:00Z',
  type: 'transfer',
};

beforeEach(() => {
  resetConnectionForTests();
  indexedDB.deleteDatabase('veilpay');
});

describe('transaction repository', () => {
  it('round-trips a valid transaction and indexes by network', async () => {
    await putTransaction(TX);
    expect(await getTransaction(TX.hash)).toEqual(expect.objectContaining({ hash: TX.hash }));
    const byNetwork = await listTransactionsByNetwork('sepolia');
    expect(byNetwork).toHaveLength(1);
  });

  it('rejects a malformed transaction at the boundary', async () => {
    await expect(
      putTransaction({ ...TX, amount: 'not-a-decimal' } as unknown as TransactionRecord),
    ).rejects.toThrow();
    expect(await getTransaction(TX.hash)).toBeUndefined();
  });
});

describe('session repository', () => {
  it('round-trips a session', async () => {
    await putSession({
      id: 's-1',
      sessionId: 'sess-1',
      createdAt: 1,
      lastActivityAt: 2,
      expiresAt: 3,
      userAddress: '0x1111',
    });
    expect(await getSession('sess-1')).toEqual(expect.objectContaining({ sessionId: 'sess-1' }));
    expect(await listSessions()).toHaveLength(1);
  });
});

describe('x402 channel repository', () => {
  it('lists expiring channels by upper bound', async () => {
    await putChannel({
      id: 'ch-1',
      channelId: 'chan-1',
      service: 'svc',
      limit: '100',
      spent: '10',
      expiration: 5,
      isActive: true,
    });
    expect((await listExpiringChannels(10))[0]?.channelId).toBe('chan-1');
    expect(await listExpiringChannels(0)).toHaveLength(0);
    expect(await getChannel('chan-1')).toEqual(expect.objectContaining({ isActive: true }));
  });
});

describe('privacy commitment repository', () => {
  it('round-trips a commitment', async () => {
    await putCommitment({
      id: 'c-1',
      commitmentId: 'comm-1',
      nullifier: '0xhash',
      secret: '0xhash',
      amount: '100',
      token: 'veil',
      status: 'spent',
    });
    expect(await getCommitment('comm-1')).toEqual(expect.objectContaining({ status: 'spent' }));
  });
});

describe('walletData repository', () => {
  it('round-trips opaque values', async () => {
    await putWalletData('feature:state', { nested: [1, 2, 3] });
    expect(await getWalletData('feature:state')).toEqual({ nested: [1, 2, 3] });
    expect(await getWalletData('missing')).toBeUndefined();
  });
});

describe('audit ledger repository', () => {
  it('exposes the tail and rejects duplicate sequences (append-only)', async () => {
    expect(await tail()).toBeUndefined();
    const entry = {
      id: 'a-1',
      sequence: 0,
      timestamp: 1,
      operationType: 'test',
      sanitizedPayload: { ok: true },
      previousHash: null,
      entryHash: '0xvalidhash',
    };
    await putAuditEntry(entry);
    expect(await tail()).toEqual(expect.objectContaining({ sequence: 0 }));
    await expect(putAuditEntry(entry)).rejects.toThrow(/already exists/);
  });

  it('rejects an empty entryHash', async () => {
    // The StorageSchema rejects `entryHash: ''` (min length 1) before the put.
    await expect(
      putAuditEntry({
        id: 'a-2',
        sequence: 1,
        timestamp: 1,
        operationType: 'test',
        sanitizedPayload: {},
        previousHash: null,
        entryHash: '',
      }),
    ).rejects.toThrow();
  });
});