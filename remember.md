# Veilpay — Session Checkpoint

**Date:** 2026-08-15
**Branch:** main (repo has NO commits yet — everything untracked)

## Where we are

Veilpay: a security-critical, self-custody multi-chain (EVM/Solana/Stellar) privacy
Chrome extension (MV3, Vite, React 19, TS strict, Zustand, IndexedDB/idb, snarkjs ZK
spike, @scure/@noble crypto, zod message protocol).

**Phase 1 (vault + messaging + CSP/ZK spike + UI scaffold) — DONE.**
**Phase 2 (onboarding, unlock, dashboard, send/receive, dapp provider, connection-approval, transaction-approval, settings) — DONE.**
**Phase 3 S4 (x402 consumer, always-prompt) — DONE (this session).**
**Phase 3 S5a (VAP grants core) — DONE (this session).**
**Phase 3 S5b (grant negotiation + audit + rate limit) — DONE (this session).**
**Phase 3 S5c (PIN-gated grant creation, VAP-01) — DONE (this session).**
**Phase 3 S5d (WebAuthn grant confirmation, VAP-01 complete) — DONE (this session).**
**Phase 3 audit view (settings list/verify/export) — DONE (this session).**
**Phase 3 S6 stealth crypto foundation — DONE (this session).**

## Version control (FIXED this session)

Repo now has git history on `main`: `2ea7e3e` (initial commit) → `6c8069f`
(S5c) → `ed7243d` (S5d) → `d544702` (audit view) → `9e24762` (stealth).
Working on main directly (solo local repo, no remote); the "no git history"
risk-register item is resolved. Consider a remote/backup.

## Verified green (complete `npm run gate:all`, Aug 15)

- typecheck, lint (`--max-warnings 0`), vitest **316 pass / 40 files**, vite build,
  bundle-size gate (5.4% of 5 MB), secret-leak gate.

## Verified green (complete `npm run gate:all`, Aug 15)

- typecheck, lint (`--max-warnings 0`), vitest **301 pass / 37 files**, vite build,
  bundle-size gate (5.3% of 5 MB), secret-leak gate.

## S4 — x402 consumer (always-prompt)

- `src/core/x402/`: `types.ts` (Zod schemas), `challenge.ts` (validate + nonce LRU), `payment.ts` (EIP-191 canonical payload signing → `X-PAYMENT` header).
- `src/background/x402-approval.ts`: pending record + waiter + lock listener (mirrors transaction-approval).
- Protocol: `x402.pay` / `x402.resolve` / `x402.pending`; `X402_INVALID_CHALLENGE` error; `x402.resolve` privileged.
- Inpage: `window.veilpay.agent.payChallenge(challenge)`.
- UI: `X402Approval.tsx` overlay wired into popup + sidepanel.
- Reference 402 server: `scripts/x402-reference-server.mjs` (`npm run x402:server`, port 3402) — stateless ecrecover verification (VAP-07), dual-use module with `.d.mts` declaration.
- Demo page has an x402 card ("Fetch challenge" → "Pay & replay").
- 32 x402 tests.

## S5a — VAP grants

- `src/core/vap/`: `grant.ts` (Grant model + Zod + GrantService: create/list/getActiveByOrigin/revoke; caps as decimal strings, stored via readMeta/writeMeta key `vap:grants`), `decision.ts` (`requiresApproval` returning `{action:'auto'|'required'|'deny', reason}` + SpendWindow load/record key `vap:spendWindows`).
- `x402.pay` now checks `getActiveGrantByOrigin(origin)`; auto-approves within caps (records spend), prompts otherwise; no grant → always-prompt.
- Protocol: `vap.grants.list` + `vap.grant.revoke` (privileged).
- Settings: "VAP Grants" tab in SettingsLayout with create form (ETH inputs, 3s anti-clickjack countdown) + list + revoke. NOTE: settings file uses hardcoded English strings (not i18n `t()`), matching the file's existing pattern.
- 19 VAP tests.

## S5b — grant negotiation + audit + rate limit

