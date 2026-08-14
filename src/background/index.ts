import { dispatch, ProtocolError, type HandlerMap } from '@/core/messaging/router';
import * as vault from '@/core/vault';
import { readMeta, writeMeta } from '@/core/vault/storage';
import { createChainService, TESTNET_ENDPOINTS } from '@/core/chains';
import { ZkCapability, type ChainId } from '@/core/messaging/protocol';
import { RpcFeeSource, estimateTransferFee } from '@/core/chains/evm/fees';
import {
  EVM_CHAIN_ID,
  signTransaction,
  signPersonalMessage,
  type UnsignedEvmTransaction,
} from '@/core/chains/evm/transaction';
import {
  parseSolanaTransaction,
  signSolanaMessage,
  signSolanaTransfer,
  signSolanaTransaction,
  type UnsignedSolanaTransfer,
} from '@/core/chains/solana/transaction';
import { signStellarPayment, type UnsignedStellarPayment } from '@/core/chains/stellar/transaction';
import { base58 } from '@scure/base';
import {
  getSecurityStatus,
  setupPin,
  verifyUserPin,
  setupWebAuthn,
} from '@/core/security';
import {
  listPermissions,
  grantPermission,
  revokeOrigin,
  getApprovedAddresses,
} from '@/core/permissions';
import {
  setPendingConnection,
  getPendingConnection,
  clearPendingConnection,
} from '@/background/connection-approval';
import {
  setPendingApproval,
  getPendingApproval,
  clearPendingApproval,
  waitForApproval,
  resolveApproval,
  VaultLockedApprovalError,
} from '@/background/transaction-approval';
import {
  setPendingX402Payment,
  getPendingX402Payment,
  clearPendingX402Payment,
  waitForX402Approval,
  resolveX402Approval,
  X402VaultLockedApprovalError,
} from '@/background/x402-approval';
import { validateChallenge } from '@/core/x402/challenge';
import { signPaymentPayload } from '@/core/x402/payment';
import {
  getActiveGrantByOrigin,
  listGrants,
  revokeGrant,
  createGrant,
  type GrantCaps,
} from '@/core/vap/grant';
import {
  loadSpendWindow,
  recordSpend,
  requiresApproval,
} from '@/core/vap/decision';
import { appendAudit } from '@/core/vap/audit';
import {
  setPendingGrantRequest,
  getPendingGrantRequest,
  clearPendingGrantRequest,
  waitForGrantApproval,
  resolveGrantApproval,
  GrantVaultLockedApprovalError,
} from '@/background/grant-approval';
import { allowPrompt } from '@/background/prompt-limiter';

/**
 * Background service worker — the only context that ever holds key material.
 *
 * MV3 terminates this worker aggressively. That is treated as a feature: an
 * eviction drops the in-memory mnemonic and forces a re-unlock. Nothing here may
 * assume it stays alive between messages, so all durable state goes to IndexedDB.
 */

const IDLE_ALARM = 'veilpay:idle-check';
const ZK_CAPABILITY_KEY = 'spike:zk-capability';

