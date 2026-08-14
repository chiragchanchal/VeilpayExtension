# Veilpay Extension — Plan Index & Open Decisions

**Version:** 1.0
**Last Updated:** 2026-08-08
**Status:** Phase 0 core built. 86 passing tests. Build compiles, bundles at 4.6% of budget. Onboarding UI still unconnected.

---

## 1. What This Plan Is

A complete, professional plan for **Veilpay Browser Extension** — a Chrome extension that works as a standalone wallet (MetaMask / Solflare class), carries every mobile-app feature except mainnet SPP and fiat ramps, adds native Paybox-class agent-payment capability, and wires **x402 agentic payments into the Veilpay privacy layer**.

Nine documents, read in order:

| # | Document | Answers |
|---|---|---|
| 1 | `1_EXECUTIVE_SUMMARY.md` | Why, scope, budget, timeline, success metrics |
| 2 | `2_DETAILED_PRD.md` | Every feature, every screen, every requirement |
| 3 | `3_ARCHITECTURE_DESIGN.md` | Layers, directory shape, data flow, IPC, storage |
| 4 | `4_NATIVE_PAYMENT_LAYER_SPEC.md` | **The differentiator** — VAP grants, x402 both ways, privacy wiring |
| 5 | `5_UI_COMPONENT_MAPPING.md` | Each mobile screen → its extension equivalent |
| 6 | `6_IMPLEMENTATION_ROADMAP.md` | 17 weeks, 4 phases, critical path, parallel streams |
| 7 | `7_FILE_STRUCTURE.md` | Concrete file tree, dependencies, build output |
| 8 | `8_SECURITY_MODEL.md` | Trust boundaries, agent threats, residual risks |
| 9 | `9_TESTING_STRATEGY.md` | Coverage gates, property tests, adversarial E2E |

Plus `VEILPAY_REPOSITORY_DOCUMENTATION.md` — the mobile monorepo reference this plan is built against.

---

## 2. The Core Decisions, Restated

Your answers, and what each one committed us to:

| Your answer | What it means in the plan |
|---|---|
| Browser extension | MV3, Chrome Web Store + self-hosted GitHub releases |
| Same chains as mobile | EVM + Solana + Stellar, three separate service layers |
| No mainnet SPP, testnet privacy OK | Mainnet shielded ops unreachable at the config layer, asserted by test (EXT-004) |
| x402 agentic payments | The headline feature, not a bolt-on |
| Both directions | Consumer (pay) and provider (charge), plus micropayment channels |
| Both OAuth and MCP | Reinterpreted — see §3.1 below, since we build rather than integrate |
| All three privacy layers | Stealth, encrypted notes, ZK shielded — all testnet-gated |
| Combination key management | Passphrase + WebAuthn + optional Shamir shards; hardware wallet Phase 5 |
| Separate wallet per device | No cross-device sync; no sync channel to attack |
| All 25+ screens | 20 direct ports, 5 excluded (fiat), 3 new (channels, x402 overlay, sessions) |
| Exclude fiat ramps | 5 mobile screens dropped |
| Page overlay for x402 | Extension-owned frame the page cannot style or obscure |
| React + Vite | CRXJS plugin, three entry points |
| Reuse Zustand | Same store shapes as mobile where they transfer |
| libp2p / TweetNaCl | Plus Web Crypto for AES-GCM, `@noble/secp256k1` for EVM |
| IndexedDB + localStorage | Sensitive → encrypted IndexedDB; settings only → `chrome.storage.local` |
| **Build Paybox features, do not integrate Paybox** | Zero calls to `paybox.sh`. Native subsystem: **Veilpay Agent Payments (VAP)** |
| Chrome Store + GitHub | Reproducible builds, published bundle hashes for parity |
| Session timeout | 15 min default, 5–60 configurable, agent traffic never extends it |
| Testnet first, mainnet planned | Phase 1 testnet; mainnet gated on SEC-008 + SEC-011 |

---

## 3. Where I Deviated From Your Answers, And Why

Three places. Each is a deliberate call I'd want you to confirm or overrule.

### 3.1 "Both OAuth and MCP" — reinterpreted

You said both, then said don't integrate Paybox. OAuth 2.1 and MCP-connector are *Paybox's* integration surfaces — they only make sense if you're calling Paybox. Since we're not, I mapped the intent to Veilpay-native equivalents:

