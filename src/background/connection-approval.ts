/**
 * Transient dapp connection-approval requests.
 *
 * When a page calls `eth_requestAccounts` (or `solana.connect`) for an origin
 * that has no existing approval, the background registers a *pending* request
 * here rather than auto-granting anything. The UI reads it, shows the
 * `ConnectionApproval` overlay, and resolves it — approve persists a real grant
 * in the permissions store; deny just clears the request.
 *
 * The pending record lives in `chrome.storage.session`, which is the right tool
 * for a short-lived approval: it is visible to every extension surface but is
 * cleared when the browser restarts, so a stale request can never silently
 * become a grant. Nothing here ever writes to the durable permissions store.
 */

const STORAGE_KEY = 'veilpay:pendingConnection';

export interface PendingConnectionRecord {
  /** Origin being approved (the Chrome-stamped page origin). */
  origin: string;
  /** Addresses the dapp requested (all the wallet's addresses for that chain). */
  requestedAccounts: { chain: string; address: string }[];
  /** Monotonic timestamp so the UI can show a born-at and the request can age out. */
  createdAt: number;
}

/**
 * Stores the pending request, replacing any prior one for a different origin.
 */
export async function setPendingConnection(record: PendingConnectionRecord): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: record });
}

/**
 * Reads the current pending request, or null if none is awaiting approval.
 */
export async function getPendingConnection(): Promise<PendingConnectionRecord | null> {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  const value = data[STORAGE_KEY];
  if (!isPendingConnectionRecord(value)) return null;
  return value;
}

/**
 * Discards the pending request (on deny or after it was resolved).
 */
export async function clearPendingConnection(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEY);
}

function isPendingConnectionRecord(value: unknown): value is PendingConnectionRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.origin === 'string' &&
    Array.isArray(record.requestedAccounts) &&
    typeof record.createdAt === 'number'
  );
}
