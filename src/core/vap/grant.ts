/**
 * VAP grant model and persistence.
 *
 * A grant is a scoped, revocable standing authorization for one origin to make
 * agent payments without a per-payment prompt — within hard caps. Grants are
 * not secrets (no key material), so they live in IndexedDB via `readMeta` /
 * `writeMeta`, matching the permissions and networks stores.
 *
 * All monetary caps are decimal strings, not `bigint`: grants cross the message
 * bus (structuredClone cannot carry `bigint`) and persist in JSON-friendly
 * storage. The decision function converts at the point of comparison.
 *
 * Spec reference: §2 of 4_NATIVE_PAYMENT_LAYER_SPEC.md
 */
import { z } from 'zod';
import { readMeta, writeMeta } from '@/core/vault/storage';
import { ChainId } from '@/core/messaging/protocol';

const STORAGE_KEY = 'vap:grants';

/** A non-negative integer as a decimal string (the bus form of `bigint`). */
const Decimal = z.string().regex(/^\d+$/, 'Must be a non-negative integer.');

export const GrantCaps = z.object({
  /** Hard ceiling per single operation, in base units (wei). */
  maxPerOperation: Decimal,
  /** Rolling-window ceiling, in base units (wei). */
  maxPerWindow: Decimal,
  /** Window length in seconds (1 min – 1 year). */
  windowSeconds: z.number().int().min(60).max(31_536_000),
  /** Above this amount, force user approval even in autonomous mode. */
  approvalThreshold: Decimal,
  /** Operation types this grant permits. x402.pay is the only op today. */
  allowedOps: z.array(z.literal('x402.pay')).min(1),
  /** Chains payments may settle on. EVM (Sepolia) only today. */
  allowedChains: z.array(ChainId).min(1),
  /** Allowed recipients; empty = any (discouraged but simple). */
  allowlist: z.array(z.string()),
});
export type GrantCaps = z.infer<typeof GrantCaps>;

export const Grant = z.object({
  id: z.string().min(1),
  /** The origin this grant applies to. Bound at creation, checked per call. */
  clientId: z.string().min(1),
  /** Human label for the client (usually the origin itself). */
  clientLabel: z.string().min(1),
  /**
   * Autonomous: payments under the threshold auto-approve. The only mode today;
   * `perOperation` is a future option that would always prompt.
   */
  approvalMode: z.literal('autonomous'),
  caps: GrantCaps,
  expiresAt: z.number().int().nonnegative(),
  /** Set when revoked; the grant stops authorizing immediately. */
  revokedAt: z.number().int().nonnegative().optional(),
  createdAt: z.number().int().nonnegative(),
});
export type Grant = z.infer<typeof Grant>;

async function loadStore(): Promise<Grant[]> {
  const stored = await readMeta<Grant[]>(STORAGE_KEY);
  return Array.isArray(stored) ? stored : [];
}

function saveStore(store: Grant[]): Promise<void> {
  return writeMeta(STORAGE_KEY, store);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns non-revoked grants, for display in settings. */
export async function listGrants(): Promise<Grant[]> {
  const store = await loadStore();
  return store.filter((grant) => grant.revokedAt === undefined);
}

/** Returns every grant including revoked ones (audit/export path). */
export async function listAllGrants(): Promise<Grant[]> {
  return loadStore();
}

export async function getGrantById(id: string): Promise<Grant | null> {
  const store = await loadStore();
  return store.find((grant) => grant.id === id) ?? null;
}

/**
 * Returns the active (non-revoked, unexpired) grant for an origin, if any.
 *
 * `x402.pay` uses this to decide whether a payment may auto-approve.
 */
export async function getActiveGrantByOrigin(
  origin: string,
  now: number = Date.now(),
): Promise<Grant | null> {
  const store = await loadStore();
  const grant = store.find(
    (g) =>
      g.clientId === origin &&
      g.revokedAt === undefined &&
      g.expiresAt > now,
  );
  return grant ?? null;
}

/**
 * Creates a grant for an origin.
 *
 * Replaces any prior active grant for the same origin (one active grant per
 * client), so caps changes take effect by recreating rather than by mutating a
 * live authorization.
 */
export async function createGrant(input: {
  clientId: string;
  clientLabel: string;
  caps: GrantCaps;
  expiresAt: number;
}): Promise<Grant> {
  const parsedCaps = GrantCaps.parse(input.caps);
  const parsedExpiry = Grant.shape.expiresAt.parse(input.expiresAt);

  const store = await loadStore();
  const prior = store.find(
    (g) => g.clientId === input.clientId && g.revokedAt === undefined,
  );
  if (prior !== undefined) prior.revokedAt = Date.now();

  const grant: Grant = {
    id: crypto.randomUUID(),
    clientId: input.clientId,
    clientLabel: input.clientLabel,
    approvalMode: 'autonomous',
    caps: parsedCaps,
    expiresAt: parsedExpiry,
    createdAt: Date.now(),
  };
  store.push(grant);
  await saveStore(store);
  return grant;
}

/** Revokes a grant by id. Idempotent; missing ids are a no-op. */
export async function revokeGrant(
  id: string,
  now: number = Date.now(),
): Promise<void> {
  const store = await loadStore();
  const grant = store.find((g) => g.id === id);
  if (grant !== undefined) {
    grant.revokedAt = now;
    await saveStore(store);
  }
}