/**
 * Transient VAP grant-request approvals.
 *
 * Mirrors `x402-approval.ts`: the background parks a page's `requestGrant` in
 * `chrome.storage.session` (auto-clears on browser restart; never a durable
 * grant), opens the popup, and waits for the user to approve or deny. On
 * approve, the awaiting handler creates the grant; on deny it throws
 * USER_REJECTED.
 */
import { registerLockListener } from '@/core/vault/lock-hooks';
import type { GrantCaps } from '@/core/vap/grant';

const STORAGE_KEY = 'veilpay:pendingGrantRequest';

export interface PendingGrantRecord {
  id: string;
  origin: string;
  requestedCaps: GrantCaps;
  /** How long the grant should last, in seconds. Capped by the handler. */
  expiresInSeconds: number;
  createdAt: number;
}

export async function setPendingGrantRequest(record: PendingGrantRecord): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: record });
}

export async function getPendingGrantRequest(): Promise<PendingGrantRecord | null> {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  const value = data[STORAGE_KEY];
  return isPendingGrantRecord(value) ? value : null;
}

export async function clearPendingGrantRequest(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEY);
}

function isPendingGrantRecord(value: unknown): value is PendingGrantRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.origin === 'string' &&
    typeof record.createdAt === 'number' &&
    typeof record.expiresInSeconds === 'number' &&
    typeof record.requestedCaps === 'object' &&
    record.requestedCaps !== null
  );
}

export type GrantApprovalAction = 'approve' | 'deny';

interface Waiter {
  resolve: (action: GrantApprovalAction) => void;
  reject: (cause: Error) => void;
}

const waiters = new Map<string, Waiter>();
export const GRANT_APPROVAL_TIMEOUT_MS = 5 * 60_000;

export function waitForGrantApproval(
  id: string,
  timeoutMs = GRANT_APPROVAL_TIMEOUT_MS,
): Promise<GrantApprovalAction> {
  return new Promise<GrantApprovalAction>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      void clearPendingGrantRequest();
      reject(
        new GrantApprovalTimeoutError(
          `The grant request timed out after ${Math.round(timeoutMs / 60_000)} minutes.`,
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

export function resolveGrantApproval(id: string, action: GrantApprovalAction): boolean {
  const waiter = waiters.get(id);
  if (waiter === undefined) return false;
  waiter.resolve(action);
  return true;
}

export function rejectGrantApproval(id: string, cause: Error): boolean {
  const waiter = waiters.get(id);
  if (waiter === undefined) return false;
  waiter.reject(cause);
  return true;
}

/** Cancel every in-flight grant request when the vault locks. */
export function cancelAllGrantApprovals(
  cause = new GrantVaultLockedApprovalError(),
): void {
  for (const waiter of waiters.values()) waiter.reject(cause);
  waiters.clear();
  void clearPendingGrantRequest();
}

registerLockListener(() => cancelAllGrantApprovals());

export class GrantApprovalTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GrantApprovalTimeoutError';
  }
}

export class GrantVaultLockedApprovalError extends Error {
  constructor() {
    super('The wallet was locked before the grant request was approved.');
    this.name = 'GrantVaultLockedApprovalError';
  }
}
