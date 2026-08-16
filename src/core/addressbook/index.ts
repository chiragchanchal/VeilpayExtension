/**
 * Address book — persisted in IndexedDB.
 *
 * Stores labeled addresses per chain. Supports CRUD and JSON import/export.
 */

import { readMeta, writeMeta } from '@/core/vault/storage';
import type { ChainId } from '@/core/messaging/protocol';

const STORAGE_KEY = 'addressbook:entries';

export interface AddressBookEntry {
  id: string;
  chain: ChainId;
  /** Human-readable label, e.g. "My friend's wallet". */
  label: string;
  /** Chain-specific address. */
  address: string;
  /** Optional note. */
  note?: string;
  createdAt: number;
}

function isAddressBookEntry(value: unknown): value is AddressBookEntry {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.chain === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.address === 'string'
  );
}

/**
 * Loads all address book entries.
 * Malformed/partial rows are dropped rather than propagated to the UI.
 */
export async function getAddressBook(): Promise<AddressBookEntry[]> {
  const stored = await readMeta<unknown>(STORAGE_KEY);
  return Array.isArray(stored) ? stored.filter(isAddressBookEntry) : [];
}

/**
 * Adds an address book entry. Returns false if the address already exists
 * on the same chain.
 */
export async function addAddressBookEntry(
  entry: Omit<AddressBookEntry, 'id' | 'createdAt'>,
): Promise<boolean> {
  const book = await getAddressBook();
  if (book.some((e) => e.chain === entry.chain && e.address === entry.address)) {
    return false;
  }
  book.push({
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  });
  await writeMeta(STORAGE_KEY, book);
  return true;
}

/**
 * Updates an existing address book entry by id.
 */
export async function updateAddressBookEntry(
  id: string,
  patch: Partial<Pick<AddressBookEntry, 'label' | 'address' | 'note' | 'chain'>>,
): Promise<void> {
  const book = await getAddressBook();
  const index = book.findIndex((e) => e.id === id);
  if (index >= 0) {
    book[index] = { ...book[index]!, ...patch } as AddressBookEntry;
    await writeMeta(STORAGE_KEY, book);
  }
}

/**
 * Removes an address book entry by id.
 */
export async function removeAddressBookEntry(id: string): Promise<void> {
  const book = await getAddressBook();
  await writeMeta(
    STORAGE_KEY,
    book.filter((e) => e.id !== id),
  );
}

/**
 * Imports entries from a JSON array. Returns the number imported.
 * Skips entries with duplicate (chain, address) pairs.
 */
export async function importAddressBook(
  entries: Array<Omit<AddressBookEntry, 'id' | 'createdAt'>>,
): Promise<number> {
  const book = await getAddressBook();
  let imported = 0;
  for (const entry of entries) {
    if (book.some((e) => e.chain === entry.chain && e.address === entry.address)) {
      continue;
    }
    book.push({
      ...entry,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    });
    imported += 1;
  }
  await writeMeta(STORAGE_KEY, book);
  return imported;
}

/**
 * Exports entries as a JSON array.
 */
export async function exportAddressBook(): Promise<string> {
  const book = await getAddressBook();
  return JSON.stringify(book, null, 2);
}