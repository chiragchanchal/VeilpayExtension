import { z } from 'zod';
import { X402Challenge } from '@/core/x402/types';
// Type-only on purpose: `grant.ts` imports `GrantCaps` (a value) from this
// module, so making this a value import would re-introduce a circular module
// graph that fails at evaluation time with a TDZ ReferenceError (the previous
// black-screen regression). Keep it type-only.
import type { Grant } from '@/core/vap/grant';

/**
 * The single message contract between every extension context.
 *
 * Rules:
 *  - Every message is validated with Zod at the receiving boundary. A malformed
 *    message from a compromised content script must never reach handler logic.
 *  - Secrets never travel over this bus. No mnemonics, no private keys, no
 *    decrypted vault material. Signing happens in the background; only the
 *    signature comes back.
 *  - `origin` is stamped by the receiver from `chrome.runtime.MessageSender`,
 *    never trusted from the payload.
 */

export const MessageSource = z.enum(['popup', 'options', 'sidepanel', 'content', 'inpage', 'offscreen']);
export type MessageSource = z.infer<typeof MessageSource>;

/** Mirrors `Chain` in `@/core/vault/key-derivation`, declared here so the wire
 * contract stays self-contained and independently validatable. */
export const ChainId = z.enum(['evm', 'solana', 'stellar']);
export type ChainId = z.infer<typeof ChainId>;

/** Discriminant for every request the background service worker accepts. */
export const RequestKind = z.enum([
  'ping',
  'vault.status',
  'session.lock',
  'zk.capability',
  'accounts.list',
  'account.balance',
  'tx.estimate',
  'tx.transfer',
  'vault.create',
  'vault.unlock',
  'vault.reset',
  'mnemonic.generate',
  'security.status',
  'security.pin.setup',
  'security.pin.verify',
  'security.webauthn.setup',
  'security.webauthn.challenge',
  'eth.chainId',
  'eth.requestAccounts',
  'eth.accounts',
  'eth.sendTransaction',
  'eth.switchChain',
  'personal.sign',
  'permissions.list',
  'permissions.grant',
  'permissions.revoke',
  'permissions.pending',
  'permissions.connection',
  'tx.pending',
  'tx.resolve',
  'x402.pay',
  'x402.resolve',
  'x402.pending',
  'vap.grants.list',
  'vap.grant.revoke',
  'vap.grant.request',
  'vap.grant.resolve',
  'vap.grant.pending',
  'account.exportKey',
  'solana.connect',
  'solana.signTransaction',
  'solana.signMessage',
]);
export type RequestKind = z.infer<typeof RequestKind>;

/**
 * Surfaces the extension itself owns, as opposed to anything running in a page.
 *
 * A passphrase has to reach the background somehow — the user types it into the
 * popup — so it necessarily crosses this bus. What must never happen is a page
 * or content script being able to send the same message. `PRIVILEGED_KINDS`
 * below is enforced by the router against the Chrome-supplied sender, so a
 * compromised content script cannot create, unlock, or destroy a vault even if
 * it forges `source`.
 */
export const EXTENSION_SOURCES: readonly MessageSource[] = [
  'popup',
  'options',
  'sidepanel',
] as const;