const handlers: HandlerMap = {
  ping: async (payload) => ({
    sentAt: payload.sentAt,
    receivedAt: Date.now(),
    roundTripHint: Date.now() - payload.sentAt,
  }),

  'vault.status': async () => ({
    state: await vault.getState(),
    unlockedUntil: vault.unlockedUntil(),
  }),

  'session.lock': async () => {
    vault.lock();
    return { state: await vault.getState() };
  },

  'zk.capability': async () => (await readMeta<ZkCapability>(ZK_CAPABILITY_KEY)) ?? null,

  'accounts.list': async (payload) => {
    try {
      const addresses = await vault.getAllAccountAddresses(payload.accountIndex);
      return addresses.map((address) => ({
        chain: address.chain,
        index: address.index,
        address: address.address,
        path: address.path,
      }));
    } catch (cause) {
      // A locked vault is an expected state, not a fault; the UI branches on it.
      if (cause instanceof vault.VaultLocked) {
        throw new ProtocolError('VAULT_LOCKED', 'Unlock the wallet to see your accounts.');
      }
      throw cause;
    }
  },

  /**
   * Balances are read here rather than in the UI so no extension page needs
   * network host permissions, and so a compromised page cannot see which
   * addresses are being queried.
   *
   * `bigint` is returned as a decimal string: it does not survive
   * `structuredClone` over the message bus, and JSON would silently lose
   * precision above 2^53.
   */
  'account.balance': async (payload) => {
    const service = createChainService(payload.chain);
    const balance = await service.getBalance(payload.address);
    return {
      chain: payload.chain,
      address: payload.address,
      balance: balance.toString(),
    };
  },

  /**
   * Fee preview for a transfer. Nothing is broadcast; the UI shows this before
   * asking the user to confirm.
   *
   * EVM estimates from live RPC; Solana and Stellar return fixed fees (the
   * networks use deterministic base fees for simple transfers).
   */
  'tx.estimate': async (payload) => {
    const amount = toWei(payload.amountNative, 'tx.estimate');
    if (amount <= 0n) {
      throw new ProtocolError('BAD_REQUEST', 'Amount must be greater than zero.');
    }

    let address: string;
    try {
      address = (await vault.getAccountAddress(payload.chain, payload.index)).address;
    } catch (cause) {
      if (cause instanceof vault.VaultLocked) {
        throw new ProtocolError('VAULT_LOCKED', 'Unlock the wallet to estimate the fee.');
      }
      throw cause;
    }

    switch (payload.chain) {
      case 'evm': {
        const source = new RpcFeeSource(TESTNET_ENDPOINTS.evm);
        const fees = await estimateTransferFee(source, address, payload.to, amount);
        return {
          chain: 'evm',
          from: address,
          feeNative: fees.totalFeeWei.toString(),
          gasLimit: fees.gasLimit.toString(),
        };
      }
      case 'solana':
        return {
          chain: 'solana',
          from: address,
          feeNative: '5000', // fixed 5000 lamports
          gasLimit: '1',
        };
      case 'stellar':
        return {
          chain: 'stellar',
          from: address,
          feeNative: '100', // fixed 100 stroops
          gasLimit: '1',
        };
      default:
        throw new ProtocolError('BAD_REQUEST', 'Unsupported chain.');
    }
  },

  /**
   * Builds, signs, and broadcasts a transfer.
   *
   * Signing happens inside `vault.withAccount`, which derives the key, hands it
   * to the callback, and zeroizes it on return — so the private key never exists
   * outside the service worker and is never on the message bus. The returned
   * sender is cross-checked against the signing key's address before broadcast.
   */
  'tx.transfer': async (payload) => {
    const amount = toWei(payload.amountNative, 'tx.transfer');
    if (amount <= 0n) {
      throw new ProtocolError('BAD_REQUEST', 'Amount must be greater than zero.');
    }

    try {
      return await buildAndBroadcast(payload, amount);
    } catch (cause) {
      if (cause instanceof vault.VaultLocked) {
        // A locked vault is an expected state the UI branches on, so surface it
        // as VAULT_LOCKED rather than letting the router flatten it to INTERNAL.
        throw new ProtocolError('VAULT_LOCKED', 'Unlock the wallet to send funds.');
      }
      throw cause;
    }
  },

  /**
   * Returns a fresh phrase for the user to record, and persists nothing.
   *
   * This is the one response that legitimately carries a secret, which is why
   * the router restricts the kind to extension-owned surfaces. It becomes
   * durable only if the user follows up with `vault.create`.
   */
  'mnemonic.generate': async (payload) => ({
    mnemonic: vault.generateMnemonic(payload.strength),
  }),

  /**
   * Phrase validity is checked here rather than relying on the vault's own bare
   * `Error`, so every rejection below is an authored, display-safe string and
   * anything unrecognised still flattens to INTERNAL in the router.
   */
  'vault.create': async (payload) => {
    if (!vault.validateMnemonic(payload.mnemonic)) {
      throw new ProtocolError(
        'BAD_REQUEST',
        'That recovery phrase is not a valid BIP-39 phrase.',
      );
    }

    try {
      await vault.create(payload.mnemonic, payload.passphrase);
    } catch (cause) {
      if (cause instanceof vault.WeakPassphrase || cause instanceof vault.VaultAlreadyExists) {
        throw new ProtocolError('BAD_REQUEST', cause.message);
      }
      throw cause;
    }

    ensureIdleAlarm();
    return { state: await vault.getState() };
  },

  'vault.unlock': async (payload) => {
    if ((await vault.getState()) === 'uninitialized') {
      throw new ProtocolError('BAD_REQUEST', 'There is no wallet on this device yet.');
    }

    try {
      await vault.unlock(payload.passphrase);
    } catch (cause) {
      if (cause instanceof vault.DecryptionFailed) {
        // Deliberately uniform: a caller must not be able to tell a wrong
        // secret from a damaged vault.
        throw new ProtocolError('BAD_REQUEST', 'Could not unlock the wallet.');
      }
      throw cause;
    }

    // Re-armed here as well as on install, so a wallet unlocked after an alarm
    // was lost still relocks on schedule.
    ensureIdleAlarm();
    return { state: await vault.getState(), unlockedUntil: vault.unlockedUntil() };
  },

  /**
   * Destructive and irreversible without the recovery phrase.
   *
   * The schema pins `confirmation` to the literal `'DELETE'`, so arriving here
   * means the UI collected an explicit typed confirmation; there is no second
   * check to make that Zod has not already made.
   */
  'vault.reset': async () => {
    await vault.reset();
    return { state: await vault.getState() };
  },

  /**
   * Security settings for the setup flow. Safe to call while locked — PIN and
   * WebAuthn unlock are configured before a wallet has a passphrase.
   */
  'security.status': async () => getSecurityStatus(),

  'security.pin.setup': async (payload) => setupPin(payload.pin),

  'security.pin.verify': async (payload) => verifyUserPin(payload.pin),

  'security.webauthn.setup': async () => setupWebAuthn(),

  /**
   * EIP-1193 provider handlers.
   * eth.chainId and eth.accounts are read-only and safe to call from any origin.
   * eth.requestAccounts, eth.sendTransaction, and personal.sign require the
   * vault to be unlocked (checked by the downstream handlers).
   */

  'eth.chainId': async () => ({
    chainId: `0x${EVM_CHAIN_ID.toString(16)}`,
  }),

  /**
   * EIP-1193 `wallet_switchEthereumChain`.
   *
   * The wallet is single-chain (Sepolia), so the only valid target is the
   * current chain; anything else fails with CHAIN_UNSUPPORTED (mapped to
   * EIP-1193 4902 by the inpage shim). The inpage emits `chainChanged` to the
   * dapp after a successful switch.
   */
  'eth.switchChain': async (payload) => {
    const requested = payload.chainId.toLowerCase();
    const current = `0x${EVM_CHAIN_ID.toString(16)}`.toLowerCase();
    if (requested !== current) {
      throw new ProtocolError(
        'CHAIN_UNSUPPORTED',
        `Unrecognized chain ID ${payload.chainId}. Veilpay supports Sepolia (${current}).`,
      );
    }
    return { chainId: current };
  },

  'eth.requestAccounts': async (_payload, ctx) => {
    const state = await vault.getState();
    if (state !== 'unlocked') {
      throw new ProtocolError('VAULT_LOCKED', 'Unlock the wallet first.');
    }
    // The origin check keys on the Chrome-stamped page origin (from the router),
    // never on a self-asserted payload field.
    const origin = ctx.pageOrigin;
    if (origin === null) {
      throw new ProtocolError('ORIGIN_DENIED', 'Could not verify the requesting origin.');
    }
    const accounts = await vault.getAllAccountAddresses(0);
    const evmAccounts = accounts
      .filter((a) => a.chain === 'evm')
      .map((a) => a.address);

    // Never auto-grant. A dapp only ever sees addresses the user has explicitly
    // approved; granting here would hand every account to any page that calls
    // the bridge, permanently. New origins get a pending connection request
    // surfaced to the popup instead.
    const approved = await getApprovedAddresses(origin);
    if (approved.length === 0) {
      // No grant yet — register a pending request and prompt the user.
      const allAccounts = await vault.getAllAccountAddresses(0);
      await setPendingConnection({
        origin,
        requestedAccounts: allAccounts
          .filter((a) => a.chain === 'evm')
          .map((a) => ({ chain: a.chain, address: a.address })),
        createdAt: Date.now(),
      });
      void openApprovalSurface();
      return { accounts: [] };
    }
    return { accounts: evmAccounts.filter((addr) => approved.includes(addr)) };
  },

  'eth.accounts': async (_payload, ctx) => {
    const state = await vault.getState();
    if (state !== 'unlocked') {
      return { accounts: [] };
    }
    const origin = ctx.pageOrigin;
    if (origin === null) {
      return { accounts: [] };
    }
    const approved = await getApprovedAddresses(origin);
    return { accounts: approved };
  },

  'eth.sendTransaction': async (payload, ctx) => {
    const origin = ctx.pageOrigin;
    if (origin === null) {
      throw new ProtocolError('ORIGIN_DENIED', 'Could not verify the requesting origin.');
    }
    const approved = await getApprovedAddresses(origin);
    if (approved.length === 0) {
      throw new ProtocolError('ORIGIN_DENIED', 'No accounts approved for this origin.');
    }

    // The sender is the dapp's `from` when it named an approved account,
    // otherwise the first approved EVM address (dapps routinely omit `from`).
    const from = await pickApprovedEvmAddress(payload.tx.from, approved);
    const accountIndex = await findEvmAccountIndex(from);
    if (accountIndex === null) {
      throw new ProtocolError('BAD_REQUEST', 'Sender is not a wallet account.');
    }

    // Park the request until a human decides. The dapp's message channel stays
    // open; `tx.resolve` (from our own UI) settles the waiter.
    const id = crypto.randomUUID();
    const record: Parameters<typeof setPendingApproval>[0] = {
      id,
      kind: 'tx',
      origin,
      address: from,
      createdAt: Date.now(),
    };
    if (payload.tx.to !== undefined) record.to = payload.tx.to;
    if (payload.tx.value !== undefined) {
      record.value = normalizeWei(payload.tx.value).toString();
    }
    if (payload.tx.data !== undefined) record.data = payload.tx.data;
    await setPendingApproval(record);
    void openApprovalSurface();

    let decision;
    try {
      decision = await waitForApproval(id);
    } catch (cause) {
      if (cause instanceof VaultLockedApprovalError) {
        throw new ProtocolError('VAULT_LOCKED', cause.message);
      }
      throw cause;
    }
    if (decision === 'deny') {
      throw new ProtocolError('USER_REJECTED', 'User rejected the transaction.');
    }

    // Approved — sign and broadcast with the vault's key, inside withAccount so
    // the private key never outlives the call.
    return vault.withAccount('evm', accountIndex, async (account) => {
      const service = createChainService('evm');
      const source = new RpcFeeSource(TESTNET_ENDPOINTS.evm);

      const value = payload.tx.value === undefined ? 0n : normalizeWei(payload.tx.value);
      const data = payload.tx.data === undefined ? undefined : hexToBytesStrict(payload.tx.data);
      const to = payload.tx.to ?? account.address;

      const [nonce, fees] = await Promise.all([
        service.getSequence(account.address),
        estimateTransferFee(source, account.address, to, value, data),
      ]);

      const unsigned: UnsignedEvmTransaction = {
        chainId: EVM_CHAIN_ID,
        nonce,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        maxFeePerGas: fees.maxFeePerGas,
        gasLimit: fees.gasLimit,
        to,
        value,
      };
      if (data !== undefined) unsigned.data = data;

      const signed = signTransaction(unsigned, account.privateKey);
      if (signed.from.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error('Signer address does not match the derived account.');
      }

      const hash = await service.sendTransaction(signed.raw);
      return { hash };
    });
  },

  'personal.sign': async (payload, ctx) => {
    const origin = ctx.pageOrigin;
    if (origin === null) {
      throw new ProtocolError('ORIGIN_DENIED', 'Could not verify the requesting origin.');
    }
    const approved = await getApprovedAddresses(origin);
    if (approved.length === 0) {
      throw new ProtocolError('ORIGIN_DENIED', 'No accounts approved for this origin.');
    }
    if (!approved.some((addr) => addr.toLowerCase() === payload.address.toLowerCase())) {
      throw new ProtocolError('ORIGIN_DENIED', 'Signing address is not approved for this origin.');
    }

    const accountIndex = await findEvmAccountIndex(payload.address);
    if (accountIndex === null) {
      throw new ProtocolError('BAD_REQUEST', 'Signing address is not a wallet account.');
    }

    // Park the request until a human decides, then sign with the vault key.
    const id = crypto.randomUUID();
    await setPendingApproval({
      id,
      kind: 'sign',
      origin,
      address: payload.address,
      message: payload.message,
      createdAt: Date.now(),
    });
    void openApprovalSurface();

    let decision;
    try {
      decision = await waitForApproval(id);
    } catch (cause) {
      if (cause instanceof VaultLockedApprovalError) {
        throw new ProtocolError('VAULT_LOCKED', cause.message);
      }
      throw cause;
    }
    if (decision === 'deny') {
      throw new ProtocolError('USER_REJECTED', 'User rejected the signature request.');
    }

    return vault.withAccount('evm', accountIndex, async (account) => {
      const message = hexToBytesStrict(payload.message);
      const { signature, from } = signPersonalMessage(message, account.privateKey);
      if (from.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error('Signer address does not match the derived account.');
      }
      return { signature };
    });
  },

  'permissions.list': async () => listPermissions(),

  'permissions.grant': async (payload) => {
    await grantPermission(payload.origin, payload.addresses);
    return { ok: true };
  },

  'permissions.revoke': async (payload) => {
    await revokeOrigin(payload.origin);
    return { ok: true };
  },

  'permissions.pending': async () => getPendingConnection(),

  /**
   * Resolves the pending dapp connection request.
   *
   * `approve` persists a real grant and clears the pending record; `deny` just
   * clears it. This is privileged (router), so only our own UI can invoke it —
   * a page cannot resolve its own approval. The granted addresses are validated
   * against the wallet's own accounts so the UI cannot mint arbitrary grants
   * either.
   */
  'permissions.connection': async (payload) => {
    const pending = await getPendingConnection();
    if (pending === null || pending.origin !== payload.origin) {
      throw new ProtocolError('BAD_REQUEST', 'No pending connection for that origin.');
    }

    if (payload.action === 'deny') {
      await clearPendingConnection();
      return { ok: true };
    }

    // Approve: intersect the requested addresses with the wallet's real accounts
    // so we never persist a grant to an address this wallet does not own.
    const accounts = await vault.getAllAccountAddresses(0);
    const owned = new Set(accounts.map((a) => a.address.toLowerCase()));
    const granted = payload.addresses.filter((addr) => owned.has(addr.toLowerCase()));
    await grantPermission(payload.origin, granted);
    await clearPendingConnection();
    return { ok: true };
  },

  /**
   * Reads the pending dapp transaction/signature request, or null.
   *
   * The UI polls this while deciding whether to show an approval overlay. A
   * request registered in a previous service-worker lifetime (e.g. the popup
   * opened after the worker was evicted) is still readable from session
   * storage; its waiter is gone, but the UI can still surface it and the user
   * can approve/deny — the original dapp call will have timed out.
   */
  'tx.pending': async () => {
    const pending = await getPendingApproval();
    if (pending === null) return null;
    const view: {
      id: string;
      kind: 'tx' | 'sign';
      origin: string;
      address: string;
      createdAt: number;
      to?: string;
      value?: string;
      data?: string;
      message?: string;
    } = {
      id: pending.id,
      kind: pending.kind,
      origin: pending.origin,
      address: pending.address,
      createdAt: pending.createdAt,
    };
    if (pending.to !== undefined) view.to = pending.to;
    if (pending.value !== undefined) view.value = pending.value;
    if (pending.data !== undefined) view.data = pending.data;
    if (pending.message !== undefined) view.message = pending.message;
    return view;
  },

  /**
   * Resolves a pending dapp transaction/signature request.
   *
   * Privileged (router): only our own UI surface can decide whether a page's
   * transaction is signed or its message is signed. `approve` wakes the
   * original handler, which then signs inside `vault.withAccount`; `deny`
   * wakes it to throw USER_REJECTED.
   */
  'tx.resolve': async (payload) => {
    const pending = await getPendingApproval();
    if (pending === null || pending.id !== payload.id) {
      throw new ProtocolError('BAD_REQUEST', 'No pending approval with that id.');
    }

    // Settle the waiter first so the awaiting handler can proceed, then clear
    // the record so a stale approval is never re-surfaced.
    const settled = resolveApproval(payload.id, payload.action);
    await clearPendingApproval();
    if (!settled) {
      // The service worker restarted while the user was deciding — the original
      // dapp call is gone, but the request is still consumed.
      console.warn('[veilpay] approval resolved after its waiter was lost');
    }
    return { ok: true };
  },

  /**
   * x402 consumer flow — a page replays its 402-gated request with the
   * `X-PAYMENT` header this handler returns.
   *
   * The challenge is validated before anything is signed or any prompt is
   * shown. On approval the payment payload is EIP-191 personal_signed inside
   * `vault.withAccount`, so the private key never outlives the call and never
   * crosses the message bus. The page replays its original request with the
   * returned header; the provider verifies the signature statelessly.
   */
  'x402.pay': async (payload, ctx) => {
    const state = await vault.getState();
    if (state !== 'unlocked') {
      throw new ProtocolError('VAULT_LOCKED', 'Unlock the wallet first.');
    }
    const origin = ctx.pageOrigin;
    if (origin === null) {
      throw new ProtocolError('ORIGIN_DENIED', 'Could not verify the requesting origin.');
    }

    // Reject forged/expired/replayed challenges before any signing or prompt.
    const validation = validateChallenge(payload.challenge, origin);
    if (!validation.valid) {
      throw new ProtocolError('X402_INVALID_CHALLENGE', validation.reason);
    }
    const challenge = validation.challenge;
    const amount = BigInt(challenge.amount);

    // A VAP grant for this origin can auto-approve payments within its caps,
    // removing the prompt for low-value payments the user has pre-authorized.
    const grant = await getActiveGrantByOrigin(origin);
    if (grant !== null) {
      const window = await loadSpendWindow(grant);
      const decision = requiresApproval(
        grant,
        { type: 'x402.pay', amount, chain: 'evm', recipient: challenge.payTo },
        BigInt(window.amountSpent),
      );
      if (decision.action === 'deny') {
        void appendAudit('op.denied', {
          origin,
          chain: 'evm',
          amount: challenge.amount,
          nonce: challenge.nonce,
          resource: challenge.resource,
          grantId: grant.id,
          reason: decision.reason,
        });
        throw new ProtocolError(
          'X402_INVALID_CHALLENGE',
          `Payment denied by grant policy (${decision.reason}).`,
        );
      }
      if (decision.action === 'auto') {
        const { header } = await vault.withAccount('evm', 0, async (account) => {
          return signPaymentPayload(challenge, account.privateKey, account.address);
        });
        await recordSpend(grant, amount);
        void appendAudit('op.settled', {
          origin,
          chain: 'evm',
          amount: challenge.amount,
          nonce: challenge.nonce,
          resource: challenge.resource,
          grantId: grant.id,
          approvedBy: 'grant',
        });
        return { paymentHeader: header };
      }
      // decision.action === 'required': fall through to the prompt path.
    }

    // Consent-fatigue defense (spec §9): no more than 5 prompts per origin per
    // minute. A burst is auto-denied, not queued.
    if (!allowPrompt(origin)) {
      throw new ProtocolError(
        'PROMPT_RATE_LIMITED',
        'Too many approval requests from this origin. Try again in a minute.',
      );
    }

    // Park the payment request until a human decides, then sign the payload.
    const id = crypto.randomUUID();
    await setPendingX402Payment({
      id,
      kind: 'x402.pay',
      origin,
      challenge,
      createdAt: Date.now(),
    });
    void openApprovalSurface();

    let decision;
    try {
      decision = await waitForX402Approval(id);
    } catch (cause) {
      if (cause instanceof X402VaultLockedApprovalError) {
        throw new ProtocolError('VAULT_LOCKED', cause.message);
      }
      throw cause;
    }
    if (decision === 'deny') {
      throw new ProtocolError('USER_REJECTED', 'User rejected the payment.');
    }

    void appendAudit('op.approved', {
      origin,
      chain: 'evm',
      amount: challenge.amount,
      nonce: challenge.nonce,
      resource: challenge.resource,
      approvedBy: 'user',
    });

    // The first EVM account is the payer for this slice; the overlay showed the
    // user exactly who receives what before approving.
    const paymentHeader = await vault.withAccount('evm', 0, async (account) => {
      const { header } = signPaymentPayload(challenge, account.privateKey, account.address);
      return header;
    });
    void appendAudit('op.settled', {
      origin,
      chain: 'evm',
      amount: challenge.amount,
      nonce: challenge.nonce,
      resource: challenge.resource,
      approvedBy: 'user',
    });
    if (grant !== null) await recordSpend(grant, amount);
    await clearPendingX402Payment();
    return { paymentHeader };
  },

  /**
   * Resolves a pending x402 payment.
   *
   * Privileged (router): only our own UI surface can decide whether a page's
   * payment is signed. `approve` wakes the awaiting `x402.pay` handler, which
   * then signs inside `vault.withAccount`; `deny` wakes it to throw
   * USER_REJECTED.
   */
  'x402.resolve': async (payload) => {
    const pending = await getPendingX402Payment();
    if (pending === null || pending.id !== payload.id) {
      throw new ProtocolError('BAD_REQUEST', 'No pending payment with that id.');
    }

    // Settle the waiter first so the awaiting handler can proceed, then clear
    // the record so a stale payment is never re-surfaced.
    const settled = resolveX402Approval(payload.id, payload.action);
    await clearPendingX402Payment();
    if (!settled) {
      console.warn('[veilpay] x402 payment resolved after its waiter was lost');
    }
    return { ok: true };
  },

  /**
   * Reads the pending x402 payment, or null.
   *
   * Mirrors `tx.pending`: the popup reads this on open to decide whether to
   * render the approval overlay, including when the service worker restarted
   * while the user was deciding (the original page call has timed out, but the
   * request is still consumable).
   */
  'x402.pending': async () => {
    const pending = await getPendingX402Payment();
    if (pending === null) return null;
    return {
      id: pending.id,
      origin: pending.origin,
      challenge: pending.challenge,
      createdAt: pending.createdAt,
    };
  },

  /**
   * Lists active VAP grants for settings display.
   *
   * Read-only and safe from any surface: grants carry no key material and
   * reveal no addresses.
   */
  'vap.grants.list': async () => listGrants(),

  /**
   * Revokes a VAP grant by id.
   *
   * Privileged (router): only our own surfaces may remove an origin's standing
   * payment authority. Because `getActiveGrantByOrigin` filters revoked grants,
   * revocation takes effect before the next `x402.pay` returns (VAP-04).
   */
  'vap.grant.revoke': async (payload) => {
    await revokeGrant(payload.id);
    void appendAudit('grant.revoked', { grantId: payload.id });
    return { ok: true };
  },

  /**
   * Agent grant negotiation — a page requests a grant.
   *
   * Always prompts: the requested caps are parked in session storage, the
   * approval surface opens, and the grant is created only after the user
   * approves (grant negotiation is never silent). The origin is the
   * Chrome-stamped page origin, so a page cannot request a grant for another
   * origin.
   */
  'vap.grant.request': async (payload, ctx) => {
    const state = await vault.getState();
    if (state !== 'unlocked') {
      throw new ProtocolError('VAULT_LOCKED', 'Unlock the wallet first.');
    }
    const origin = ctx.pageOrigin;
    if (origin === null) {
      throw new ProtocolError('ORIGIN_DENIED', 'Could not verify the requesting origin.');
    }

    // Consent-fatigue defense (spec §9).
    if (!allowPrompt(origin)) {
      throw new ProtocolError(
        'PROMPT_RATE_LIMITED',
        'Too many grant requests from this origin. Try again in a minute.',
      );
    }

    // The page proposes caps; the user sees them verbatim in the overlay and can
    // refuse. The schema caps the lifetime at 90 days.
    const caps: GrantCaps = payload.caps;
    const id = crypto.randomUUID();
    await setPendingGrantRequest({
      id,
      origin,
      requestedCaps: caps,
      expiresInSeconds: payload.expiresInSeconds,
      createdAt: Date.now(),
    });
    void openApprovalSurface();

    let decision;
    try {
      decision = await waitForGrantApproval(id);
    } catch (cause) {
      if (cause instanceof GrantVaultLockedApprovalError) {
        throw new ProtocolError('VAULT_LOCKED', cause.message);
      }
      throw cause;
    }
    if (decision === 'deny') {
      throw new ProtocolError('USER_REJECTED', 'User rejected the grant request.');
    }

    const grant = await createGrant({
      clientId: origin,
      clientLabel: origin,
      caps,
      expiresAt: Date.now() + payload.expiresInSeconds * 1000,
    });
    void appendAudit('grant.created', {
      grantId: grant.id,
      clientId: origin,
      maxPerOperation: caps.maxPerOperation,
      maxPerWindow: caps.maxPerWindow,
      windowSeconds: caps.windowSeconds,
      approvalThreshold: caps.approvalThreshold,
    });
    await clearPendingGrantRequest();
    return { grantId: grant.id };
  },

  /**
   * Resolves a pending grant request.
   *
   * Privileged (router): only our own UI surface may create or refuse a grant.
   * `approve` wakes the awaiting `vap.grant.request` handler, which creates the
   * grant; `deny` wakes it to throw USER_REJECTED.
   */
  'vap.grant.resolve': async (payload) => {
    const pending = await getPendingGrantRequest();
    if (pending === null || pending.id !== payload.id) {
      throw new ProtocolError('BAD_REQUEST', 'No pending grant request with that id.');
    }

    const settled = resolveGrantApproval(payload.id, payload.action);
    await clearPendingGrantRequest();
    if (!settled) {
      console.warn('[veilpay] grant request resolved after its waiter was lost');
    }
    return { ok: true };
  },

  /** Reads the pending grant request, or null. Mirrors `x402.pending`. */
  'vap.grant.pending': async () => {
    const pending = await getPendingGrantRequest();
    if (pending === null) return null;
    return {
      id: pending.id,
      origin: pending.origin,
      requestedCaps: pending.requestedCaps,
      expiresInSeconds: pending.expiresInSeconds,
      createdAt: pending.createdAt,
    };
  },

  'account.exportKey': async (payload) => {
    const state = await vault.getState();
    if (state !== 'unlocked') {
      throw new ProtocolError('VAULT_LOCKED', 'Unlock the wallet first.');
    }
    const hexKey = await vault.withAccount(payload.chain, payload.index, async (account) => {
      const bytes = account.privateKey;
      let hex = '';
      for (const b of bytes) {
        hex += b.toString(16).padStart(2, '0');
      }
      return hex;
    });
    // Get the address separately.
    const addr = await vault.getAccountAddress(payload.chain, payload.index);
    return { privateKey: hexKey, address: addr.address };
  },

  'solana.connect': async (_payload, ctx) => {
    const state = await vault.getState();
    if (state !== 'unlocked') {
      throw new ProtocolError('VAULT_LOCKED', 'Unlock the wallet first.');
    }
    const origin = ctx.pageOrigin;
    if (origin === null) {
      throw new ProtocolError('ORIGIN_DENIED', 'Could not verify the requesting origin.');
    }
    const accounts = await vault.getAllAccountAddresses(0);
    const solana = accounts.find((a) => a.chain === 'solana');
    if (!solana) {
      throw new ProtocolError('BAD_REQUEST', 'No Solana account found.');
    }
    // No auto-grant: only return the public key if this origin has already been
    // explicitly approved (matching the EVM requestAccounts behaviour). New
    // origins get a pending connection request surfaced to the popup.
    const approved = await getApprovedAddresses(origin);
    if (!approved.includes(solana.address)) {
      await setPendingConnection({
        origin,
        requestedAccounts: [{ chain: 'solana', address: solana.address }],
        createdAt: Date.now(),
      });
      void openApprovalSurface();
      throw new ProtocolError('CONNECT_PENDING', 'Awaiting approval for this origin.');
    }
    return { publicKey: solana.address };
  },

  'solana.signTransaction': async (payload, ctx) => {
    const origin = ctx.pageOrigin;
    if (origin === null) {
      throw new ProtocolError('ORIGIN_DENIED', 'Could not verify the requesting origin.');
    }
    const approved = await getApprovedAddresses(origin);
    if (approved.length === 0) {
      throw new ProtocolError('ORIGIN_DENIED', 'No accounts approved for this origin.');
    }

    // The dapp's serialized transaction names the signer; pick a wallet account
    // that is both approved and a required signer of this transaction.
    let parsed:
      | { message: Uint8Array; accountKeys: string[]; numRequiredSignatures: number; feePayerIndex: number }
      | null = null;
    try {
      parsed = parseSolanaTransaction(payload.transaction);
    } catch {
      throw new ProtocolError('BAD_REQUEST', 'Could not parse the Solana transaction.');
    }
    const signerAddress = parsed.accountKeys[parsed.feePayerIndex];
    if (signerAddress === undefined) {
      throw new ProtocolError('BAD_REQUEST', 'Solana transaction has no fee payer.');
    }
    if (!approved.includes(signerAddress)) {
      throw new ProtocolError('ORIGIN_DENIED', 'Transaction signer is not approved for this origin.');
    }
    const accountIndex = await findSolanaAccountIndex(signerAddress);
    if (accountIndex === null) {
      throw new ProtocolError('BAD_REQUEST', 'Transaction signer is not a wallet account.');
    }

    // Park the request until a human decides, then sign with the vault key.
    const id = crypto.randomUUID();
    await setPendingApproval({
      id,
      kind: 'sign',
      origin,
      address: signerAddress,
      message: payload.transaction,
      createdAt: Date.now(),
    });
    void openApprovalSurface();

    let decision;
    try {
      decision = await waitForApproval(id);
    } catch (cause) {
      if (cause instanceof VaultLockedApprovalError) {
        throw new ProtocolError('VAULT_LOCKED', cause.message);
      }
      throw cause;
    }
    if (decision === 'deny') {
      throw new ProtocolError('USER_REJECTED', 'User rejected the signature request.');
    }

    return vault.withAccount('solana', accountIndex, async (account) => {
      const signed = signSolanaTransaction(payload.transaction, account.privateKey, signerAddress);
      return { signature: signed.signature, signedTransaction: signed.signedTransaction };
    });
  },

  'solana.signMessage': async (payload, ctx) => {
    const origin = ctx.pageOrigin;
    if (origin === null) {
      throw new ProtocolError('ORIGIN_DENIED', 'Could not verify the requesting origin.');
    }
    const approved = await getApprovedAddresses(origin);
    if (approved.length === 0) {
      throw new ProtocolError('ORIGIN_DENIED', 'No accounts approved for this origin.');
    }
    if (!approved.includes(payload.address)) {
      throw new ProtocolError('ORIGIN_DENIED', 'Signing address is not approved for this origin.');
    }
    const accountIndex = await findSolanaAccountIndex(payload.address);
    if (accountIndex === null) {
      throw new ProtocolError('BAD_REQUEST', 'Signing address is not a wallet account.');
    }

    // Park the request until a human decides, then sign with the vault key.
    const id = crypto.randomUUID();
    await setPendingApproval({
      id,
      kind: 'sign',
      origin,
      address: payload.address,
      message: payload.message,
      createdAt: Date.now(),
    });
    void openApprovalSurface();

    let decision;
    try {
      decision = await waitForApproval(id);
    } catch (cause) {
      if (cause instanceof VaultLockedApprovalError) {
        throw new ProtocolError('VAULT_LOCKED', cause.message);
      }
      throw cause;
    }
    if (decision === 'deny') {
      throw new ProtocolError('USER_REJECTED', 'User rejected the signature request.');
    }

    return vault.withAccount('solana', accountIndex, async (account) => {
      let message: Uint8Array;
      try {
        message = base58.decode(payload.message);
      } catch {
        throw new ProtocolError('BAD_REQUEST', 'Message is not valid base58.');
      }
      const { signature } = signSolanaMessage(message, account.privateKey);
      return { signature, publicKey: account.address };
    });
  },
};

