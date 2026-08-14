import { describe, expect, it } from 'vitest';
import {
  GRANT_APPROVAL_TIMEOUT_MS,
  cancelAllGrantApprovals,
  resolveGrantApproval,
  GrantVaultLockedApprovalError,
  waitForGrantApproval,
  type PendingGrantRecord,
} from '@/background/grant-approval';

const RECORD: PendingGrantRecord = {
  id: 'abc',
  origin: 'https://service.example',
  requestedCaps: {
    maxPerOperation: '1000000000000000000',
    maxPerWindow: '5000000000000000000',
    windowSeconds: 86_400,
    approvalThreshold: '100000000000000000',
    allowedOps: ['x402.pay'],
    allowedChains: ['evm'],
    allowlist: [],
  },
  expiresInSeconds: 604_800,
  createdAt: 1_000,
};

describe('grant-approval waiters', () => {
  it('resolves a waiter with the approved action', async () => {
    const waiter = waitForGrantApproval('a1');
    expect(resolveGrantApproval('a1', 'approve')).toBe(true);
    await expect(waiter).resolves.toBe('approve');
  });

  it('resolves a waiter with deny', async () => {
    const waiter = waitForGrantApproval('a2');
    expect(resolveGrantApproval('a2', 'deny')).toBe(true);
    await expect(waiter).resolves.toBe('deny');
  });

  it('returns false when no waiter is registered for the id', () => {
    expect(resolveGrantApproval('missing', 'approve')).toBe(false);
  });

  it('rejects when the approval times out', async () => {
    const waiter = waitForGrantApproval('a3', 10);
    await expect(waiter).rejects.toThrow(/timed out/i);
  });

  it('cancels all waiters with a vault-locked error', async () => {
    const first = waitForGrantApproval('lock-1');
    const second = waitForGrantApproval('lock-2');
    cancelAllGrantApprovals();
    await expect(first).rejects.toBeInstanceOf(GrantVaultLockedApprovalError);
    await expect(second).rejects.toBeInstanceOf(GrantVaultLockedApprovalError);
    expect(resolveGrantApproval('lock-1', 'approve')).toBe(false);
  });
});

describe('PendingGrantRecord shape', () => {
  it('carries display fields and the origin for the approval UI', () => {
    expect(RECORD.origin).toBe('https://service.example');
    expect(RECORD.requestedCaps.maxPerOperation).toBe('1000000000000000000');
    expect(RECORD.expiresInSeconds).toBe(604_800);
    expect(GRANT_APPROVAL_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