/** Kinds that carry a secret or perform an irreversible act. */
export const PRIVILEGED_KINDS: readonly RequestKind[] = [
  'vault.create',
  'vault.unlock',
  'vault.reset',
  'mnemonic.generate',
  // Signs with the vault's private key and broadcasts. Funds move, so it must
  // originate from our own UI — never from a page that merely claims to be it.
  'tx.transfer',
  // The PIN crosses the message bus and configures attestation, so it must
  // originate from our own surfaces.
  'security.pin.setup',
  'security.pin.verify',
  // Returns the raw private key for a chain account. Same threat profile as
  // `mnemonic.generate` — the single most sensitive kind on the bus — so it must
  // never be reachable from a compromised content script, the offscreen
  // document, or any non-extension-owned sender.
  'account.exportKey',
  // Mutates the per-origin approval store. A page that can write here grants
  // itself (or a target origin) standing access to the wallet's addresses, so
  // it is restricted to our own surfaces too.
  'permissions.grant',
  'permissions.revoke',
  // Resolving a pending dapp connection persists a grant (on approve), so it is
  // a privileged mutation exactly like `permissions.grant`. Only our own UI
  // surface may decide that.
  'permissions.connection',
  // Resolving a pending dapp transaction or signature request moves funds or
  // signs with the vault's key, so it is a privileged mutation like
  // `permissions.connection`. Only our own UI surface may decide that.
  'tx.resolve',
  // Resolving a pending x402 payment signs a payment payload with the vault's
  // key, so it is privileged exactly like `tx.resolve`. Only our own UI surface
  // may decide that.
  'x402.resolve',
  // Revoking a VAP grant removes an origin's standing payment authority, so it
  // mutates the authorization store exactly like `permissions.revoke`. Only our
  // own surfaces may do it.
  'vap.grant.revoke',
  // Resolving a pending grant request persists a standing grant, so it is a
  // privileged mutation like `permissions.connection`. Only our own UI surface
  // may decide it.
  'vap.grant.resolve',
  // Enumerating the full wallet address set across every chain reveals which
  // addresses the wallet holds. Restricted to our own surfaces so a compromised
  // page cannot harvest them.
  'accounts.list',
] as const;

export function isPrivilegedKind(kind: RequestKind): boolean {
  return PRIVILEGED_KINDS.includes(kind);
}

const baseEnvelope = z.object({
  /** Correlates a response to its request. Generated by the sender. */
  id: z.string().uuid(),
  source: MessageSource,
  /** Bumped whenever the wire format changes incompatibly. */
  v: z.literal(1),
});

export const PingRequest = baseEnvelope.extend({
  kind: z.literal('ping'),
  payload: z.object({ sentAt: z.number().int().nonnegative() }),
});

export const VaultStatusRequest = baseEnvelope.extend({
  kind: z.literal('vault.status'),
  payload: z.object({}),
});

export const SessionLockRequest = baseEnvelope.extend({
  kind: z.literal('session.lock'),
  payload: z.object({}),
});

export const ZkCapabilityRequest = baseEnvelope.extend({
  kind: z.literal('zk.capability'),
  payload: z.object({}),
});

export const AccountsListRequest = baseEnvelope.extend({
  kind: z.literal('accounts.list'),
  payload: z.object({ accountIndex: z.number().int().nonnegative() }),
});

export const AccountBalanceRequest = baseEnvelope.extend({
  kind: z.literal('account.balance'),
  payload: z.object({ chain: ChainId, address: z.string().min(1) }),
});

/**
 * Passphrase minimum is enforced again in the vault; this bound only rejects
 * obvious junk early. The maximum exists because PBKDF2 hashes the input to
 * block size anyway, and an unbounded string is a free denial-of-service.
 */
const Passphrase = z.string().min(1).max(1024);

/** A non-negative integer as a decimal string (`bigint` cannot cross the bus). */
const Decimal = z.string().regex(/^\d+$/, 'Amount must be a non-negative integer.');
const MaxUint256 = 2n ** 256n - 1n;
const NativeAmount = Decimal.refine(
  (value) => {
    const n = BigInt(value);
    return n >= 0n && n <= MaxUint256;
  },
  { message: 'Amount is outside the representable range.' },
);

export const VaultCreateRequest = baseEnvelope.extend({
  kind: z.literal('vault.create'),
  payload: z.object({
    mnemonic: z.string().min(1).max(1024),
    passphrase: Passphrase,
  }),
});

export const VaultUnlockRequest = baseEnvelope.extend({
  kind: z.literal('vault.unlock'),
  payload: z.object({ passphrase: Passphrase }),
});

/** Destructive. The UI must confirm before sending this. */
export const VaultResetRequest = baseEnvelope.extend({
  kind: z.literal('vault.reset'),
  payload: z.object({
    /** Literal typed by the user, checked again in the handler. */
    confirmation: z.literal('DELETE'),
  }),
});

