# Veilpay Extension — Decision Card (Resolved)

**Last Updated:** 2026-08-09

---

## D1: Repo Layout
**Chosen:** Standalone repo (a)

The extension lives in this directory as its own repo. No shared packages or design tokens from the mobile monorepo — they are vendored locally. This means circuit artifacts (`.wasm` + `.zkey`) must be copied in, and any token changes on mobile need manual sync here.

---

## D2: Bundle Size Budget
**Chosen:** 5 MB confirmed

Measured at 238 KB gzip (4.6% of budget) as of Phase 0. The original worry about three chain SDKs was void — the chain services use bare `fetch` wrappers, not heavy SDK bundles. ZK proving keys (`.zkey` files) may push past budget independently.

---

## D3: snarkjs Under MV3 CSP
**Chosen:** Probe written and wired to offscreen document. Unexecuted.

State: the probe exists in `src/spike/csp-zk-probe.ts`, the offscreen document in `src/offscreen/index.ts` runs it and sends results via `chrome.runtime.sendMessage`. The protocol stores results as a `ZkProbeStatus` discriminant: `viable / blocked-csp / proof-failed / untested-artifacts / unavailable`. Currently `untested-artifacts` — circuit files are not vendored. The CSP question (does `'wasm-unsafe-eval'` suffice?) can only be answered by loading `dist/` in a real Chrome browser.

---

## D4: x402 Spec Version
**Chosen:** Research and propose a pin (awaiting approval)

Proposed: **`x402-foundation/x402` tag `v1`**, commit `ed97e2c11032bd74d77e246060bc077940be4481`, dated 2025-12-09.

Key findings:
- The upstream moved from `coinbase/x402` to `x402-foundation/x402`.
- At tag `v1`: challenges in HTTP 402 JSON body, payment in **`X-PAYMENT`** header, settlement in **`X-PAYMENT-RESPONSE`** header. Matches our plan.
- On `main` the headers have already changed to `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`.
- `exact`/EVM scheme requires EIP-712 typed-data signing via `transferWithAuthorization` — no signing module exists yet.
- `batch-settlement` scheme at `main` covers what our roadmap calls `PaymentChannelService` — adopting upstream may be simpler than inventing a voucher format.

---

## D5: Local Agent Bridge
**Chosen:** Defer to Phase 5

Page-injected `window.veilpay.agent` covers in-browser agents. The loopback bridge on localhost is the highest-risk surface in the design for the least MVP value. Disabled for the initial release.

---

## D6: Team Shape
**Chosen:** Solo serial

The original 3-stream parallel plan is replaced with a serial S1–S7 sequence. Each stage lands demonstrable before the next begins. Critical path reordering: x402 always-prompt ships before VAP grants, since grants exist to remove prompts and building them first is backwards.

---

## D7: Budget Confirmation
**Chosen:** Reset — not approved

The original estimate (~1,100 hours / ~$134k at $120/hr) was sized for three human developers. With one agent it has no referent. Replaced with stage-gate model: each S stage must pass before the next starts, measured in gates cleared rather than billable hours or calendar weeks.
