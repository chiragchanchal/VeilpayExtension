# Veilpay Extension — Testing Strategy

**Version:** 1.0
**Last Updated:** 2026-08-08
**Status:** Planning document. No tests exist yet.

---

## 1. Testing Philosophy

This is a wallet. A bug does not degrade the experience — it loses money or leaks keys. So the test strategy is weighted differently from a normal frontend project:

| Layer | Normal web app | Veilpay extension |
|---|---|---|
| Unit | 60% | 45% |
| Integration | 30% | 35% |
| E2E | 10% | 15% |
| **Adversarial / property** | ~0% | **5%** |

That last row is the difference. We explicitly test that things *cannot* happen — that caps cannot be exceeded, that keys cannot cross a boundary, that mainnet shielded ops are unreachable. Negative tests carry as much weight as positive ones.

**Rule:** any code path that moves value or touches key material requires a test that asserts the *failure* case, not just the success case.

---

## 2. Tooling

| Purpose | Tool | Rationale |
|---|---|---|
| Unit + integration | **Vitest** | Native Vite integration, fast, ESM-first |
| Component rendering | `@testing-library/react` | Behavior-driven, matches mobile repo choice |
| E2E (extension) | **Playwright** | Only runner with real MV3 extension loading |
| Property tests | `fast-check` | Cap arithmetic, amount math, serialization round-trips |
| Chain mocking | `viem` test client + Anvil | Real EVM semantics, deterministic |
| Solana mocking | `solana-test-validator` | Real program semantics locally |
| Stellar mocking | Stellar testnet + Horizon fixtures | No local validator; recorded fixtures |
| Coverage | `@vitest/coverage-v8` | Thresholds enforced in CI |
| Mutation testing | **Stryker** (Phase 4, crypto/VAP only) | Coverage lies; mutation testing doesn't |

---

## 3. Unit Tests

### 3.1 Coverage Thresholds (enforced, build-failing)

| Path | Line | Branch | Rationale |
|---|---|---|---|
| `src/services/vault/**` | 95% | 90% | Holds keys |
| `src/services/vap/**` | 95% | 90% | Holds spend authority |
| `src/services/x402/**` | 90% | 85% | Moves money |
| `src/services/privacy/**` | 90% | 85% | Privacy correctness |
| `src/services/blockchain/**` | 85% | 80% | Chain interaction |
| `src/stores/**` | 85% | 80% | State correctness |
| `src/utils/**` | 90% | 85% | Widely depended on |
| `src/components/**` | 70% | 60% | Visual, lower risk |
| **Global floor** | 80% | 75% | — |

### 3.2 Vault & Crypto

```typescript
describe('EncryptionService', () => {
  it('produces a distinct IV per encryption of identical plaintext');
  it('fails to decrypt when the ciphertext is bit-flipped (GCM auth)');
  it('fails to decrypt with a wrong passphrase, without revealing which byte differed');
  it('uses >= 600_000 PBKDF2 iterations');
  it('generates a 32-byte random salt per vault, never reused');
});

describe('VaultService', () => {
  it('persists only ciphertext, iv, salt, kdfParams, version');
  // negative test — this is the important one
  it('has no code path that writes a plaintext mnemonic to IndexedDB', () => {
    const record = vault.serialize(mnemonic, kek);
    const json = JSON.stringify(record);
    expect(json).not.toContain('abandon');        // BIP39 test word
    expect(Object.keys(record)).toEqual(
      expect.not.arrayContaining(['mnemonic', 'plaintext', 'seed', 'hint'])
    );
  });
  it('zeroizes the key buffer after withKey() returns');
  it('zeroizes the key buffer even when the callback throws');
});

describe('KeyDerivationService', () => {
  it('derives known EVM address from BIP39 test vector');   // fixed vectors
  it('derives known Solana address from BIP39 test vector');
  it('derives known Stellar address from BIP39 test vector');
  it('rejects invalid mnemonic checksums');
  it('rejects 11-word and 13-word inputs');
});
```

**BIP39/BIP44 test vectors are non-negotiable.** Derivation must be verified against published vectors, not against our own implementation's output. Self-consistency proves nothing.

### 3.3 VAP Grants & Caps — Property Tests

Cap arithmetic is where a subtle bug becomes an unbounded drain. This gets property testing, not example testing.