export const MnemonicGenerateRequest = baseEnvelope.extend({
  kind: z.literal('mnemonic.generate'),
  payload: z.object({ strength: z.union([z.literal(128), z.literal(256)]) }),
});

/**
 * VAP grant caps. Declared here so the wire contract stays self-contained and
 * independently validatable (same reasoning as `ChainId`); `grant.ts` imports
 * and re-exports it, so domain code keeps one source of truth.
 */
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

/** Shared body for the two transfer kinds. `amountNative` is in base units. */
const TransferPayload = {
  chain: ChainId,
  /** BIP-44 account index whose key signs the transfer. */
  index: z.number().int().nonnegative(),
  /** Chain-specific address (EVM hex, Solana base58, Stellar strkey). */
  to: z.string().min(1),
  amountNative: NativeAmount,
};

export const TxEstimateRequest = baseEnvelope.extend({
  kind: z.literal('tx.estimate'),
  payload: z.object(TransferPayload),
});

/** Builds, signs, and broadcasts a transfer. Irreversible once mined. */
export const TxTransferRequest = baseEnvelope.extend({
  kind: z.literal('tx.transfer'),
  payload: z.object(TransferPayload),
});

const SecurityPinRequest = z.object({ pin: z.string().min(1).max(128) });

export const SecurityStatusRequest = baseEnvelope.extend({
  kind: z.literal('security.status'),
  payload: z.object({}),
});

export const SecurityPinSetupRequest = baseEnvelope.extend({
  kind: z.literal('security.pin.setup'),
  payload: SecurityPinRequest,
});

export const SecurityPinVerifyRequest = baseEnvelope.extend({
  kind: z.literal('security.pin.verify'),
  payload: SecurityPinRequest,
});

export const SecurityWebauthnSetupRequest = baseEnvelope.extend({
  kind: z.literal('security.webauthn.setup'),
  payload: z.object({}),
});

/**
 * Starts a WebAuthn authentication ceremony: the UI presents the returned
 * challenge to the authenticator and reports success via the resolve path.
 */
export const SecurityWebauthnChallengeRequest = baseEnvelope.extend({
  kind: z.literal('security.webauthn.challenge'),
  payload: z.object({}),
});

// ── EIP-1193 dapp provider ────────────────────────────────────────────────

export const EthChainIdRequest = baseEnvelope.extend({
  kind: z.literal('eth.chainId'),
  payload: z.object({}),
});

export const EthRequestAccountsRequest = baseEnvelope.extend({
  kind: z.literal('eth.requestAccounts'),
  payload: z.object({ origin: z.string().optional() }),
});

export const EthAccountsRequest = baseEnvelope.extend({
  kind: z.literal('eth.accounts'),
  payload: z.object({ origin: z.string().optional() }),
});

export const EthSendTransactionRequest = baseEnvelope.extend({
  kind: z.literal('eth.sendTransaction'),
  payload: z.object({
    origin: z.string().optional(),
    tx: z.object({
      /**
       * Sender. Optional because dapps routinely omit it and expect the wallet
       * to substitute its selected/approved account.
       */
      from: z.string().optional(),
      to: z.string().optional(),
      value: z.string().optional(),
      data: z.string().optional(),
      gas: z.string().optional(),
      gasPrice: z.string().optional(),
      maxFeePerGas: z.string().optional(),
      maxPriorityFeePerGas: z.string().optional(),
    }),
  }),
});

export const PersonalSignRequest = baseEnvelope.extend({
  kind: z.literal('personal.sign'),
  payload: z.object({
    origin: z.string().optional(),
    address: z.string(),
    /** Hex-encoded message to sign. */
    message: z.string(),
  }),
});

export const EthSwitchChainRequest = baseEnvelope.extend({
  kind: z.literal('eth.switchChain'),
  payload: z.object({
    origin: z.string().optional(),
    /** Hex chain id, e.g. "0xaa36a7" (Sepolia). */
    chainId: z.string(),
  }),
});

// ── Per-origin permissions ─────────────────────────────────────────────────

