# Veilpay Extension — Quick Start Guide

**For:** Decision-makers, architects, and developers  
**Time to read:** 10 minutes  
**Objective:** Understand the full plan, know what to decide, and kick off Week 1

---

## TL;DR: What You're Building

A **Chrome extension wallet** (MetaMask class) that:

1. **Carries every mobile feature** except fiat ramps and mainnet SPP
2. **Adds native x402 agentic payments** — not integrated Paybox, but Veilpay's own payment substrate
3. **Wires privacy into agent payments** — stealth, encrypted notes, ZK shielded (testnet)
4. **Works standalone** — separate vault per device, no sync, no attack surface there
5. **Launches Q3 2026** on Chrome Web Store + GitHub (self-hosted)

---

## The Big Picture in 4 Diagrams

### 1. Architecture Layers (What Runs Where)

```
┌─────────────────────────────────────────────────────────┐
│              CHROME EXTENSION (MV3)                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐  ┌──────────────────┐            │
│  │  Popup UI       │  │  Options UI      │            │
│  │  (React 19)     │  │  (React 19)      │            │
│  └────────┬────────┘  └────────┬─────────┘            │
│           │                    │                      │
│  ┌────────┴──────────┬─────────┴─────────┐           │
│  │  Service Worker   │  Content Script   │           │
│  │  (Persistent)     │  (Per-tab)        │           │
│  └────────┬──────────┴─────────┬─────────┘           │
│           │                    │                      │
│  ┌────────┴────────────────────┴─────────┐           │
│  │  Zustand Store Layer (Redux-like)     │           │
│  │  ├─ walletStore                       │           │
│  │  ├─ transactionStore                  │           │
│  │  ├─ vapGrantStore (agents)            │           │
│  │  ├─ chainServiceStore                 │           │
│  │  └─ 4 more                            │           │
│  └────────┬────────────────────┬─────────┘           │
│           │                    │                      │
│  ┌────────┴──────────────┐  ┌──┴─────────────────┐  │
│  │  Service Layer        │  │  Vault & Crypto   │  │
│  │  ├─ EVM (viem)        │  │  ├─ Passphrase    │  │
│  │  ├─ Solana (web3.js)  │  │  ├─ WebAuthn      │  │
│  │  ├─ Stellar (sdk)     │  │  ├─ TweetNaCl     │  │
│  │  └─ VAP (agent)       │  │  └─ Web Crypto    │  │
│  └────────┬──────────────┘  └──┬─────────────────┘  │
│           │                    │                      │
│  ┌────────┴────────────────────┴─────────┐           │
│  │  Persistent Storage                   │           │
│  │  ├─ IndexedDB (encrypted state)       │           │
│  │  ├─ chrome.storage.sync (settings)    │           │
│  │  └─ SessionStorage (temp)             │           │
│  └───────────────────────────────────────┘           │
│                                                         │
└─────────────────────────────────────────────────────────┘
                         │
                         │ (RPC calls, agent requests)
                         ▼
    ┌──────────────────────────────────────────┐
    │  Blockchain RPC + Backend API            │
    │  (via veilpay backend + chain indexer)   │
    └──────────────────────────────────────────┘
```

### 2. x402 Agentic Payment Flow (What's Different)

```
Page makes x402 request
        │
        ▼
Extension detects (fetch XHR shim)
        │
        ▼
Popup overlay appears (extension-owned, page can't style)
        │
        ├─ Show: Service name, amount, privacyLevel, timeLimit
        ├─ Check: Against VAP grant (scoped per-service)
        ├─ Ask: Passkey approval if above threshold
        │
        ▼
User approves (or rejects)
        │
        ├──→ Denied: Return 402 to page (try again or pay)
        │
        └─→ Approved: Sign & submit
              │
              ├─ Simple payment: Direct RPC call
              ├─ Shielded payment: ZK proof + encrypted note
              │
              ▼
        Return signed receipt to page
              │
              ▼
        Page receives 402 success, proceeds
```

### 3. Privacy Layer Wiring (x402 + Stealth)

