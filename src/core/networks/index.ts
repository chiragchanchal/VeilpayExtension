/**
 * Custom network configuration — persisted in IndexedDB.
 *
 * Users can override the default testnet RPC endpoints and add custom chains.
 * Stored via the vault's `readMeta` / `writeMeta` helpers.
 */

import { readMeta, writeMeta } from '@/core/vault/storage';
import type { ChainId } from '@/core/messaging/protocol';

const STORAGE_KEY = 'networks:custom';

export interface CustomNetwork {
  /** EVM, Solana, or Stellar. */
  chain: ChainId;
  /** Display name, e.g. "Sepolia via Infura". */
  name: string;
  /** RPC endpoint URL. */
  rpcUrl: string;
  /** Optional chain ID (for EVM networks). */
  chainId?: number;
  /** Optional explorer URL. */
  explorerUrl?: string;
}

/**
 * Loads custom networks from IndexedDB.
 */
export async function getCustomNetworks(): Promise<CustomNetwork[]> {
  const stored = await readMeta<CustomNetwork[]>(STORAGE_KEY);
  return Array.isArray(stored) ? stored : [];
}

/**
 * Adds a custom network. Returns false if the name already exists.
 */
export async function addCustomNetwork(network: CustomNetwork): Promise<boolean> {
  const networks = await getCustomNetworks();
  if (networks.some((n) => n.name === network.name)) {
    return false;
  }
  networks.push(network);
  await writeMeta(STORAGE_KEY, networks);
  return true;
}

/**
 * Removes a custom network by name.
 */
export async function removeCustomNetwork(name: string): Promise<void> {
  const networks = await getCustomNetworks();
  await writeMeta(
    STORAGE_KEY,
    networks.filter((n) => n.name !== name),
  );
}

/**
 * Resolves the RPC URL for a chain, preferring custom networks over defaults.
 */
export async function resolveRpcUrl(
  chain: ChainId,
  defaultUrl: string,
): Promise<string> {
  const custom = await getCustomNetworks();
  const match = custom.find((n) => n.chain === chain);
  return match?.rpcUrl ?? defaultUrl;
}