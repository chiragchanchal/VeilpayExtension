# Veilpay Extension — Complete Plan Summary

**Created:** 2026-08-08  
**Status:** ✅ Planning complete. Ready for implementation decisions.

---

## 📊 Plan Completion Snapshot

| Aspect | Status | Document |
|--------|--------|----------|
| **Executive Vision** | ✅ Complete | `1_EXECUTIVE_SUMMARY.md` |
| **Feature Spec** | ✅ Complete | `2_DETAILED_PRD.md` |
| **Technical Architecture** | ✅ Complete | `3_ARCHITECTURE_DESIGN.md` |
| **x402 Payment System** | ✅ Complete | `4_NATIVE_PAYMENT_LAYER_SPEC.md` |
| **UI Mapping** | ✅ Complete | `5_UI_COMPONENT_MAPPING.md` |
| **Development Roadmap** | ✅ Complete | `6_IMPLEMENTATION_ROADMAP.md` |
| **File Structure** | ✅ Complete | `7_FILE_STRUCTURE.md` |
| **Security Model** | ✅ Complete | `8_SECURITY_MODEL.md` |
| **Testing Strategy** | ✅ Complete | `9_TESTING_STRATEGY.md` |

---

## 🎯 What You're Building

**Veilpay Browser Extension** — a Chrome extension wallet that combines:

1. **Full mobile feature parity** (25+ screens, all chains: EVM + Solana + Stellar)
2. **Privacy layer** (stealth addresses, encrypted notes, ZK shielded transactions — testnet only)
3. **Native x402 agent-payment system** (no Paybox integration; Veilpay Agent Payments = VAP)
4. **Both payment directions** (pay agents, receive payments for your own services)

---

## 💰 Budget & Timeline

| Metric | Value |
|--------|-------|
| **Total Duration** | 17 weeks (≈4.25 months) |
| **Effort** | ~1,100 hours (~$134k at $120/hr) |
| **Team** | 3 parallel streams (Frontend, Core Services, Testing/DevOps) |
| **Launch** | Phase 1 (testnet) Week 8; Phase 2 (feature complete) Week 17 |
| **Chrome Web Store** | Week 15 submission; Week 17 live (pending review) |

---

## 🔑 Seven Critical Open Decisions

**These must be decided before implementation starts.**

| # | Decision | Impact | My Recommendation |
|---|----------|--------|-------------------|
| **D1** | **Repo layout** | Where code lives | (b) New app inside existing `VEILPAY-APP` monorepo — reuse `packages/shared`, design tokens |
| **D2** | **Bundle budget** | Code size limit | 5MB gzip total. If too tight, we defer lazy-load per chain to Phase 2. |
| **D3** | **snarkjs under MV3** | Can ZK proofs run? | **SPIKE IN WEEK 1** — this is the highest risk. If CSP blocks it, ZK slips to Phase 5. |
| **D4** | **x402 spec target** | Which version? | Name the exact x402 spec revision you're targeting. |
| **D5** | **Local agent bridge** | Phase 3 feature | I recommend **defer to Phase 5**. High risk, low MVP value. |
| **D6** | **Team headcount** | Parallel work | Confirm 3 people. One developer = ~30 weeks serial, not 17. |
| **D7** | **Budget confirmation** | Cost estimate | $134k / 1,100 hours is from reading the mobile repo, not measurement. Confirm or reset. |

**→ Section 4 in `0_PLAN_INDEX.md` has the full table.**

---

## 🏗️ Architecture at a Glance

