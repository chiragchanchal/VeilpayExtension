/**
 * Lazy WalletConnect bootstrap.
 *
 * The WalletConnect SDK is heavy and historically trips over MV3 service-worker
 * quirks (bare `global` / `process.env` references, Node-ish feature tests). If
 * it were statically imported here it would be bundled into the service worker's
 * main chunk, so any module-evaluation error would kill the whole wallet before
 * the message listener is even registered — a blank popup with no errors.
 *
 * To keep that failure mode impossible, the SDK is loaded through a dynamic
 * import on first use. A WalletConnect problem then degrades to "that feature is
 * unavailable" (logged, with a clean protocol error), never "the wallet is dead".
 */

import type { WalletConnectClient } from './client';
import { getPendingWcProposal } from './proposal-store';
import { getPendingWcRequest } from './request-store';

export type { PendingWcProposal } from './proposal-store';
export type { PendingWcRequest } from './request-store';

let clientPromise: Promise<WalletConnectClient> | null = null;

async function loadClient(): Promise<WalletConnectClient> {
  if (clientPromise === null) {
    clientPromise = import('./client').then(async (mod) => {
      const instance = mod.WalletConnectClient.getInstance();
      await instance.init();
      return instance;
    });
    // Allow a later retry after a transient failure instead of caching it.
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

/**
 * Ensures the client is initialized on service worker startup. Failures are
 * logged and swallowed here so an unavailable WalletConnect relay never breaks
 * the rest of the wallet; `getWalletConnectClient` surfaces the error to the
 * specific `wc.*` request that needs it.
 */
export async function initWalletConnect(): Promise<void> {
  try {
    await loadClient();
  } catch (cause) {
    console.warn('[veilpay] WalletConnect could not start:', cause);
  }
}

/** Returns a ready client, or rejects for the requesting `wc.*` handler. */
export function getWalletConnectClient(): Promise<WalletConnectClient> {
  return loadClient();
}

// Re-export stores used directly by background handlers.
export { getPendingWcProposal, getPendingWcRequest };
export { clearPendingWcProposal } from './proposal-store';
export { clearPendingWcRequest } from './request-store';
