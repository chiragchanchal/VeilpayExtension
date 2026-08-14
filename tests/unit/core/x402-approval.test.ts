import { describe, expect, it } from 'vitest';
import {
  X402_APPROVAL_TIMEOUT_MS,
  cancelAllX402Approvals,
  resolveX402Approval,
  X402VaultLockedApprovalError,
  waitForX402Approval,
  type X402PendingRecord,
} from '@/background/x402-approval';

const RECORD: X402PendingRecord = {
  id: 'abc',
  kind: 'x402.pay',
  origin: 'https://service.example',
  challenge: {
    scheme: 'x402',
    amount: '1000000000000000',
    asset: 'ETH',
    chain: 'evm',
    payTo: '0x1111111111111111111111111111111111111111',
    nonce: 'nonce-1',
    expiry: 1_700_000_060_000,
    resource: '/protected',
    description: 'Access the protected endpoint',
  },
  createdAt: 1_000,
};

describe('x402-approval waiters', () => {
  it('resolves a waiter with the approved action', async () => {
    const waiter = waitForX402Approval('a1');
    expect(resolveX402Approval('a1', 'approve')).toBe(true);
    await expect(waiter).resolves.toBe('approve');
  });

  it('resolves a waiter with deny', async () => {
    const waiter = waitForX402Approval('a2');
    expect(resolveX402Approval('a2', 'deny')).toBe(true);
    await expect(waiter).resolves.toBe('deny');
  });

  it('returns false when no waiter is registered for the id', () => {
    expect(resolveX402Approval('missing', 'approve')).toBe(false);
  });

  it('rejects when the approval times out', async () => {
    const waiter = waitForX402Approval('a3', 10);
    await expect(waiter).rejects.toThrow(/timed out/i);
  });

  it('cancels all waiters with a vault-locked error', async () => {
    const first = waitForX402Approval('lock-1');
    const second = waitForX402Approval('lock-2');
    cancelAllX402Approvals();
    await expect(first).rejects.toBeInstanceOf(X402VaultLockedApprovalError);
    await expect(second).rejects.toBeInstanceOf(X402VaultLockedApprovalError);
    expect(resolveX402Approval('lock-1', 'approve')).toBe(false);
  });
});

describe('X402PendingRecord shape', () => {
  it('carries display fields and the origin for the approval UI', () => {
    expect(RECORD.kind).toBe('x402.pay');
    expect(RECORD.origin).toBe('https://service.example');
    expect(RECORD.challenge.payTo).toBe('0x1111111111111111111111111111111111111111');
    expect(X402_APPROVAL_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