/** Parses a validated decimal string into a bigint. Caller has checked the shape. */
function toWei(decimal: string, kind: string): bigint {
  try {
    return BigInt(decimal);
  } catch {
    throw new ProtocolError('BAD_REQUEST', `Invalid amount for ${kind}.`);
  }
}

/**
 * Parses an EVM quantity (EIP-1193 passes values as hex, e.g. "0xde0b6b3a...")
 * into a bigint. Rejects garbage with BAD_REQUEST.
 */
function normalizeWei(quantity: string): bigint {
  try {
    if (/^0x[0-9a-fA-F]+$/.test(quantity)) {
      return BigInt(quantity);
    }
    if (/^[0-9]+$/.test(quantity)) {
      return BigInt(quantity);
    }
  } catch {
    // fall through to the protocol error
  }
  throw new ProtocolError('BAD_REQUEST', `Invalid value quantity "${quantity}".`);
}

/**
 * Parses a 0x-prefixed hex string into bytes. Used for calldata and signed
 * messages, where a non-hex input is a caller bug, not a display concern.
 */
function hexToBytesStrict(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new ProtocolError('BAD_REQUEST', `Invalid hex string "${hex}".`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Picks the sender for a dapp transaction: the dapp's `from` when it names an
 * approved account, otherwise the first approved EVM address.
 */
async function pickApprovedEvmAddress(
  from: string | undefined,
  approved: string[],
): Promise<string> {
  const evmApproved = approved.filter((addr) => addr.startsWith('0x'));
  if (evmApproved.length === 0) {
    throw new ProtocolError('ORIGIN_DENIED', 'No EVM account approved for this origin.');
  }
  if (from === undefined || from.length === 0) {
    return evmApproved[0]!;
  }
  if (!evmApproved.some((addr) => addr.toLowerCase() === from.toLowerCase())) {
    throw new ProtocolError('ORIGIN_DENIED', 'The requested sender is not approved for this origin.');
  }
  return from;
}

/**
 * Finds the account index whose EVM address matches, or null. Dapps reference
 * accounts by address; signing needs the vault index.
 */
async function findEvmAccountIndex(address: string): Promise<number | null> {
  const target = address.toLowerCase();
  // The wallet currently derives a single account set at index 0; scanning a
  // few indexes keeps the helper correct if account switching is added later.
  for (let index = 0; index < 8; index += 1) {
    const accounts = await vault.getAllAccountAddresses(index);
    const evm = accounts.find((a) => a.chain === 'evm' && a.address.toLowerCase() === target);
    if (evm !== undefined) return evm.index;
  }
  return null;
}

/**
 * Finds the account index whose Solana address matches (base58 is
 * case-sensitive, so no normalization here), or null.
 */
async function findSolanaAccountIndex(address: string): Promise<number | null> {
  for (let index = 0; index < 8; index += 1) {
    const accounts = await vault.getAllAccountAddresses(index);
    const solana = accounts.find((a) => a.chain === 'solana' && a.address === address);
    if (solana !== undefined) return solana.index;
  }
  return null;
}

/**
 * Builds, signs, and broadcasts a transfer for a given chain.
 *
 * Extracted so `tx.transfer` can wrap the whole chain-specific switch in a lock
 * guard: every branch derives inside `vault.withAccount`, which throws
 * `VaultLocked` when the session has expired, and callers decide how to surface
 * that. Signing occurs inside the callback so the private key never leaves the
 * service worker.
 */
async function buildAndBroadcast(
  payload: { chain: ChainId; index: number; to: string; amountNative: string },
  amount: bigint,
): Promise<{ chain: ChainId; from: string; to: string; amountNative: string; hash: string }> {
  switch (payload.chain) {
    case 'evm': {
      return vault.withAccount('evm', payload.index, async (account) => {
        const service = createChainService('evm');
        const source = new RpcFeeSource(TESTNET_ENDPOINTS.evm);

        const [nonce, fees] = await Promise.all([
          service.getSequence(account.address),
          estimateTransferFee(source, account.address, payload.to, amount),
        ]);

        const unsigned: UnsignedEvmTransaction = {
          chainId: EVM_CHAIN_ID,
          nonce,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          maxFeePerGas: fees.maxFeePerGas,
          gasLimit: fees.gasLimit,
          to: payload.to,
          value: amount,
        };

        const signed = signTransaction(unsigned, account.privateKey);

        if (signed.from.toLowerCase() !== account.address.toLowerCase()) {
          throw new Error('Signer address does not match the derived account.');
        }

        const hash = await service.sendTransaction(signed.raw);

        return {
          chain: 'evm',
          from: account.address,
          to: payload.to,
          amountNative: payload.amountNative,
          hash,
        };
      });
    }
    case 'solana': {
      return vault.withAccount('solana', payload.index, async (account) => {
        const blockhash = await fetchSolanaBlockhash();
        const unsigned: UnsignedSolanaTransfer = {
          from: account.address,
          to: payload.to,
          lamports: amount,
          blockhash,
        };
        const signed = signSolanaTransfer(unsigned, account.privateKey);

        if (signed.from !== account.address) {
          throw new Error('Signer address does not match the derived account.');
        }

        const service = createChainService('solana');
        const hash = await service.sendTransaction(signed.raw);

        return {
          chain: 'solana',
          from: account.address,
          to: payload.to,
          amountNative: payload.amountNative,
          hash,
        };
      });
    }
    case 'stellar': {
      return vault.withAccount('stellar', payload.index, async (account) => {
        const service = createChainService('stellar');
        const sequence = await service.getSequence(account.address);

        const unsigned: UnsignedStellarPayment = {
          from: account.address,
          to: payload.to,
          amount,
          sequence,
          fee: 100,
        };
        const signed = signStellarPayment(unsigned, account.privateKey);

        if (signed.from !== account.address) {
          throw new Error('Signer address does not match the derived account.');
        }

        const hash = await service.sendTransaction(signed.raw);

        return {
          chain: 'stellar',
          from: account.address,
          to: payload.to,
          amountNative: payload.amountNative,
          hash,
        };
      });
    }
    default:
      throw new ProtocolError('BAD_REQUEST', 'Unsupported chain.');
  }
}

/**
 * Fetches a recent blockhash from the Solana Devnet RPC.
 * The blockhash is required to build a valid transaction.
 */
async function fetchSolanaBlockhash(): Promise<Uint8Array> {
  const response = await fetch(TESTNET_ENDPOINTS.solana, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getLatestBlockhash',
      params: [{ commitment: 'confirmed' }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Solana RPC getLatestBlockhash: HTTP ${response.status}`);
  }
  const data = (await response.json()) as unknown;
  if (
    typeof data !== 'object' ||
    data === null ||
    !('result' in data) ||
    typeof (data as Record<string, unknown>).result !== 'object' ||
    (data as Record<string, unknown>).result === null
  ) {
    throw new Error('Solana RPC getLatestBlockhash returned invalid response.');
  }
  const result = (data as { result: { value?: { blockhash?: string } } }).result;
  const blockhash = result?.value?.blockhash;
  if (typeof blockhash !== 'string' || blockhash.length === 0) {
    throw new Error('Solana RPC getLatestBlockhash: no blockhash in response.');
  }
  return base58.decode(blockhash);
}

/**
 * Opens the popup so the user can approve or deny a dapp connection request.
 *
 * Chrome 127+ supports `chrome.action.openPopup()` (no extra permission).
 * When unavailable, the pending record is still readable from
 * `chrome.storage.session` — the user just needs to click the toolbar icon to
 * see the approval UI. Returns without throwing on failure.
 */
async function openApprovalSurface(): Promise<void> {
  try {
    if (typeof chrome.action.openPopup === 'function') {
      await chrome.action.openPopup();
    }
  } catch {
    // openPopup fails if the popup is already open or the action is in a
    // restricted context. The user clicks the toolbar icon instead.
  }
}

const INTERNAL_CHANNEL = 'veilpay:internal';

interface InternalMessage {
  channel: typeof INTERNAL_CHANNEL;
  kind: string;
  result?: unknown;
}

/**
 * Control-plane traffic from our own surfaces, kept off the request bus.
 *
 * These carry no user request and have no `Request` envelope, so they must be
 * routed before `dispatch` ever sees them.
 */
function isInternalMessage(value: unknown): value is InternalMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).channel === INTERNAL_CHANNEL &&
    typeof (value as Record<string, unknown>).kind === 'string'
  );
}

/**
 * Handles a control message.
 *
 * The sender check is not ceremony. A content script can post any object it
 * likes, and without it a page could write a forged `viable` capability into
 * storage and have the wallet advertise a proving path that does not exist.
 * The payload is validated even though it comes from our own offscreen document,
 * because a malformed write would silently poison the cached D3 answer.
 */
async function handleInternalMessage(
  message: InternalMessage,
  sender: chrome.runtime.MessageSender,
): Promise<{ ok: boolean }> {
  if (sender.id !== chrome.runtime.id || sender.tab !== undefined) {
    return { ok: false };
  }
  if (message.kind !== 'spike:zk-result') {
    return { ok: false };
  }

  const parsed = ZkCapability.safeParse(message.result);
  if (!parsed.success) {
    console.error('[veilpay] the D3 spike reported a malformed capability');
    return { ok: false };
  }

  await writeMeta(ZK_CAPABILITY_KEY, parsed.data);
  await chrome.offscreen.closeDocument().catch(() => undefined);
  return { ok: true };
}

/**
 * The single entry point for every inbound message.
 *
 * There were previously two `onMessage` listeners — one for requests, one for the
 * spike result — and both fired for every message while both returned `true`. The
 * offscreen document's report was therefore also handed to `dispatch`, failed
 * validation, and answered BAD_REQUEST while the real handler ran anyway. One
 * listener with an explicit channel check removes that race.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (isInternalMessage(message)) {
    handleInternalMessage(message, sender).then(sendResponse, (cause: unknown) => {
      console.error('[veilpay] internal message failed', cause);
      sendResponse({ ok: false });
    });
    return true;
  }

  dispatch(message, sender, handlers).then(sendResponse, (cause: unknown) => {
    // dispatch already flattens handler errors; this only fires if dispatch
    // itself breaks, which would be a bug rather than a rejected request.
    console.error('[veilpay] dispatch failed', cause);
    sendResponse({
      id: '00000000-0000-0000-0000-000000000000',
      ok: false,
      error: { code: 'INTERNAL', message: 'The wallet could not complete that request.' },
    });
  });
  return true; // keep the channel open for the async response
});

/**
 * Idle relock.
 *
 * A `setTimeout` would die with the worker, so the check is driven by an alarm.
 * One minute is the smallest interval Chrome reliably honours; the vault itself
 * enforces the exact deadline, so the alarm only needs to poke it.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== IDLE_ALARM) return;
  void vault.getState(); // relocks internally once the deadline has passed
});

function ensureIdleAlarm(): void {
  chrome.alarms.create(IDLE_ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureIdleAlarm();
  void runZkSpikeOnce();
  buildContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  ensureIdleAlarm();
  // Retried on every startup. If the offscreen document never reported — crash,
  // closed early, browser quit mid-probe — the capability stays unwritten, and
  // without this the D3 question would never be measured again.
  void runZkSpikeOnce();
  buildContextMenu();
});

/**
 * D3 spike, executed once and cached.
 *
 * snarkjs needs a DOM and can run long, so the probe lives in an offscreen
 * document rather than here. The result is persisted because a service-worker
 * restart must not re-run a multi-second measurement.
 */
async function runZkSpikeOnce(): Promise<void> {
  if ((await readMeta<ZkCapability>(ZK_CAPABILITY_KEY)) !== undefined) return;

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Measure whether Groth16 proving is possible under the MV3 CSP.',
    });
  } catch (cause) {
    // Already-existing document is fine; anything else means we cannot measure.
    const message = cause instanceof Error ? cause.message : String(cause);
    if (!message.includes('Only a single offscreen')) {
      await writeMeta(ZK_CAPABILITY_KEY, {
        status: 'unavailable',
        wasmCompileWorks: false,
        snarkjsImportWorks: false,
        proofGenerationWorks: null,
        proofElapsedMs: null,
        failureReason: `Offscreen document unavailable: ${message}`,
        measuredAt: Date.now(),
      } satisfies ZkCapability);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

function buildContextMenu(): void {
  chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'veilpay-send',
    title: 'Send to this address',
    contexts: ['selection'],
    documentUrlPatterns: ['*://*/*'],
  });
  chrome.contextMenus.create({
    id: 'veilpay-copy',
    title: 'Copy address to Veilpay',
    contexts: ['selection'],
    documentUrlPatterns: ['*://*/*'],
  });
  chrome.contextMenus.create({
    id: 'veilpay-lock',
    title: 'Lock Veilpay wallet',
    contexts: ['selection', 'page'],
    documentUrlPatterns: ['*://*/*'],
  });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  const selection = info.selectionText ?? '';
  const match = selection.match(ADDRESS_RE);
  const address = match?.[0] ?? '';

  switch (info.menuItemId) {
    case 'veilpay-send': {
      if (!address) {
        console.warn('[veilpay] Context menu send: no address found in selection.');
        return;
      }
      // Open the popup with the send target pre-filled.
      // The popup reads the URL fragment to pre-fill the send form.
      await chrome.tabs.create({
        url: `chrome-extension://${chrome.runtime.id}/popup.html#send=${address}`,
      });
      break;
    }
    case 'veilpay-copy': {
      // Copy the full selection text to the system clipboard.
      await navigator.clipboard.writeText(selection).catch(() => {
        // Fallback for contexts where clipboard API is unavailable.
        const textarea = document.createElement('textarea');
        textarea.value = selection;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      });
      break;
    }
    case 'veilpay-lock': {
      await vault.lock();
      break;
    }
  }
});

console.info('[veilpay] service worker ready');