```typescript
import fc from 'fast-check';

describe('requiresApproval — properties', () => {
  it('never auto-approves above maxPerOperation', () => {
    fc.assert(fc.property(
      arbGrant(), arbOperation(), fc.bigUintN(64),
      (grant, op, spent) => {
        const d = requiresApproval(grant, op, spent);
        if ((op.amount ?? 0n) > grant.caps.maxPerOperation) {
          return d.deny === true;
        }
        return true;
      }
    ));
  });

  it('never allows cumulative spend to exceed maxPerWindow', () => {
    fc.assert(fc.property(
      arbGrant(), fc.array(arbOperation(), { maxLength: 50 }),
      (grant, ops) => {
        let spent = 0n;
        for (const op of ops) {
          const d = requiresApproval(grant, op, spent);
          if (d.deny) continue;
          spent += op.amount ?? 0n;
        }
        return spent <= grant.caps.maxPerWindow;
      }
    ));
  });

  it('secret.reveal is never auto-approved, for any grant configuration', () => {
    fc.assert(fc.property(arbGrant(), (grant) => {
      const d = requiresApproval(grant, { type: 'secret.reveal' } as Operation, 0n);
      return d.approve !== 'auto';
    }));
  });

  it('a revoked grant denies every operation', () => {
    fc.assert(fc.property(arbGrant(), arbOperation(), (g, op) =>
      requiresApproval({ ...g, revokedAt: Date.now() }, op, 0n).deny === true
    ));
  });

  it('no arithmetic path overflows or produces negative spend');
});
```

### 3.4 Audit Ledger

```typescript
describe('AuditLedger', () => {
  it('links each entry to the previous hash');
  it('detects a mutated entry during chain verification');
  it('detects a deleted entry during chain verification');
  it('detects a reordered entry during chain verification');
  // the redaction test
  it('never records key material, for any input', () => {
    const entry = ledger.build({ /* op containing secrets */ });
    const json = JSON.stringify(entry);
    for (const forbidden of [mnemonic, privKeyHex, nullifierPreimage, pin]) {
      expect(json).not.toContain(forbidden);
    }
  });
});
```

### 3.5 x402 Challenge Validation

Every one of these is a negative test. That's the point.

```typescript
describe('validateChallenge', () => {
  it('rejects an expired challenge');
  it('rejects a reused nonce');
  it('rejects a chain outside the grant allowlist');
  it('rejects when resource origin !== page origin');
  it('rejects a malformed payTo for the declared chain');
  it('rejects amount > maxPerOperation');
  it('rejects a challenge over http://');
  it('accepts a well-formed challenge');   // exactly one positive case
});
```

### 3.6 Privacy Services

```typescript
describe('StealthService', () => {
  it('derives the same shared secret from both sides of ECDH');
  it('produces a distinct one-time address per ephemeral key');
  it('lets the recipient recover the spend key from viewPriv + ephemeralPub');
  it('yields addresses that are unlinkable without viewPriv');
  it('never returns viewPriv or spendPriv from a public method');
});

describe('EncryptedNoteService', () => {
  it('round-trips a note through encrypt/decrypt');
  it('fails closed on a tampered ciphertext (GCM)');
  it('does not throw an unhandled error when decryption fails');  // graceful fallback
});

describe('ZKProofService', () => {
  it('generates a proof accepted by the verifier for valid inputs');
  it('produces a proof rejected by the verifier for a wrong nullifier');
  it('runs in a Worker without blocking the main thread');
  it('refuses to run against any mainnet chain id');   // VAP-12
});
```

---

## 4. Integration Tests

Real stores, real services, mocked chain and mocked `chrome.*`.

### 4.1 Wallet Lifecycle

| Test | Assertion |
|---|---|
| Create → lock → unlock | Same addresses derived; vault decrypts once |
| Create → wrong passphrase ×5 | Rejected each time; no lockout bypass; no oracle leak |
| Import → derive all three chains | Addresses match BIP39 vectors |
| Unlock → idle 15min | Auto-locks; KEK gone; keys unrecoverable without re-auth |
| Unlock → agent polls for 20min | **Still locks.** Agent traffic never extends the session |
| Unlock → SW terminated | Returns to locked; no operation stuck |

### 4.2 Send Flow (per chain)

```
fund testnet account → build tx → estimate fee → confirm → sign → broadcast
  → assert: pending in store
  → mine/confirm
  → assert: confirmed in store, balance decremented, audit entry written
```

Run for Sepolia (Anvil), Solana devnet (local validator), Stellar testnet (fixtures).

### 4.3 VAP Operation Machine

| Test | Assertion |
|---|---|
| Submit under threshold, autonomous grant | Auto-approves; no prompt shown |
| Submit above threshold | Enters `awaitingApproval`; prompt shown |
| Submit, then revoke grant before approval | Denied — revocation wins the race (VAP-04) |
| Submit, then lock wallet | Operation cancelled (VAP-10) |
| Submit 51 ops against a 50-op window cap | Op 51 denied deterministically (VAP-03) |
| Every transition | Exactly one audit entry; chain verifies (VAP-05) |