export const PermissionsListRequest = baseEnvelope.extend({
  kind: z.literal('permissions.list'),
  payload: z.object({}),
});

export const PermissionsGrantRequest = baseEnvelope.extend({
  kind: z.literal('permissions.grant'),
  payload: z.object({
    origin: z.string(),
    addresses: z.array(z.string()),
  }),
});

export const PermissionsRevokeRequest = baseEnvelope.extend({
  kind: z.literal('permissions.revoke'),
  payload: z.object({ origin: z.string() }),
});

export const PermissionsPendingRequest = baseEnvelope.extend({
  kind: z.literal('permissions.pending'),
  payload: z.object({}),
});

/** Resolves a pending dapp connection request. `action: 'approve'` persists a
 * grant; `'deny'` just clears the pending record. */
export const PermissionsConnectionRequest = baseEnvelope.extend({
  kind: z.literal('permissions.connection'),
  payload: z.object({
    origin: z.string(),
    /**
     * Only meaningful when `action === 'approve'`: the addresses to grant.
     * Drawn from the wallet's own accounts so the page cannot inject arbitrary
     * addresses, but verified by the handler against the vault.
     */
    addresses: z.array(z.string()),
    action: z.enum(['approve', 'deny']),
  }),
});

/**
 * Pending dapp transaction / signature approval.
 *
 * A dapp's `eth.sendTransaction` or `personal.sign` request that needs a human
 * decision is parked here (in the background) until the user approves or
 * rejects it from an extension surface. Mirrors `permissions.pending`.
 */
export const TxPendingRequest = baseEnvelope.extend({
  kind: z.literal('tx.pending'),
  payload: z.object({}),
});

/** Resolves a pending dapp transaction / signature request. */
export const TxResolveRequest = baseEnvelope.extend({
  kind: z.literal('tx.resolve'),
  payload: z.object({
    /** The pending request's id (from `tx.pending`). */
    id: z.string().min(1),
    action: z.enum(['approve', 'deny']),
  }),
});

// ── x402 agent payments ───────────────────────────────────────────────────

/**
 * A page submits an x402 challenge it received from a server's 402 response.
 *
 * The background validates the challenge, parks a pending payment request, opens
 * the approval surface, and — on user approval — signs a payment payload and
 * returns the `X-PAYMENT` header value the page replays. The challenge shape is
 * defined in `@/core/x402/types` and referenced here so the wire contract and
 * the signing module cannot drift apart.
 */
export const X402PayRequest = baseEnvelope.extend({
  kind: z.literal('x402.pay'),
  payload: z.object({
    challenge: X402Challenge,
  }),
});

/** Resolves a pending x402 payment. Privileged: only our own UI surface. */
export const X402ResolveRequest = baseEnvelope.extend({
  kind: z.literal('x402.resolve'),
  payload: z.object({
    /** The pending request's id (from `x402.pending`). */
    id: z.string().min(1),
    action: z.enum(['approve', 'deny']),
  }),
});

/** Reads the current pending x402 payment, if any. */
export const X402PendingRequest = baseEnvelope.extend({
  kind: z.literal('x402.pending'),
  payload: z.object({}),
});

// ── VAP grants ────────────────────────────────────────────────────────────

/** Lists active grants (for display in settings and agent surfaces). */
export const VapGrantsListRequest = baseEnvelope.extend({
  kind: z.literal('vap.grants.list'),
  payload: z.object({}),
});

/** Revokes a grant by id. Privileged: only our own surfaces may do it. */
export const VapGrantRevokeRequest = baseEnvelope.extend({
  kind: z.literal('vap.grant.revoke'),
  payload: z.object({ id: z.string().min(1) }),
});

/**
 * A page requests a grant. Always prompts — grant negotiation is never silent.
 * Caps come from the page but are validated and shown verbatim in the overlay.
 */
export const VapGrantRequestRequest = baseEnvelope.extend({
  kind: z.literal('vap.grant.request'),
  payload: z.object({
    caps: GrantCaps,
    /** Requested lifetime in seconds; the handler caps it at 90 days. */
    expiresInSeconds: z.number().int().positive().max(7_776_000),
  }),
});