- `src/background/grant-approval.ts`: pending grant request + waiter (mirrors x402-approval).
- `src/core/vap/audit.ts`: hash-chained audit ledger on the existing `auditLedger` IndexedDB store — `appendAudit` / `verifyAuditChain` / `exportAudit`; entries chain via `previousHash`, tamper detected by re-hash.
- `src/background/prompt-limiter.ts`: `allowPrompt(origin)` — 5 prompts/min per origin, burst auto-denied (consent fatigue).
- Protocol: `vap.grant.request` (page, always-prompts) / `vap.grant.resolve` (privileged) / `vap.grant.pending`; `PROMPT_RATE_LIMITED` error.
- Inpage agent: `requestGrant(request)`, `listGrants()`, `revokeGrant(id)`; `getCapabilities` now reports `grants: true`.
- UI: `GrantApproval.tsx` overlay (origin, caps, 3s hold-to-confirm approve) wired into popup + sidepanel; i18n `vap.*` keys.
- Audit wired into: x402.pay (op.approved / op.settled / op.denied), grant creation (grant.created), revocation (grant.revoked) — both agent flow and settings.
- Rate limiter wired into the x402.pay prompt path and vap.grant.request.
- Demo: "Request grant" button on the x402 card.
- 17 S5b tests.

## Gotchas / decisions

- `ApprovalDecision` uses a single `action` discriminant (`{action:'auto'|'required'|'deny', reason}`) so TS narrows cleanly.
- noble-curves 1.9: signature recovery needs `.addRecoveryBit(rec)` and `point.toRawBytes(false)` (not `toBytes`); `secp256k1.verify` only parses the bare 64-byte compact hex (no `0x`, no `v` byte).
- Nonce LRU is module-level state; challenge tests clear it in `beforeEach`.
- Spending is recorded at signing time; two racing auto-approvals could slightly overshoot the window cap (known limitation; a serialized operation queue in S5b fixes it).
- Tx history is read directly from the chains (per-chain `history.ts` fetchers), NOT from a backend. The old `VITE_INDEXER_URL` backend contract (`/api/v1/indexer/tx`) is not served by any deployed backend; chain modules under `src/core/chains/{stellar,solana,evm}/history.ts` fetch Horizon / Solana devnet / EVM RPC and are dispatched by `indexer-service.ts`.
- The `remember` plugin's autonomous saves have been flaky; this file is the manual checkpoint.

## S5c — PIN-gated grant creation

- `vap.grant.resolve` payload gains optional `pin`; background verifies via
  `verifyUserPin` when `security.status.pinEnabled` before settling the waiter
  (VAP-01). Wrong/missing PIN → BAD_REQUEST, grant uncreated.
- `GrantApproval.tsx` shows a PIN field after the 3s hold when a PIN is
  configured; the approve button gates only the ready state (first click must
  start the countdown). Store `resolvePendingGrantRequest(id, action, pin?)`.
- Settings-path grant creation is NOT PIN-gated (user is in their own trusted
  settings surface). WebAuthn-auth ceremony is a follow-up (needs real browser
  gestures; can't be unit-tested).
- Gotcha: `approveDisabled` must not disable the idle-state button when PIN is
  required, or the countdown can never start.

## S5d — WebAuthn grant confirmation (VAP-01 complete)

- `core/vap/confirmation.ts`: pure `requireGrantConfirmation` gate (PIN-first,
  WebAuthn fallback, none → hold only). Protocol `security.webauthn.challenge`;
  `vap.grant.resolve` carries `webauthn` flag; background gates before settling.
- `GrantApproval.tsx` runs the passkey ceremony after the 3s hold when
  WebAuthn-only (`navigator.credentials` is UI-context; flag over privileged
  resolve). Gotcha: exactOptionalPropertyTypes forbids passing undefined to an
  optional key — build attempt objects conditionally.

## Audit view + stealth foundation

- `AuditView.tsx` (Settings → Audit): lists ledger entries, verifies the hash
  chain, exports JSON. Uses `exportAudit`/`verifyAuditChain` directly (settings
  has IndexedDB access — no protocol changes).
- `core/privacy/stealth.ts`: §5.1 scheme — `generateStealthMeta`,
  `deriveStealthAddress` (ECDH e·viewPub → H(S); address = spendPub + H(S)·G),
  `recoverStealthSpendKey` (receiver), `stealthAddressToEvm`. Uses
  `secp256k1.ProjectivePoint` (noble-curves 1.9 has no `Point` static).

## Next steps (Phase 3)

- **S6 continued**: stealth announcements + scanner, encrypted notes (3.18-3.20);
  stealth x402 wiring (3.22).
- **VAP remainder**: OperationService state machine + durable queue (3.2);
  gas policy (3.17).
- **Phase 2 leftovers**: WalletConnect v2 (2.12); a few store-slice wirings (2.14).
- **High risk**: repo now has git history on main (5 commits). Consider a remote/backup.
