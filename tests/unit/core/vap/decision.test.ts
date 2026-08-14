import { beforeEach, describe, expect, it } from 'vitest';
import { resetConnectionForTests } from '@/core/vault/storage';
import {
  loadSpendWindow,
  recordSpend,
  requiresApproval,
} from '@/core/vap/decision';
import type { Grant } from '@/core/vap/grant';

const NOW = 1_700_000_000_000;

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    id: 'grant-1',
    clientId: 'https://service.example',
    clientLabel: 'service',
    approvalMode: 'autonomous',
    caps: {
      maxPerOperation: '1000000000000000000', // 1 ETH
      maxPerWindow: '5000000000000000000', // 5 ETH
      windowSeconds: 86_400, // 24h
      approvalThreshold: '100000000000000000', // 0.1 ETH
      allowedOps: ['x402.pay'],
      allowedChains: ['evm'],
      allowlist: [],
    },
    expiresAt: NOW + 7 * 86_400_000,
    createdAt: NOW,
    ...overrides,
  };
}

function op(amount: bigint, recipient = '0x1111111111111111111111111111111111111111') {
  return { type: 'x402.pay' as const, amount, chain: 'evm' as const, recipient };
}

describe('requiresApproval', () => {
  it('auto-approves an operation under the threshold within caps', () => {
    expect(requiresApproval(grant(), op(10n ** 16n), 0n, NOW)).toEqual({ action: 'auto' });
  });

  it('denies a revoked grant', () => {
    expect(requiresApproval(grant({ revokedAt: NOW - 1000 }), op(1n), 0n, NOW)).toEqual({
      action: 'deny',
      reason: 'revoked',
    });
  });

  it('denies an expired grant', () => {
    expect(requiresApproval(grant({ expiresAt: NOW - 1000 }), op(1n), 0n, NOW)).toEqual({
      action: 'deny',
      reason: 'expired',
    });
  });

  it('denies an operation type outside the allowed set', () => {
    const g: Grant = { ...grant(), caps: { ...grant().caps, allowedOps: [] } };
    expect(requiresApproval(g, op(1n), 0n, NOW)).toEqual({
      action: 'deny',
      reason: 'opNotAllowed',
    });
  });

  it('denies an operation over the per-operation cap', () => {
    expect(requiresApproval(grant(), op(2n * 10n ** 18n), 0n, NOW)).toEqual({
      action: 'deny',
      reason: 'overPerOpCap',
    });
  });

  it('denies an operation that would exceed the window cap', () => {
    // 4.5 ETH already spent + a 0.8 ETH operation (under the 1 ETH per-op cap)
    // = 5.3 ETH > the 5 ETH window.
    expect(requiresApproval(grant(), op(8n * 10n ** 17n), 45n * 10n ** 17n, NOW)).toEqual({
      action: 'deny',
      reason: 'overWindowCap',
    });
  });

  it('requires approval when the operation meets the threshold', () => {
    // Exactly at the 0.1 ETH threshold → required, not auto.
    expect(requiresApproval(grant(), op(10n ** 17n), 0n, NOW)).toEqual({
      action: 'required',
      reason: 'threshold',
    });
  });

  it('requires approval when the recipient is not on the allowlist', () => {
    const g: Grant = { ...grant(), caps: { ...grant().caps, allowlist: ['0x2222222222222222222222222222222222222222'] } };
    expect(requiresApproval(g, op(10n ** 16n), 0n, NOW)).toEqual({
      action: 'required',
      reason: 'allowlistMiss',
    });
  });

  it('auto-approves when the recipient is on the allowlist', () => {
    const g: Grant = { ...grant(), caps: { ...grant().caps, allowlist: ['0x1111111111111111111111111111111111111111'] } };
    expect(requiresApproval(g, op(10n ** 16n), 0n, NOW)).toEqual({ action: 'auto' });
  });
});

describe('spend window', () => {
  beforeEach(async () => {
    resetConnectionForTests();
    indexedDB.deleteDatabase('veilpay');
  });

  it('starts a fresh window on first use', async () => {
    const window = await loadSpendWindow(grant(), NOW);
    expect(window.grantId).toBe('grant-1');
    expect(window.amountSpent).toBe('0');
    expect(window.windowEnd).toBe(NOW + 86_400_000);
  });

  it('records spend against the current window', async () => {
    await recordSpend(grant(), 10n ** 16n, NOW);
    const window = await loadSpendWindow(grant(), NOW);
    expect(window.amountSpent).toBe('10000000000000000');
  });

  it('resets the window once the previous window has elapsed', async () => {
    await recordSpend(grant(), 10n ** 16n, NOW);
    const later = NOW + 86_400_000 + 1;
    await recordSpend(grant(), 10n ** 15n, later);

    const window = await loadSpendWindow(grant(), later);
    expect(window.amountSpent).toBe('1000000000000000');
    expect(window.windowStart).toBe(later);
  });
});
