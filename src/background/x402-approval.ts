/**
 * Transient x402 payment approval requests.
 *
 * Mirrors `transaction-approval.ts`: the background parks a payment request in
 * `chrome.storage.session` (auto-clears on browser restart; never a durable
 * grant), opens the popup, and waits for the user to approve or deny. On
 * approve, the awaiting handler signs the payment payload; on deny it throws
 * USER_REJECTED.
 */
import { registerLockListener } from '@/core/vault/lock-hooks';
import type { X402Challenge } from '@/core/x402/types';

const STORAGE_KEY = 'veilpay:pendingX402Payment';

export interface X402PendingRecord {
  id: string;
  kind: 'x402.pay';
  origin: string;
  challenge: X402Challenge;
  createdAt: number;
}

export async function setPendingX402Payment(record: X402PendingRecord): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: record });
}

export async function getPendingX402Payment(): Promise<X402PendingRecord | null> {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  const value = data[STORAGE_KEY];
  return isX402PendingRecord(value) ? value : null;
}

export async function clearPendingX402Payment(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEY);
}

function isX402PendingRecord(value: unknown): value is X402PendingRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    record.kind === 'x402.pay' &&
    typeof record.origin === 'string' &&
    typeof record.createdAt === 'number' &&
    typeof record.challenge === 'object' &&
    record.challenge !== null
  );
}

export type X402ApprovalAction = 'approve' | 'deny';

interface Waiter {
  resolve: (action: X402ApprovalAction) => void;
  reject: (cause: Error) => void;
}

const waiters = new Map<string, Waiter>();
export const X402_APPROVAL_TIMEOUT_MS = 5 * 60_000;

export function waitForX402Approval(
  id: string,
  timeoutMs = X402_APPROVAL_TIMEOUT_MS,
): Promise<X402ApprovalAction> {
  return new Promise<X402ApprovalAction>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      void clearPendingX402Payment();
      reject(
        new X402ApprovalTimeoutError(
          `The payment request timed out after ${Math.round(timeoutMs / 60_000)} minutes.`,
        ),
      );
    }, timeoutMs);

    waiters.set(id, {
      resolve: (action) => {
        clearTimeout(timer);
        waiters.delete(id);
        resolve(action);
      },
      reject: (cause) => {
        clearTimeout(timer);
        waiters.delete(id);
        reject(cause);
      },
    });
  });
}

export function resolveX402Approval(id: string, action: X402ApprovalAction): boolean {
  const waiter = waiters.get(id);
  if (waiter === undefined) return false;
  waiter.resolve(action);
  return true;
}

export function rejectX402Approval(id: string, cause: Error): boolean {
  const waiter = waiters.get(id);
  if (waiter === undefined) return false;
  waiter.reject(cause);
  return true;
}

/** Cancel every in-flight x402 payment when the vault locks. */
export function cancelAllX402Approvals(
  cause = new X402VaultLockedApprovalError(),
): void {
  for (const waiter of waiters.values()) waiter.reject(cause);
  waiters.clear();
  void clearPendingX402Payment();
}

registerLockListener(() => cancelAllX402Approvals());

export class X402ApprovalTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'X402ApprovalTimeoutError';
  }
}

export class X402VaultLockedApprovalError extends Error {
  constructor() {
    super('The wallet was locked before the payment was approved.');
    this.name = 'X402VaultLockedApprovalError';
  }
}
