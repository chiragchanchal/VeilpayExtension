/**
 * Per-origin permission store — persisted in IndexedDB.
 *
 * Each entry pairs an origin with a set of addresses that origin may access.
 * The store is read on every `eth_accounts` / `eth_requestAccounts` call and
 * consulted before signing or sending.
 *
 * Persisted via the vault's `readMeta` / `writeMeta` helpers so the grant
 * survives extension restarts.
 */

import { readMeta, writeMeta } from '@/core/vault/storage';

const STORAGE_KEY = 'permissions:origins';

export interface OriginPermission {
  origin: string;
  /** Addresses (hex for EVM, base58 for Solana, strkey for Stellar) this origin may use. */
  addresses: string[];
  /** First time the origin was granted access. */
  createdAt: number;
  /** Last time the origin used an address. */
  lastUsedAt: number;
}

type PermissionsStore = OriginPermission[];

/**
 * Loads the full permission list from IndexedDB.
 */
async function loadStore(): Promise<PermissionsStore> {
  const stored = await readMeta<PermissionsStore>(STORAGE_KEY);
  return Array.isArray(stored) ? stored : [];
}

/**
 * Persists the full permission list.
 */
function saveStore(store: PermissionsStore): Promise<void> {
  return writeMeta(STORAGE_KEY, store);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all permissions (for display in settings).
 */
export async function listPermissions(): Promise<PermissionsStore> {
  return loadStore();
}

/**
 * Grants an origin access to a set of addresses. Idempotent — if the origin
 * already has entries, the new addresses are merged in.
 */
export async function grantPermission(
  origin: string,
  addresses: string[],
): Promise<void> {
  const store = await loadStore();
  const existing = store.find((p) => p.origin === origin);
  if (existing) {
    // Merge, deduplicate.
    const seen = new Set(existing.addresses);
    for (const addr of addresses) {
      seen.add(addr);
    }
    existing.addresses = [...seen];
    existing.lastUsedAt = Date.now();
  } else {
    store.push({
      origin,
      addresses: [...addresses],
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
  }
  await saveStore(store);
}

/**
 * Revokes all permissions for an origin.
 */
export async function revokeOrigin(origin: string): Promise<void> {
  const store = await loadStore();
  await saveStore(store.filter((p) => p.origin !== origin));
}

/**
 * Revokes a specific address from an origin's permissions.
 */
export async function revokeAddress(
  origin: string,
  address: string,
): Promise<void> {
  const store = await loadStore();
  const entry = store.find((p) => p.origin === origin);
  if (entry) {
    entry.addresses = entry.addresses.filter((a) => a !== address);
    entry.lastUsedAt = Date.now();
    // Clean up empty entries.
    if (entry.addresses.length === 0) {
      await saveStore(store.filter((p) => p.origin !== origin));
    } else {
      await saveStore(store);
    }
  }
}

/**
 * Returns the addresses an origin is approved to use, or an empty array.
 * Updates `lastUsedAt` on read.
 */
export async function getApprovedAddresses(
  origin: string,
): Promise<string[]> {
  const store = await loadStore();
  const entry = store.find((p) => p.origin === origin);
  if (!entry) return [];
  entry.lastUsedAt = Date.now();
  await saveStore(store);
  return [...entry.addresses];
}

/**
 * Checks whether an origin has a specific address approved.
 */
export async function isAddressApproved(
  origin: string,
  address: string,
): Promise<boolean> {
  const addresses = await getApprovedAddresses(origin);
  return addresses.includes(address);
}