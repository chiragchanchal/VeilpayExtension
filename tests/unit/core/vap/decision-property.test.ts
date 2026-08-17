import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { requiresApproval } from '@/core/vap/decision';
import type { Grant, GrantCaps } from '@/core/vap/grant';

/**
 * Property tests on cap arithmetic (roadmap 4.4).
 *
 * `requiresApproval` is pure, so fast-check can fuzz the caps + spent window.
 * The invariants we assert:
 *   - an op at-or-under the per-op cap and under the window sum is never denied
 *     for `overPerOpCap` / `overWindowCap`;
 *   - an op strictly over a cap is never granted `auto`;
 *   - the window comparison uses the exact `spent + amount` sum (bigint, so no
 *     overflow/underflow past 2^53).
 */

const AIR = '0x1111111111111111111111111111111111111111';

function baseGrant(caps: GrantCaps, overrides: Partial<Grant> = {}): Grant {
  return {
    id: 'g',
    clientId: 'https://pay.example',
    clientLabel: 'pay.example',
    approvalMode: 'autonomous',
    caps,
    expiresAt: Number.MAX_SAFE_INTEGER,
    createdAt: 0,
    ...overrides,
  };
}

function op(amount: bigint): { type: 'x402.pay'; amount: bigint; chain: 'evm'; recipient: string } {
  return { type: 'x402.pay', amount, chain: 'evm', recipient: AIR };
}

function reasonOf(decision: ReturnType<typeof requiresApproval>): string | null {
  return decision.action === 'auto' ? null : decision.reason;
}

describe('requiresApproval cap arithmetic (fast-check)', () => {
  it('an in-cap operation is never denied for cap reasons', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 1_000_000_000_000_000_000n }),
        fc.bigInt({ min: 0n, max: 1_000_000_000_000_000_000n }),
        fc.bigInt({ min: 1n, max: 1_000_000_000_000_000_000n }),
        (perOp, spent, window) => {
          const caps: GrantCaps = {
            maxPerOperation: perOp.toString(),
            // Window cap must be ≥ per-op + spent for the in-cap property to hold.
            maxPerWindow: (perOp + spent + window).toString(),
            windowSeconds: 60,
            approvalThreshold: '0',
            allowedOps: ['x402.pay'],
            allowedChains: ['evm'],
            allowlist: [],
          };
          const decision = requiresApproval(baseGrant(caps), op(perOp), spent);
          expect(reasonOf(decision)).not.toBe('overPerOpCap');
          expect(reasonOf(decision)).not.toBe('overWindowCap');
          expect(decision.action).not.toBe('deny');
        },
      ),
      { numRuns: 250 },
    );
  });

  it('an op strictly over the per-op cap is never auto-approved', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000_000_000_000n }),
        fc.bigInt({ min: 1n, max: 1_000_000_000_000_000_000n }),
        fc.bigInt({ min: 0n, max: 1_000_000_000_000_000_000n }),
        (perOp, excess, spent) => {
          const caps: GrantCaps = {
            maxPerOperation: perOp.toString(),
            maxPerWindow: (perOp + excess + spent + 1000n).toString(),
            windowSeconds: 60,
            approvalThreshold: '0',
            allowedOps: ['x402.pay'],
            allowedChains: ['evm'],
            allowlist: [],
          };
          const decision = requiresApproval(baseGrant(caps), op(perOp + excess + 1n), spent);
          expect(decision.action).not.toBe('auto');
        },
      ),
      { numRuns: 250 },
    );
  });

  it('with an empty allowlist and threshold = per-op cap, a strictly-below op auto-approves', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 2n, max: 1_000_000_000_000_000_000n }),
        fc.bigInt({ min: 1n, max: 1_000_000_000_000_000_000n }),
        (cap, smallAmount) => {
          const amount = smallAmount % cap; // [1, cap); strictly below cap
          const caps: GrantCaps = {
            maxPerOperation: cap.toString(),
            maxPerWindow: (cap + 1n).toString(),
            windowSeconds: 60,
            // Threshold equals the per-op cap, so any amount < cap is also
            // below the threshold and clears the "must prompt" gate.
            approvalThreshold: cap.toString(),
            allowedOps: ['x402.pay'],
            allowedChains: ['evm'],
            allowlist: [],
          };
          const decision = requiresApproval(baseGrant(caps), op(amount), 0n);
          expect(decision.action).toBe('auto');
        },
      ),
      { numRuns: 250 },
    );
  });

  it('window cap bounds the exact spent+amount sum (bigint, no 2^53 drift)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000_000_000_000n }),
        fc.bigInt({ min: 0n, max: 1_000_000_000_000_000_000n }),
        (spent, amount) => {
          const caps: GrantCaps = {
            maxPerOperation: (spent + amount + 1n).toString(),
            maxPerWindow: (spent + amount + 1n).toString(),
            windowSeconds: 60,
            approvalThreshold: '0',
            allowedOps: ['x402.pay'],
            allowedChains: ['evm'],
            allowlist: [],
          };
          const decision = requiresApproval(baseGrant(caps), op(amount), spent);
          expect(reasonOf(decision)).not.toBe('overWindowCap');
        },
      ),
      { numRuns: 250 },
    );
  });
});