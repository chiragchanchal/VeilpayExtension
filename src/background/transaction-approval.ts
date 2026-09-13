/** Transient dapp transaction/signature approval requests. */
import { registerLockListener } from '@/core/vault/lock-hooks';

const STORAGE_KEY = 'veilpay:pendingApproval';

export interface PendingApprovalRecord {
  id: string;
  kind: 'tx' | 'sign';
  origin: string;
  address: string;
  to?: string;
  value?: string;
  data?: string;
  message?: string;
  /**
   * Display metadata for `value`. Agent-initiated payments are not always
   * EVM/wei, so the overlay must not assume 18 decimals and "ETH"; absent means
   * exactly that, which keeps every existing dapp path unchanged.
   */
  symbol?: string;
  decimals?: number;
  createdAt: number;
}

export async function setPendingApproval(record: PendingApprovalRecord): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: record });
}

export async function getPendingApproval(): Promise<PendingApprovalRecord | null> {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  const value = data[STORAGE_KEY];
  return isPendingApprovalRecord(value) ? value : null;
}

export async function clearPendingApproval(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEY);
}

function isPendingApprovalRecord(value: unknown): value is PendingApprovalRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    (record.kind === 'tx' || record.kind === 'sign') &&
    typeof record.origin === 'string' &&
    typeof record.address === 'string' &&
    typeof record.createdAt === 'number'
  );
}

type ApprovalAction = 'approve' | 'deny';

interface Waiter {
  resolve: (action: ApprovalAction) => void;
  reject: (cause: Error) => void;
}

const waiters = new Map<string, Waiter>();
export const APPROVAL_TIMEOUT_MS = 5 * 60_000;

export function waitForApproval(id: string, timeoutMs = APPROVAL_TIMEOUT_MS): Promise<ApprovalAction> {
  return new Promise<ApprovalAction>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      void clearPendingApproval();
      reject(new ApprovalTimeoutError(`The approval request timed out after ${Math.round(timeoutMs / 60_000)} minutes.`));
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

export function resolveApproval(id: string, action: ApprovalAction): boolean {
  const waiter = waiters.get(id);
  if (waiter === undefined) return false;
  waiter.resolve(action);
  return true;
}

export function rejectApproval(id: string, cause: Error): boolean {
  const waiter = waiters.get(id);
  if (waiter === undefined) return false;
  waiter.reject(cause);
  return true;
}

/** Cancel every in-flight approval when the vault locks or the worker relocks. */
export function cancelAllApprovals(cause = new VaultLockedApprovalError()): void {
  for (const waiter of waiters.values()) waiter.reject(cause);
  waiters.clear();
  void clearPendingApproval();
}

registerLockListener(() => cancelAllApprovals());

export class ApprovalTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalTimeoutError';
  }
}

export class VaultLockedApprovalError extends Error {
  constructor() {
    super('The wallet was locked before the request was approved.');
    this.name = 'VaultLockedApprovalError';
  }
}

export type { ApprovalAction };