```
Normal payment (public):
  User → Service, amount visible on-chain

Stealth payment (private):
  User → creates ephemeral keypair
       → derives stealth address from service's public key
       → sends to stealth address
       → service scans, finds it via private key
       → on-chain: opaque (only service knows it's theirs)

x402 + Stealth:
  User approves x402 grant (agent X, amount cap, rate cap)
  Agent X makes payment request
  Extension intercepts, checks grant
  User (via passkey) approves single request
  Extension:
    ├─ Creates payment commitment (off-chain)
    ├─ If stealth: generates ephemeral keypair, derives stealth addr
    ├─ Sends tx (to stealth or normal addr per privacy setting)
    ├─ Stores encrypted note: {amount, agent, time, tx hash}
    └─ Returns receipt to agent

Service-side:
  Receives payment via x402 receipt
  If stealth: scans commitment stream, finds it via private key
  If encrypted note: can decrypt with service secret (if enabled)
  Agent: "thanks, here's your data" → resumes request
```

### 4. Team Streams (Parallel Work)

```
Week 1: Scaffold + CSP Spike (all streams)
        │
        ├─────────────────────────────────────────┐
        │                                         │
        ▼                                         ▼
Stream A: Vault & Store                Stream B: Chains & Privacy
├─ Passphrase vault                  ├─ EVM service (viem)
├─ WebAuthn setup                    ├─ Solana service (web3.js)
├─ Zustand hydration                 ├─ Stellar service + SPP testnet
├─ IndexedDB schema                  ├─ Privacy circuits (snarkjs)
├─ Session timeout                   ├─ VAP payment engine
└─ Key rotation (Phase 2)            └─ Privacy commitment store
   │                                    │
   └──────────┬──────────────────────────┘
              │
              ▼
        Stream C: UI & Test (Streams A & B paused)
        ├─ Port screens (20 mobile → extension)
        ├─ Build popup/options/onboarding
        ├─ Agent overlay frame
        ├─ E2E tests (Playwright)
        └─ Security audit prep
              │
              ▼
        Phase 4: Polish & Review
        ├─ Bundle audit & optimization
        ├─ Chrome Web Store submission
        ├─ Security review (external)
        └─ Release
```

---

## Feature Checklist: What Ships When

### Phase 1 (Weeks 2–5): Core Wallet
- [ ] Onboarding (create/import wallet)
- [ ] Home dashboard (balances, portfolio)
- [ ] Send/Receive (all chains)
- [ ] Transaction history
- [ ] Basic settings
- [ ] Passphrase vault + session timeout

### Phase 2 (Weeks 6–9): Privacy + VAP
- [ ] Stealth addresses (send stealth)
- [ ] Encrypted notes
- [ ] ZK shielded transfers (**if CSP spike succeeds**)
- [ ] VAP grant system (scoped, time-limited, amount-capped)
- [ ] x402 overlay (basic)
- [ ] Agent grant UI

### Phase 3 (Weeks 10–13): Extended Features
- [ ] WalletConnect support
- [ ] Address book
- [ ] Custom networks (EVM)
- [ ] Detailed tx view
- [ ] x402 payments (consumer side)
- [ ] Advanced settings

### Phase 4 (Weeks 14–17): Release
- [ ] x402 receiver channels (provider side)
- [ ] Bundle optimization
- [ ] Security audit + fixes
- [ ] Chrome Web Store submission
- [ ] GitHub release automation

### Phase 5+ (Deferred, Blocked)
- [ ] Mainnet SPP (blocked on SEC-008, SEC-011)
- [ ] Hardware wallet (Ledger/Trezor)
- [ ] MPC custody (partner decision)
- [ ] Virtual cards (partner decision)

---

## What You Need to Decide Right Now

| # | Decision | Impact | Your Answer |
|---|---|---|---|
| **D1** | Repo layout: standalone or inside monorepo? | Build speed, sync cost | ___ |
| **D2** | Accept 5MB gzip bundle limit? | Constrains architecture | ___ |
| **D3** | Spike snarkjs-under-CSP in Week 1? | **CRITICAL BLOCKER** | ___ |
| **D4** | x402 spec version target? | Integration surface | ___ |
| **D5** | Ship localhost agent bridge Phase 3, or defer? | Developer UX | ___ |
| **D6** | How many devs, and which streams? | Timeline/budget | ___ |
| **D7** | Approve $134k budget estimate? | Resource planning | ___ |

**→ Use `DECISION_CARD.md` to fill these in. Takes ~30 min.**

---

## Key Constraints & Tradeoffs

### You Get
✅ Full wallet (send/receive/history all chains)  
✅ Native x402 payments (not Paybox)  
✅ Privacy layer (stealth + encrypted notes + ZK testnet)  
✅ Agent grants (scoped, revocable, threshold-based)  
✅ Q3 2026 launch  
✅ Chrome Web Store + self-hosted  