### 4.4 x402 Round-Trip (Consumer)

Against a local reference 402 server:

```
page fetch → 402 + challenge
  → interceptor parses
  → grant matched
  → [auto-approve path] sign → X-PAYMENT → replay → 200
  → [approval path] overlay → WebAuthn mock → sign → replay → 200
  → assert: spend counter incremented, audit entry, nonce burned
  → replay the same X-PAYMENT header → assert: server rejects (X2)
```

### 4.5 x402 Provider

| Test | Assertion |
|---|---|
| Generate challenge template | Valid JSON, correct `payTo`, correct chain |
| Verification snippet validates a real payment | Passes with **zero Veilpay network calls** (VAP-07) |
| Verification snippet rejects a replayed voucher | Nullifier store catches it |
| Only the highest monotonic voucher settles | Lower vouchers rejected |
| Channel expiry → unilateral close | User reclaims remainder |

### 4.6 Privacy Integration

| Test | Assertion |
|---|---|
| Stealth x402, 10 payments to one service | 10 distinct recipient addresses (VAP-09) |
| Provider scans announcements | Recovers all 10 payments with viewPriv |
| `requirePrivate` grant + `transfer.public` | Rejected (VAP-08) |
| Private state unsynced | State-changing private ops paused, readiness screen shown |
| Shielded op with mainnet chain id | Unreachable — throws at config layer (VAP-12) |

### 4.7 DApp Provider

| Test | Assertion |
|---|---|
| `eth_requestAccounts` from new origin | Prompts; returns address only after approval |
| Same origin, second call | No prompt; permission remembered |
| Different origin reusing origin A's grant | Rejected (A6) |
| `eth_sendTransaction` | Overlay shows decoded values from payload, not page strings |
| `personal_sign` with EIP-191 vectors | Signature matches known-good vectors |
| `wallet_switchEthereumChain` to a non-allowlisted chain | Rejected |

---

## 5. E2E Tests (Playwright)

Real Chrome, real extension load, real user interaction.

```typescript
// tests/e2e/fixtures.ts
export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const ctx = await chromium.launchPersistentContext('', {
      headless: false,          // MV3 extensions require headed
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
      ],
    });
    await use(ctx);
    await ctx.close();
  },
  extensionId: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    await use(new URL(sw.url()).host);
  },
});
```

### 5.1 Critical Journeys

| # | Journey | Gate |
|---|---|---|
| E1 | Install → onboard → create wallet → verify seed → set PIN → dashboard | Blocks release |
| E2 | Receive testnet funds on all 3 chains → balances update | Blocks release |
| E3 | Send on all 3 chains → confirm → history reflects | Blocks release |
| E4 | Lock → unlock via PIN → state intact | Blocks release |
| E5 | Idle 15min → auto-lock → re-auth required | Blocks release |
| E6 | Connect to testnet dapp → sign a transaction | Blocks release |
| E7 | Visit 402-gated page → overlay → approve → content unlocks | Blocks release |
| E8 | Create grant → agent submits 3 ops → 2 auto, 1 prompts | Blocks release |
| E9 | Revoke grant → next agent op denied | Blocks release |
| E10 | Stealth send on Sepolia → recipient scans and claims | Blocks release |
| E11 | Export private key → passphrase + WebAuthn → clipboard clears | Blocks release |
| E12 | Add custom network → test RPC → send on it | Non-blocking |
| E13 | Address book CRUD + JSON export/import | Non-blocking |
| E14 | Theme toggle, dark ↔ light, all screens | Non-blocking |

### 5.2 Adversarial E2E

These simulate attacks. They must fail to succeed.

| # | Attack simulated | Expected outcome |
|---|---|---|
| A-E1 | Page tries to read `window.veilpay` internals for keys | No key material reachable from page context |
| A-E2 | Page spams `requestGrant` 20× in 10s | Rate-limited, auto-denied, block-origin offered |
| A-E3 | Page displays "0.001 ETH", signs 10 ETH | Overlay shows **10 ETH** (from payload) |
| A-E4 | Page positions a decoy div over the overlay | Overlay unobscured; page cannot style it |
| A-E5 | Iframe from origin B uses origin A's grant | Rejected |
| A-E6 | Replay a captured `X-PAYMENT` header | Nonce burned; rejected |
| A-E7 | Page requests `secret.reveal` under an autonomous grant | Still prompts |
| A-E8 | Agent polls continuously to prevent idle lock | Wallet locks on schedule |

---

## 6. Manual Test Matrix

Some things resist automation.