```
┌─────────────────────────────────────────────────────────┐
│  Chrome Extension (MV3)                                  │
│                                                          │
│  ┌──────────────────┐        ┌──────────────────┐       │
│  │  UI / React      │        │  Content Script  │       │
│  │  (popup, panel)  │ ←──────│  (page overlay)  │       │
│  └──────────────────┘        └──────────────────┘       │
│         ↓                                                │
│  ┌──────────────────────────────────────────────┐       │
│  │  Background Service Worker                   │       │
│  │  ├─ Vault (keys, mnemonics, secrets)        │       │
│  │  ├─ Stores (Zustand)                        │       │
│  │  ├─ VAP Agent Payment Layer                 │       │
│  │  ├─ Chain Services (EVM, Solana, Stellar)   │       │
│  │  ├─ Transaction Queue                       │       │
│  │  └─ Session / Auth Manager                  │       │
│  └──────────────────────────────────────────────┘       │
│         ↓                                                │
│  ┌──────────────────────────────────────────────┐       │
│  │  Storage Layer (IndexedDB + localStorage)    │       │
│  │  └─ Encrypted vault, settings, tx history   │       │
│  └──────────────────────────────────────────────┘       │
│         ↓                                                │
│  ┌──────────────────┐        ┌──────────────────┐       │
│  │  Backend API     │        │  Indexer         │       │
│  │  (Veilpay)       │        │  (Chain events)  │       │
│  └──────────────────┘        └──────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

**Key layers:**
- **Vault**: Passphrase + WebAuthn + optional Shamir 2-of-3 shards
- **VAP**: Veilpay Agent Payments — grants, submit/approve/poll, micropayment channels
- **Privacy**: Stealth (EVM), encrypted notes (all chains), ZK shielded (all chains, testnet)
- **Storage**: Sensitive data encrypted with derived keys; settings unencrypted in `chrome.storage.local`

---

## 📱 Screens & Features

**Ported from mobile (20 screens):**
- Onboarding, wallet creation/import, backup/verification
- Dashboard (balances, portfolio, history)
- Send / Receive / Deposit flows
- Transaction details, settings
- Address book, network config
- WalletConnect sessions

**New for extension (3 screens):**
- **Agent Payment Channels** — create/manage micropayment grants
- **x402 Page Overlay** — approve/deny agent requests in real-time
- **Session Manager** — active connections, grant revocation

**Excluded from extension (5 screens):**
- Fiat on/off ramps (Transak integration) — deferred to Phase 6

---

## 🔐 Security Guarantees

| Threat | Mitigation |
|--------|-----------|
| **Private keys leaked** | Stored encrypted in IndexedDB with AES-GCM; passphrase + WebAuthn required to derive |
| **Session hijack** | 15-min timeout, no persistence across browser restart (configurable 5–60 min) |
| **Agent overspending** | Grants capped per operation, per day; threshold approval for over-cap requests |
| **Prompt injection** | Wallet bounds damage via caps + allowlists; LLM compromise not walletable |
| **Shielded tx leaked** | Testnet-only, unaudited banner; all proofs verified before submission |
| **Cross-device sync attack** | No sync — separate wallet per device by design |

---

## 🧪 Testing Gates

Every phase must pass:

| Gate | Acceptance Criteria | Owner |
|------|-------------------|-------|
| **EXT-001** | Vault can encrypt/decrypt without leaking entropy | QA |
| **EXT-002** | Session timeout enforced; agent traffic doesn't extend | QA |
| **EXT-003** | x402 overlay cannot be styled/hidden by page | QA |
| **EXT-004** | Mainnet SPP unreachable at config layer | QA |
| **VAP-001** | Grant submit/approve/poll works end-to-end | QA |
| **VAP-002** | Micropayment channels work (fund, withdraw, settle) | QA |
| **EXT-PERF** | Bundle ≤ 5MB gzip; initial load ≤ 2s | QA |

---

## 📅 Implementation Phases

### Phase 0 (Week 1) — Spike & Scaffold
- **CSP spike**: Can snarkjs run under MV3? (blocker for Phase 5)
- **Scaffold**: Vite + React 19 + CRXJS, manifest v3, design tokens, CI with bundle gate

### Phase 1 (Weeks 2–8) — Core Wallet, Testnet, EVM Priority
- Vault + key management (passphrase + WebAuthn)
- Core stores (Zustand) ported from mobile
- EVM service + send/receive flows
- Basic transaction history
- Settings, address book, backup/recovery

### Phase 2 (Weeks 9–14) — Solana + Stellar + VAP Foundation
- Solana service layer
- Stellar service layer (no mainnet SPP)
- VAP (grant submission, in-extension approval)
- Transaction details, WalletConnect
- Privacy layer (stealth, encrypted notes, testnet ZK)

### Phase 3 (Week 15) — x402 Overlay & Polish
- Content script + page overlay for x402 requests
- Micropayment channels UI
- Session manager
- Chrome Web Store submission prep

### Phase 4 (Week 16–17) — QA, Hardening, Release
- Full E2E test suite
- Security review + penetration testing
- Bundle optimization
- Chrome Web Store review + release
- GitHub release (self-hosted build)

---

## 📦 Dependencies (Snapshot)

**From mobile, reused directly:**
- `React` 19.2, `React Native` (via `@react-native-web` for web components)
- `Zustand` (stores)
- `Zod` (validation)
- `viem` 2.50 (EVM)
- `@solana/web3.js` 1.91
- `@stellar/stellar-sdk` 14.6
- `libp2p` (crypto)
- `TweetNaCl.js` (signatures)

**New for extension:**
- `CRXJS` (React Vite plugin for MV3)
- `snarkjs` (ZK proving, if CSP allows)
- `@noble/secp256k1` (EVM signing)
- `Web Crypto API` (AES-GCM)
- `IndexedDB` / `sqlite-wasm` (persistence)
- `ethers-ens` (optional, ENS resolution)

---

## 🚀 Immediate Next Steps

1. **You answer D1–D7** (in `0_PLAN_INDEX.md`, §4)
   - D1: Monorepo or standalone?
   - D2: Confirm 5MB bundle budget?
   - D3: Want CSP spike in week 1?
   - D4: Name x402 spec version
   - D5: Defer local agent bridge?
   - D6: Confirm 3-person team?
   - D7: Confirm $134k budget estimate?

2. **I scaffold + spike** (Week 1)
   - Vite + React 19 + CRXJS boilerplate
   - snarkjs-under-CSP test
   - Design tokens ported
   - CI with bundle gate
   - → **Gives you a loadable extension + answer on the ZK blocker**

3. **Stream A launches** (Weeks 2–3)
   - Vault implementation (passphrase + WebAuthn)
   - Zustand stores from mobile
   - IndexedDB schema

4. **You can start coding** as soon as D1–D7 are answered and the scaffold is loaded in Chrome.

---

## 📂 Files in This Plan

```
Veilpayextension/
├── 0_PLAN_INDEX.md                            ← Start here
├── 1_EXECUTIVE_SUMMARY.md                     Why, scope, metrics
├── 2_DETAILED_PRD.md                          All features, all screens
├── 3_ARCHITECTURE_DESIGN.md                   Layers, flows, storage
├── 4_NATIVE_PAYMENT_LAYER_SPEC.md             VAP + x402 + privacy
├── 5_UI_COMPONENT_MAPPING.md                  Mobile → extension screen map
├── 6_IMPLEMENTATION_ROADMAP.md                17 weeks, 4 phases
├── 7_FILE_STRUCTURE.md                        Concrete directory tree
├── 8_SECURITY_MODEL.md                        Trust boundaries, threats
├── 9_TESTING_STRATEGY.md                      Gates, property tests
├── FINAL_PLAN_SUMMARY.md                      ← You are here
└── VEILPAY_REPOSITORY_DOCUMENTATION.md        Mobile monorepo reference
```

---

## ✅ Validation Checklist

Before you start coding, confirm:

- [ ] D1–D7 answered (open decisions finalized)
- [ ] Team confirmed (headcount, roles)
- [ ] Budget approved ($134k or reset)
- [ ] Chrome Web Store requirements reviewed
- [ ] Design tokens ported from mobile
- [ ] Monorepo access confirmed (if choosing D1=b)
- [ ] x402 spec revision locked
- [ ] Security audit firm selected (if needed before launch)
- [ ] Backend/Indexer API endpoints documented
- [ ] Privacy policy drafted (for Chrome Web Store)

---

## 🎬 Ready to Start

Once you've answered D1–D7, I can:

1. Create a new app in the monorepo or a standalone repo (your choice)
2. Run the CSP spike (week 1, gives you certainty on ZK)
3. Scaffold the extension with Vite + React 19 + CRXJS
4. Load it in Chrome and show you the empty wallet
5. Start building Stream A (vault + key management)

**The plan is detailed enough to code from. The architecture is proven (reuses mobile patterns). The timeline is realistic with 3 people. The biggest unknown is the CSP spike — that's why it's week 1.**

---

## 📞 Questions?

Each document has a "Questions?" section at the end. Read through them in order:

1. `0_PLAN_INDEX.md` — What is this? (you're reading it)
2. `1_EXECUTIVE_SUMMARY.md` — Why does this exist?
3. `2_DETAILED_PRD.md` — What does it do?
4. `3_ARCHITECTURE_DESIGN.md` — How is it built?
5. `4_NATIVE_PAYMENT_LAYER_SPEC.md` — How do payments work?
6. `5_UI_COMPONENT_MAPPING.md` — Which screens map where?
7. `6_IMPLEMENTATION_ROADMAP.md` — How long does it take?
8. `7_FILE_STRUCTURE.md` — Where does code live?
9. `8_SECURITY_MODEL.md` — What are the risks?
10. `9_TESTING_STRATEGY.md` — How do we verify?

Then come back with answers to D1–D7, and we build.

---

**Status:** ✅ **Plan complete. Awaiting your decisions on D1–D7.**