/** Resolves a pending grant request. Privileged: only our own UI surface. */
export const VapGrantResolveRequest = baseEnvelope.extend({
  kind: z.literal('vap.grant.resolve'),
  payload: z.object({
    id: z.string().min(1),
    action: z.enum(['approve', 'deny']),
    /**
     * PIN required when approving and a PIN is configured (VAP-01). Carried
     * over the bus only from our own UI surface (the resolve kind is
     * privileged), verified by the background before the grant is created.
     */
    pin: z.string().max(128).optional(),
    /**
     * True when the UI completed a WebAuthn passkey ceremony for this approval.
     * Required when WebAuthn is enabled and no PIN is configured (VAP-01).
     * The ceremony runs in the UI context (`navigator.credentials` is not
     * available in the service worker); this flag travels the privileged
     * resolve kind, so a page cannot forge it.
     */
    webauthn: z.boolean().optional(),
  }),
});

/** Reads the current pending grant request, if any. */
export const VapGrantPendingRequest = baseEnvelope.extend({
  kind: z.literal('vap.grant.pending'),
  payload: z.object({}),
});

export const AccountExportKeyRequest = baseEnvelope.extend({
  kind: z.literal('account.exportKey'),
  payload: z.object({
    chain: ChainId,
    index: z.number().int().nonnegative(),
  }),
});

// ── Solana dapp provider ─────────────────────────────────────────────────

export const SolanaConnectRequest = baseEnvelope.extend({
  kind: z.literal('solana.connect'),
  payload: z.object({ origin: z.string().optional() }),
});

export const SolanaSignTransactionRequest = baseEnvelope.extend({
  kind: z.literal('solana.signTransaction'),
  payload: z.object({
    origin: z.string().optional(),
    /** Base58-encoded transaction. */
    transaction: z.string(),
  }),
});

export const SolanaSignMessageRequest = baseEnvelope.extend({
  kind: z.literal('solana.signMessage'),
  payload: z.object({
    origin: z.string().optional(),
    address: z.string(),
    /** Base58-encoded message to sign. */
    message: z.string(),
  }),
});

export const Request = z.discriminatedUnion('kind', [
  PingRequest,
  VaultStatusRequest,
  SessionLockRequest,
  ZkCapabilityRequest,
  AccountsListRequest,
  AccountBalanceRequest,
  TxEstimateRequest,
  TxTransferRequest,
  VaultCreateRequest,
  VaultUnlockRequest,
  VaultResetRequest,
  MnemonicGenerateRequest,
  SecurityStatusRequest,
  SecurityPinSetupRequest,
  SecurityPinVerifyRequest,
  SecurityWebauthnSetupRequest,
  SecurityWebauthnChallengeRequest,
  EthChainIdRequest,
  EthRequestAccountsRequest,
  EthAccountsRequest,
  EthSendTransactionRequest,
  EthSwitchChainRequest,
  PersonalSignRequest,
  PermissionsListRequest,
  PermissionsGrantRequest,
  PermissionsRevokeRequest,
  PermissionsPendingRequest,
  PermissionsConnectionRequest,
  TxPendingRequest,
  TxResolveRequest,
  X402PayRequest,
  X402ResolveRequest,
  X402PendingRequest,
  VapGrantsListRequest,
  VapGrantRevokeRequest,
  VapGrantRequestRequest,
  VapGrantResolveRequest,
  VapGrantPendingRequest,
  AccountExportKeyRequest,
  SolanaConnectRequest,
  SolanaSignTransactionRequest,
  SolanaSignMessageRequest,
]);
export type Request = z.infer<typeof Request>;

export const VaultState = z.enum(['uninitialized', 'locked', 'unlocked']);
export type VaultState = z.infer<typeof VaultState>;

