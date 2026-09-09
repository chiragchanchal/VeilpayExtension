/**
 * Stellar Horizon transaction-history fetcher.
 *
 * Reads an account's payment/transaction history from Horizon and normalizes
 * it into the `IndexerTx`-compatible `StellarHistoryTx` shape used by the
 * wallet's transaction dashboard.
 *
 * Testnet-only (matches the extension's scope). Fetches directly with `fetch`;
 * the extension holds host permission for horizon-testnet.stellar.org. A 404
 * from Horizon means the address has never been funded (Stellar accounts only
 * exist on-chain once created), which is returned as empty history, not an
 * error.
 */

/** A single normalized Stellar transaction history entry. */
export interface StellarHistoryTx {
  /** Transaction hash string. */
  hash: string;
  chain: 'stellar';
  /** Ledger number, or 0 if pending. */
  block: number;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Sender address. */
  from: string;
  /** Recipient address. */
  to: string;
  /** Native amount in stroops (10^7 per XLM) as a decimal string. */
  amount: string;
  /** Fee in stroops as a decimal string (empty; payments don't expose it). */
  fee: string;
  status: 'confirmed' | 'pending' | 'failed';
}

export interface StellarHistory {
  transactions: StellarHistoryTx[];
  nextCursor: string | null;
}

/** Official Stellar testnet Horizon endpoint. */
const DEFAULT_HORIZON_URL = 'https://horizon-testnet.stellar.org';

/**
 * Fetches and normalizes an account's payment history from Horizon.
 *
 * @param address - Stellar address (G...) whose history to fetch.
 * @param limit - Max records per page (passed through to Horizon).
 * @param before - Optional paging cursor (passed through to Horizon).
 * @param horizonUrl - Base Horizon URL override (e.g. a custom mirror).
 * @returns Normalized history plus the opaque cursor for the next page.
 */
export async function fetchStellarHistory(
  address: string,
  limit?: number,
  before?: string,
  horizonUrl?: string,
): Promise<StellarHistory> {
  const base = (horizonUrl ?? DEFAULT_HORIZON_URL).replace(/\/+$/, '');

  const params = new URLSearchParams();
  params.set('order', 'desc');
  params.set('include_failed', 'true');
  if (limit !== undefined && limit > 0) {
    params.set('limit', String(limit));
  }
  if (before !== undefined && before.length > 0) {
    params.set('cursor', before);
  }

  const url = `${base}/accounts/${encodeURIComponent(address)}/payments?${params.toString()}`;
  const response = await fetch(url);

  // A 404 from Horizon means the account has never been funded — that is an
  // empty/fresh history, not an error.
  if (response.status === 404) {
    return { transactions: [], nextCursor: null };
  }
  if (!response.ok) {
    throw new Error(`Horizon payments for ${address} failed: HTTP ${response.status}`);
  }

  const data: unknown = await response.json();
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Horizon payments returned unexpected shape: ${JSON.stringify(data)}`);
  }

  const parsed = data as { _embedded?: unknown; _links?: unknown };
  if (
    parsed._embedded === undefined ||
    typeof parsed._embedded !== 'object' ||
    parsed._embedded === null
  ) {
    throw new Error('Horizon payments response missing _embedded');
  }
  const records = (parsed._embedded as { records?: unknown }).records;
  if (records === undefined || !Array.isArray(records)) {
    throw new Error('Horizon payments response has no _embedded.records array');
  }

  const nextCursor = parseNextCursor(parsed._links);
  const transactions = (records as unknown[])
    .filter((r) => isPaymentLike(r))
    .map((r) => normalizePayment(r));

  return { transactions, nextCursor };
}

/**
 * Derives the next-page cursor from Horizon's `_links.next.href` (when
 * present), otherwise null. The raw href is acceptable — callers treat it
 * opaquely.
 */
function parseNextCursor(links: unknown): string | null {
  if (typeof links !== 'object' || links === null) return null;
  const next = (links as { next?: unknown }).next;
  if (typeof next !== 'object' || next === null) return null;
  const href = (next as { href?: unknown }).href;
  return typeof href === 'string' && href.length > 0 ? href : null;
}

/**
 * True for records that carry amount/from/to and normalize cleanly into the
 * transaction shape: native payments, create-account, path payments, and
 * claimable-balance payments. Non-native payment records are still kept —
 * their raw decimal amount is informational.
 */
function isPaymentLike(record: unknown): boolean {
  if (typeof record !== 'object' || record === null) return false;
  return typeof (record as { type?: unknown }).type === 'string';
}

function normalizePayment(record: unknown): StellarHistoryTx {
  const r = record as Record<string, unknown>;

  const hash = stringField(r.transaction_hash);
  const amountRaw = stringField(r.amount);
  const from = stringField(r.from);
  const to = stringField(r.to);
  const createdAt = stringField(r.created_at);
  const assetType = stringField(r.asset_type);
  const pagingToken = stringField(r.paging_token);

  const ledgerRaw = r.ledger;
  const block = typeof ledgerRaw === 'number' ? ledgerRaw : 0;

  const successful = r.transaction_successful;
  const status = successful === false ? 'failed' : 'confirmed';

  return {
    // For native XLM, convert the Horizon decimal string to stroops using
    // exact integer string math — never floating point, which can round.
    amount: assetType === 'native' ? decimalToStroops(amountRaw) : amountRaw,
    // Payments don't include a per-op fee; leave it empty.
    fee: '',
    hash: hash.length > 0 ? hash : pagingToken,
    chain: 'stellar',
    block,
    timestamp: createdAt,
    from,
    to,
    status,
  } satisfies StellarHistoryTx;
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Converts a Stellar decimal amount string to stroops (base units).
 * Handles up to 7 decimals via exact integer arithmetic — never floats.
 * Negative amounts are handled. A missing empty amount yields 0 stroops.
 */
function decimalToStroops(decimal: string): string {
  if (decimal === '') return '0';
  const negative = decimal.startsWith('-');
  const abs = negative ? decimal.slice(1) : decimal;
  const parts = abs.split('.');
  const wholeRaw = parts[0] ?? '';
  const fracRaw = parts[1] ?? '';
  const whole = wholeRaw === '' ? '0' : wholeRaw;
  // Pad to 7dp on the right, then truncate anything beyond 7dp.
  const frac7 = (fracRaw + '0000000').slice(0, 7);
  const value = BigInt(whole) * 10_000_000n + BigInt(frac7);
  return (negative ? -value : value).toString();
}