### You Pay
❌ No fiat ramps (dropped 5 mobile screens)  
❌ No mainnet SPP (testnet only, blocked on audit)  
❌ No MPC custody (self-custody + optional Shamir shards)  
❌ Tighter permissions (slower x402 detection, but better security posture)  
❌ 5MB bundle budget (requires active optimization)  
❌ No localhost agents Phase 1 (Phase 5 deferred)  

### The Honest Risk
🚨 **snarkjs under MV3 CSP** — unknown until spiked (Week 1)  
🚨 **Bundle size** — tight, needs budget gate from day 1  
🚨 **Chrome review** — crypto wallets get scrutiny  
🚨 **Agent UX tuning** — thresholds matter; needs real usability test  

---

## How to Unblock Week 1

1. **Fill out `DECISION_CARD.md`** with your answers to D1–D7
2. **Send it back** (takes 30 min to fill, invaluable for accuracy)
3. **I scaffold immediately:**
   - Vite + React 19 + CRXJS
   - Manifest v3, design tokens ported
   - snarkjs spike (if D3 = yes)
   - Loadable in Chrome by end of week
4. **Stream A starts** on vault + stores (no blocker)

---

## File Structure: Where to Find What

```
Veilpayextension/
├─ 0_PLAN_INDEX.md                         ← You are here
├─ DECISION_CARD.md                        ← Fill this out (30 min)
├─ QUICK_START_GUIDE.md                    ← This file
│
├─ 1_EXECUTIVE_SUMMARY.md                  Why, scope, budget, timeline
├─ 2_DETAILED_PRD.md                       Every feature, every screen
├─ 3_ARCHITECTURE_DESIGN.md                Layers, flows, IPC, storage
├─ 4_NATIVE_PAYMENT_LAYER_SPEC.md          **x402 + VAP + privacy wiring**
├─ 5_UI_COMPONENT_MAPPING.md               Mobile screen → extension
├─ 6_IMPLEMENTATION_ROADMAP.md             17 weeks, 4 phases, critical path
├─ 7_FILE_STRUCTURE.md                     File tree, dependencies, build output
├─ 8_SECURITY_MODEL.md                     Trust boundaries, threat model
├─ 9_TESTING_STRATEGY.md                   Coverage gates, E2E, adversarial
│
└─ VEILPAY_REPOSITORY_DOCUMENTATION.md     Mobile monorepo reference
```

### Read in this order:
1. **This file** (you are here) — 10 min
2. **DECISION_CARD.md** — fill it out, 30 min
3. **1_EXECUTIVE_SUMMARY.md** — context, 15 min
4. **3_ARCHITECTURE_DESIGN.md** — how it works, 20 min
5. **4_NATIVE_PAYMENT_LAYER_SPEC.md** — the x402 magic, 30 min
6. Everything else as needed (deep dives per topic)

---

## Success Metrics (How We Know We Won)

| Metric | Target | How measured |
|--------|--------|---|
| **Launch date** | End of Q3 2026 | Calendar |
| **Chrome Web Store reviews** | ≥4.5 stars | App store |
| **Bundle size** | ≤5MB gzip | CI gate |
| **Time to approve payment** | ≤3 sec (avg) | Usability test |
| **Zero key loss** | No incident | Security audit + 6 mo. ops |
| **x402 compatibility** | ≥3 test agents | Integration test |
| **ZK proof time** | ≤5 sec (including prover setup) | Benchmark suite |
| **Privacy audit** | Pass SEC-011 | External report |

---

## Next Actions

### For You
1. **Read** this guide (✓ you just did)
2. **Decide** D1–D7 (use DECISION_CARD.md)
3. **Send back** completed card
4. **Confirm** Phase 1 feature set with team

### For Me
1. **Validate** your decisions against the plan
2. **Scaffold** repository (Vite + React + CRXJS)
3. **Run CSP spike** (snarkjs test)
4. **Generate** Phase 1 tasks for Jira/GitHub Issues
5. **Kick off** Stream A in Week 1

---

## Questions?

Before you decide:
- Anything in the plan unclear?
- Any constraints I missed?
- Any features I should have added?
- Any budget/timeline concerns?

**No decision is final until you approve it.** If anything feels off, ask now. Better to iterate on the plan than to discover it in week 8.

---

**Ready to build? Fill out DECISION_CARD.md and send it back.** 🚀