/**
 * Outcome of the D3 spike, as a single discriminant.
 *
 * This exists because a bare `proofGenerationWorks: false` conflates two results
 * that demand opposite responses: "the CSP refuses to run snarkjs" means shielded
 * transactions move to Phase 5, while "we have not vendored the circuit
 * artifacts" means we have not measured this tier at all. Storing only the
 * boolean made the highest-risk decision in the plan unanswerable from the
 * recorded evidence.
 */
export const ZkProbeStatus = z.enum([
  /** WASM compiled, snarkjs imported, and a real Groth16 proof completed. */
  'viable',
  /** WASM or the snarkjs module graph was refused. ZK cannot run in-extension. */
  'blocked-csp',
  /** snarkjs loaded, but proving errored. A circuit or version problem, not CSP. */
  'proof-failed',
  /** Circuit artifacts absent, so the proving tier was never exercised. Unknown. */
  'untested-artifacts',
  /** The probe itself could not run, so nothing at all was measured. */
  'unavailable',
]);
export type ZkProbeStatus = z.infer<typeof ZkProbeStatus>;

export const ZkCapability = z.object({
  status: ZkProbeStatus,
  wasmCompileWorks: z.boolean(),
  snarkjsImportWorks: z.boolean(),
  /** Null when proving was never attempted, which is not the same as `false`. */
  proofGenerationWorks: z.boolean().nullable(),
  /** Wall-clock of a completed proof, for the Phase 3 latency budget. */
  proofElapsedMs: z.number().int().nonnegative().nullable(),
  /** Present when something failed, for the D3 write-up. */
  failureReason: z.string().nullable(),
  measuredAt: z.number().int().nonnegative(),
});
export type ZkCapability = z.infer<typeof ZkCapability>;

export const ResponseOk = z.object({
  id: z.string().uuid(),
  ok: z.literal(true),
  data: z.unknown(),
});

export const ResponseErr = z.object({
  id: z.string().uuid(),
  ok: z.literal(false),
  error: z.object({
    code: z.enum([
      'BAD_REQUEST',
      'UNKNOWN_KIND',
      'VAULT_LOCKED',
      'INTERNAL',
      'ORIGIN_DENIED',
      // A dapp requested accounts but no approval exists yet; the wallet has
      // opened its approval UI. The dapp should surface "awaiting approval" and
      // retry — the pending request resolves to a grant (or stays denied).
      'CONNECT_PENDING',
      // The user explicitly rejected a dapp transaction or signature request.
      'USER_REJECTED',
      // A dapp transaction/signature request aged out before a human decided.
      'APPROVAL_TIMEOUT',
      // The dapp asked to switch to an EVM chain this wallet does not support.
      // Maps to EIP-1193 error 4902 ("Unrecognized chain").
      'CHAIN_UNSUPPORTED',
      // An x402 challenge failed validation (expired, replayed, mismatched
      // origin, malformed) and was rejected before any signing.
      'X402_INVALID_CHALLENGE',
      // The origin has triggered too many approval prompts in a rolling minute.
      // Consent-fatigue defense (spec §9).
      'PROMPT_RATE_LIMITED',
    ]),
    /** Safe for display. Never contains key material or stack traces. */
    message: z.string(),
  }),
});

export const Response = z.union([ResponseOk, ResponseErr]);
export type Response = z.infer<typeof Response>;