- **OAuth-equivalent** → the grant negotiation flow (`requestGrant`), origin-bound, scoped, revocable. Same security properties, no external authorization server.
- **MCP-equivalent** → the agent tool surface: page-injected `window.veilpay.agent` (MVP) plus an opt-in loopback bridge for out-of-browser agents (Phase 3, off by default).

If you actually wanted the extension to be an OAuth *provider* that third-party apps authenticate against, that's a different and larger build. Tell me and I'll spec it.

### 3.2 Two Paybox capabilities we cannot build

Stated plainly rather than quietly omitted:

| Capability | Why not | Where it lands |
|---|---|---|
| **MPC custody** | Requires an MPC network. Cannot be replicated in-extension. | Phase 6, partner decision. Substitute: self-custody + optional 2-of-3 Shamir shards. |
| **Virtual payment cards** | Requires a card issuer and PCI DSS scope. | Phase 6, partner decision. |

Everything else Paybox does — scoped grants, threshold approval, submit/approve/poll, audit trail, gas top-ups, x402 — is in the plan as first-party Veilpay code.

### 3.3 Permissions narrower than convenience wants

I rejected `<all_urls>`, `webRequest`, and `tabs`. That costs some x402 auto-detection smoothness — we detect via a fetch/XHR shim on `activeTab` instead of intercepting every request on every site.

The trade: an extension compromise reads *the page you clicked on*, not *every page you visit*. It also materially improves Chrome review odds for a crypto wallet. I think this is right, but it is a UX cost and you should know you're paying it.

---

## 4. Resolved Decisions

All 7 decisions from the original plan are now resolved.

| # | Decision | Resolution | Notes |
|---|---|---|---|
| D1 | Repo layout | (a) Standalone repo | Standalone, not monorepo. Imports are local copies, not shared packages. Design tokens and circuit artifacts must be vendored by hand. |
| D2 | Bundle budget | **5 MB confirmed** | Measured 238 KB gzip, 4.6% used. Original SDK-worry was void — chain services use bare `fetch` wrappers, not SDK bundles. ZK proves may hit budget independently. |
| D3 | snarkjs under MV3 CSP | **Probe written and wired** — unexecuted | Runs in offscreen doc. Reports `viable / blocked-csp / proof-failed / untested-artifacts / unavailable`. Currently `untested-artifacts` because `.wasm` + `.zkey` are not vendored. Needs a browser load to answer the CSP question. |
| D4 | x402 spec version | **`x402-foundation/x402` tag `v1` (`ed97e2c`, 2025-12-09)** | Proposed pin, awaiting approval. Uses `X-PAYMENT` header (not `PAYMENT-SIGNATURE` — `main` has diverged). Challenges in JSON body, payments in base64 header. EIP-712 signing is net-new work. |
| D5 | Local agent bridge | **Deferred to Phase 5** | Page-injected `window.veilpay.agent` covers in-browser agents. Loopback bridge off the table for MVP. |
| D6 | Team shape | **Solo serial** | I work one stage at a time. Roadmap reordered as S1–S7 sequence, each ending demonstrable. |
| D7 | Budget | **Reset — not approved** | ~1,100h / ~$134k was sized for three humans. With one agent it has no referent. Replaced with stage-gate model: each S stage passes before the next starts, measured in gates cleared rather than hours. |

---

## 5. What I Verified vs. What I Assumed

Being precise about this, since the plan reads as more certain than it should.

**Verified** — read directly from the repository:
- Monorepo structure, workspace layout, package boundaries
- Consumer app directory tree (`components/`, `screens/`, `stores/`, `services/`, …)
- Design tokens: exact colors (`#F59E0B` accent, `#0A0A0A` dark surfaces), Manrope/Inter/JetBrainsMono, spacing scale, radii
- Store names (8 Zustand stores) and screen names (25+)
- Tech stack versions: React 19.2.0, viem 2.50.4, `@solana/web3.js` 1.91.0, `@stellar/stellar-sdk` 14.6.1, Node 20.11.0, pnpm 9
- Security gates SEC-008 (ceremony) and SEC-011 (audit) as open blockers
- Circuit set: withdraw, transfer, merkleProof, commitmentHash

