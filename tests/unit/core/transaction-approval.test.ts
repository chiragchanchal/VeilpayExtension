import { describe, expect, it } from 'vitest';
import {
  APPROVAL_TIMEOUT_MS,
  cancelAllApprovals,
  resolveApproval,
  VaultLockedApprovalError,
  waitForApproval,
  type PendingApprovalRecord,
} from '@/background/transaction-approval';

const RECORD: PendingApprovalRecord = {
  id: 'abc',
  kind: 'tx',
  origin: 'https://dapp.example',
  address: '0x1111111111111111111111111111111111111111',
  to: '0x2222222222222222222222222222222222222222',
  value: '1000000000000000000',
  createdAt: 1_000,
};

describe('transaction-approval waiters', () => {
  it('resolves a waiter with the approved action', async () => {
    const waiter = waitForApproval('a1');
    expect(resolveApproval('a1', 'approve')).toBe(true);
    await expect(waiter).resolves.toBe('approve');
  });

  it('resolves a waiter with deny', async () => {
    const waiter = waitForApproval('a2');
    expect(resolveApproval('a2', 'deny')).toBe(true);
    await expect(waiter).resolves.toBe('deny');
  });

  it('returns false when no waiter is registered for the id', () => {
    expect(resolveApproval('missing', 'approve')).toBe(false);
  });

  it('rejects when the approval times out', async () => {
    const waiter = waitForApproval('a3', 10);
    await expect(waiter).rejects.toThrow(/timed out/i);
  });

  it('cancels all waiters with a vault-locked error', async () => {
    const first = waitForApproval('lock-1');
    const second = waitForApproval('lock-2');
    cancelAllApprovals();
    await expect(first).rejects.toBeInstanceOf(VaultLockedApprovalError);
    await expect(second).rejects.toBeInstanceOf(VaultLockedApprovalError);
    expect(resolveApproval('lock-1', 'approve')).toBe(false);
  });
});

describe('PendingApprovalRecord shape', () => {
  it('carries display fields and the origin for the approval UI', () => {
    expect(RECORD.kind).toBe('tx');
    expect(RECORD.origin).toBe('https://dapp.example');
    expect(RECORD.to).toBe('0x2222222222222222222222222222222222222222');
    expect(RECORD.value).toBe('1000000000000000000');
    expect(APPROVAL_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