/** Maps each request kind to the shape of its `data` on success. */
export interface ResponseData {
  ping: { sentAt: number; receivedAt: number; roundTripHint: number };
  'vault.status': { state: VaultState; unlockedUntil: number | null };
  'session.lock': { state: VaultState };
  'zk.capability': ZkCapability | null;
  'accounts.list': Array<{
    chain: ChainId;
    index: number;
    address: string;
    path: string;
  }>;
  /** `balance` is a decimal string: `bigint` cannot cross the message bus. */
  'account.balance': { chain: ChainId; address: string; balance: string };
  /** Fee preview for a transfer, in base units (wei). Nothing is broadcast. */
  'tx.estimate': {
    chain: ChainId;
    /** Sender address that would sign. */
    from: string;
    /** Total fee = gasLimit * maxFeePerGas, in wei. */
    feeNative: string;
    gasLimit: string;
  };
  /** A transfer that was built, signed, and broadcast. */
  'tx.transfer': {
    chain: ChainId;
    from: string;
    to: string;
    /** Amount moved, in wei. */
    amountNative: string;
    /** Transaction hash, once broadcast. */
    hash: string;
  };
  'vault.create': { state: VaultState };
  'vault.unlock': { state: VaultState; unlockedUntil: number | null };
  'vault.reset': { state: VaultState };
  /**
   * A freshly generated phrase, returned once for the user to write down.
   * It is not persisted anywhere until `vault.create` is called with it.
   */
  'mnemonic.generate': { mnemonic: string };
  'security.status': { pinEnabled: boolean; webauthnEnabled: boolean };
  'security.pin.setup': { ok: boolean };
  'security.pin.verify': { ok: boolean };
  'security.webauthn.setup': { ok: boolean };
  /** Challenge hex for a WebAuthn ceremony, with the registered credential id. */
  'security.webauthn.challenge': { credentialId: string; challenge: string };
  /** Hex-encoded chain ID, e.g. "0xaa36a7" (Sepolia). */
  'eth.chainId': { chainId: string };
  /** Array of hex addresses the origin has permission to use. */
  'eth.requestAccounts': { accounts: string[] };
  'eth.accounts': { accounts: string[] };
  /** Transaction hash for a broadcast tx. */
  'eth.sendTransaction': { hash: string };
  /** Confirms the switch; the wallet emits `chainChanged` on success. */
  'eth.switchChain': { chainId: string };
  /** Signature as hex string. */
  'personal.sign': { signature: string };
  'permissions.list': Array<{ origin: string; addresses: string[]; createdAt: number; lastUsedAt: number }>;
  'permissions.grant': { ok: boolean };
  'permissions.revoke': { ok: boolean };
  'permissions.pending': {
    origin: string;
    requestedAccounts: { chain: string; address: string }[];
    createdAt: number;
  } | null;
  'permissions.connection': { ok: boolean };
  /** The pending dapp transaction/signature request awaiting approval, if any. */
  'tx.pending': {
    id: string;
    /** What the dapp asked to do: broadcast a transaction or sign a message. */
    kind: 'tx' | 'sign';
    /** Origin that requested the operation (the Chrome-stamped page origin). */
    origin: string;
    /** Address that would sign / is being signed. */
    address: string;
    /** For kind 'tx': recipient address. */
    to?: string;
    /** For kind 'tx': value in wei (decimal string). */
    value?: string;
    /** For kind 'tx': hex-encoded calldata, or undefined for a plain transfer. */
    data?: string;
    /** For kind 'sign': the hex-encoded message to sign. */
    message?: string;
    /** When the request was registered, so the UI can age it out. */
    createdAt: number;
  } | null;
  'tx.resolve': { ok: boolean };
  /** The `X-PAYMENT` header value the page replays with its request. */
  'x402.pay': { paymentHeader: string };
  'x402.resolve': { ok: boolean };
  /** The pending x402 payment request awaiting a human decision, if any. */
  'x402.pending': {
    id: string;
    origin: string;
    challenge: X402Challenge;
    createdAt: number;
  } | null;
  /** Active VAP grants, for settings and agent surfaces. */
  'vap.grants.list': Grant[];
  'vap.grant.revoke': { ok: boolean };
  'vap.grant.request': { grantId: string };
  'vap.grant.resolve': { ok: boolean };
  'vap.grant.pending': {
    id: string;
    origin: string;
    requestedCaps: GrantCaps;
    expiresInSeconds: number;
    createdAt: number;
  } | null;
  'account.exportKey': { privateKey: string; address: string };
  /** Solana provider. */
  'solana.connect': { publicKey: string };
  /** Signed transaction in base58. */
  'solana.signTransaction': { signature: string; signedTransaction: string };
  /** Signed message. */
  'solana.signMessage': { signature: string; publicKey: string };
}

export function newId(): string {
  return crypto.randomUUID();
}