**Assumed** — inferred, not confirmed:
- Internal implementation of individual mobile services (I read names and structure, not every file body)
- That `packages/circuits` proving artifacts will port to a browser Worker — **this is the biggest unverified assumption in the plan** (D3)
- Exact backend/indexer API request and response shapes
- x402 spec details, since the spec is still moving
- All effort estimates

**Not verified at all — cannot be answered in a headless environment:**
- Whether snarkjs runs under the real MV3 CSP in a loaded extension (D3)
- Whether the offscreen document's dynamic import of snarkjs survives Chrome's module loader
- Connection to any real blockchain RPC endpoint

---

## 6. The Honest Risk Summary

Four things could actually derail this. Ranked by expected damage.

1. **snarkjs may not run under MV3 CSP.** Would remove shielded transactions from the extension entirely. Spike it in week 1. (D3)
2. **Bundle size.** Three chain SDKs plus a proving system in an extension is genuinely tight. Mitigated by code-splitting and a CI budget gate from day one, but it constrains architecture throughout.
3. **Chrome Web Store review.** Crypto wallets get scrutiny. Minimized permissions and an early review-only submission in week 15 are the mitigations. A rejection costs 2–4 weeks.
4. **Agent-payment UX.** If threshold tuning is wrong, users either get prompt-spammed or auto-approve things they shouldn't. Needs a real usability test in week 13, not a guess.

And one thing that is *not* a risk but is a constraint people forget: **prompt injection against an LLM agent is not solvable at the wallet layer.** The wallet bounds the damage via caps and allowlists. It does not prevent a compromised agent from spending what you authorized it to spend. Any marketing copy that implies otherwise would be false.

---

## 7. Immediate Next Steps

Current stage:

0. **Phase 0 core is built.** Vault (AES-256-GCM + PBKDF2-SHA512, BIP39/BIP44), session service, message bus with Zod-validated routing and handler enforcement, chain services (EVM/Solana/Stellar via bare `fetch`), router with privileged-kind origin check. All 4 missing handlers (`vault.create`, `vault.unlock`, `vault.reset`, `mnemonic.generate`) are wired. 86 tests pass. No git history exists — repo is not version-controlled.

1. **Onboarding UI** (popup → create → verify → passphrase → unlock flow). The store actions exist; no React component calls them. This is the next deliverable that makes the wallet usable end to end.

2. **D3 needs a browser load.** The probe compiles and is wired to the offscreen document, but circuit artifacts are not vendored and the extension has never run in Chrome. Someone needs to load `dist/` in a real browser to answer the CSP question definitively.

3. **D4 pin needs approval.** x402-foundation/x402 tag `v1` commit `ed97e2c` (2025-12-09) is proposed. Anything built against it uses `X-PAYMENT` header with JSON body challenges. If you want `main`'s newer header names (`PAYMENT-SIGNATURE`/`PAYMENT-REQUIRED`), say so now.

4. **`npm run package` is broken.** `scripts/package-extension.mjs` does not exist. It is Phase 4 work (week 17), so not blocking. Flagged so you know.

---

## 8. Document Conventions

- All money amounts in specs are **minor units as `bigint`**, never floats
- All privacy features carry a testnet + unaudited banner, non-negotiable
- Acceptance criteria are `VAP-nn` (payment layer) and `EXT-nnn` (extension gates); untested criteria count as unmet
- Anything marked Phase 5 is blocked on SEC-008 or SEC-011
- Anything marked Phase 6 is blocked on a third-party partner, not on engineering

---

**Files in this plan:**

```
1_EXECUTIVE_SUMMARY.md              Why, scope, budget, metrics
2_DETAILED_PRD.md                   Features, screens, requirements
3_ARCHITECTURE_DESIGN.md            Layers, flows, IPC, storage
4_NATIVE_PAYMENT_LAYER_SPEC.md      VAP + x402 + privacy wiring
5_UI_COMPONENT_MAPPING.md           Mobile screen → extension screen
6_IMPLEMENTATION_ROADMAP.md         17 weeks, 4 phases, critical path
7_FILE_STRUCTURE.md                 File tree, deps, build output
8_SECURITY_MODEL.md                 Trust boundaries, threats, residuals
9_TESTING_STRATEGY.md               Gates, property tests, adversarial E2E
VEILPAY_REPOSITORY_DOCUMENTATION.md Mobile monorepo reference
```