| Area | Check |
|---|---|
| **WebAuthn** | Real platform authenticator (Touch ID / Windows Hello) — virtual authenticator in Playwright covers logic, not UX |
| **Hardware wallet** | Phase 5 — real Ledger/Trezor device |
| **Accessibility** | Screen reader pass (NVDA + VoiceOver), keyboard-only navigation of every flow |
| **Contrast** | Every screen, both themes, verified ≥4.5:1 with a contrast tool |
| **Popup dimensions** | 360×600 popup, side panel, full-page — no clipped content |
| **Real testnet** | Actual Sepolia/devnet/Stellar-testnet transactions, not mocks |
| **Chrome review readiness** | Permission justifications, store copy accuracy, privacy-policy alignment |

---

## 7. CI Pipeline

```yaml
# .github/workflows/ci.yml — shape, not final
jobs:
  static:
    - typecheck (tsc --noEmit)
    - lint (eslint)
    - format check (prettier)
    - secret-leak grep gate          # fails on key material in log/throw expressions
    - dependency audit (pnpm audit --audit-level high)

  unit:
    - vitest run --coverage
    - enforce per-path thresholds (§3.1)

  integration:
    - start Anvil + solana-test-validator
    - vitest run tests/integration

  build:
    - pnpm build
    - bundle-size gate (< 5MB gzip total)
    - manifest validation
    - CSP assertion (no unsafe-eval, no unsafe-inline scripts)
    - permission assertion (no <all_urls>, no webRequest, no tabs)

  e2e:
    - playwright install chromium
    - playwright test          # headed via xvfb
    - upload traces on failure

  gates:
    - assert mainnet chain allowlist is empty in Phase 1 build   # EXT-004
    - assert VAP acceptance criteria suite passes                # EXT-002
```

**Merge blockers:** static, unit, integration, build.
**Release blockers:** all of the above plus e2e and gates.

---

## 8. Test Data

| Kind | Source | Rule |
|---|---|---|
| Mnemonics | BIP39 published test vectors | Never a real user seed. Never a funded mainnet seed. |
| Addresses | Derived from test vectors | Documented as test-only in fixtures |
| Amounts | `fast-check` arbitraries + boundary values (0, 1, max) | Boundary cases explicit |
| x402 challenges | Fixture set: valid, expired, replayed, wrong-origin, malformed | One fixture per negative case |
| Chain state | Anvil snapshots, validator genesis, Horizon recordings | Deterministic, committed |

**Hard rule:** no test may use a mnemonic that controls mainnet funds. CI greps for known-funded addresses as a backstop.

---

## 9. Acceptance Criteria Traceability

Every criterion from `4_NATIVE_PAYMENT_LAYER_SPEC.md` §11 maps to a named test. Untested criteria are treated as unmet.

| ID | Criterion | Test |
|---|---|---|
| VAP-01 | Grant creation requires WebAuthn/PIN | integration: `vap/grant-creation.test.ts` |
| VAP-02 | `secret.reveal` always prompts | unit property + E2E A-E7 |
| VAP-03 | Window cap denies deterministically | unit property + integration §4.3 |
| VAP-04 | Revocation beats next submit | integration §4.3 + E2E E9 |
| VAP-05 | One audit entry per transition, chain verifies | unit §3.4 + integration §4.3 |
| VAP-06 | x402 consumer completes on Sepolia | integration §4.4 + E2E E7 |
| VAP-07 | Provider verification needs no Veilpay call | integration §4.5 |
| VAP-08 | `requirePrivate` rejects public op | integration §4.6 |
| VAP-09 | Stealth yields distinct address per payment | integration §4.6 + E2E E10 |
| VAP-10 | Lock cancels awaiting operations | integration §4.1, §4.3 |
| VAP-11 | No key material in logs/audit/DOM | unit §3.4 + CI grep gate + E2E A-E1 |
| VAP-12 | Shielded unreachable on mainnet | unit §3.6 + CI gate EXT-004 |

---

## 10. What This Strategy Does Not Cover

Named so they aren't mistaken for gaps we missed:

1. **External security audit** — a different activity from testing. SEC-011, Phase 5 gate.
2. **Trusted setup ceremony verification** — SEC-008. Cannot be tested into existence.
3. **Formal verification of circuits** — out of scope; circuits are inherited from `packages/circuits`.
4. **Load / scale testing** — a single-user extension has no meaningful load profile.
5. **Cross-browser (Firefox/Edge)** — Phase 5, when those targets exist.
6. **Fiat ramp flows** — excluded from scope.
7. **Mainnet SPP** — excluded from scope.

---

**Related:** `6_IMPLEMENTATION_ROADMAP.md`, `8_SECURITY_MODEL.md`, `4_NATIVE_PAYMENT_LAYER_SPEC.md`
