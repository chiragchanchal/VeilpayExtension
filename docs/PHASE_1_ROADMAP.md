# Phase 1 Roadmap: Foundation & Spike

## Goal

Ship a working MVP with vault + message routing + CSP/ZK spike. No UI yet; all flows are programmatic + manual test.

## Scope

### Core Vault (DONE)
- [x] PBKDF2 key derivation from master seed
- [x] AES-GCM encryption at rest
- [x] IndexedDB storage
- [x] Lock/unlock lifecycle
- [x] Account derivation (HD wallet stub)

### Message Protocol (DONE)
- [x] Strongly typed Request/Response
- [x] Async client with correlation IDs
- [x] Background router with handler registry
- [x] Content ↔ Background bridge
- [x] Inpage script stub

### CSP/ZK Spike (DONE - Testable)
- [x] Ephemeral keypair derivation from session secret
- [x] Sign tx with ephemeral key
- [x] Range proof stub (emit proof object, no verification yet)
- [x] Return proof + sig to content script
- [x] Vitest harness with mocked crypto

### Scaffolding (DONE)
- [x] All directory structure
- [x] Vite + React + TypeScript config
- [x] Tailwind + PostCSS
- [x] ESLint + Prettier
- [x] Vitest + mocked chrome API
- [x] GitHub Actions CI (lint, typecheck, test, build)
- [x] Zustand stores (sliced, not yet wired)
- [x] React entry points (popup, side panel, options, offscreen)
- [x] HTML templates for all surfaces
- [x] Manifest v3 generation

## What's NOT in Phase 1

❌ **UI Components**: Buttons, forms, modals. (Stub in React for now; real components in Phase 2.)
❌ **Real ZK Proofs**: Using stubs that pass shape validation only.
❌ **dApp Integration**: No test landing page yet.
❌ **Transaction Broadcasting**: No RPC calls; tx is signed and returned to page.
❌ **Account Derivation UI**: No key creation wizard; use manual seed import + derivation in tests.
❌ **Privacy Routing**: No route hints or privacy groups yet.
❌ **Gas Estimation**: Return tx as-is; dApp handles gas.

## Next Steps (Phase 2)

### UI Layer
- [x] Build Popup component (onboarding, unlock, dashboard, send/receive/import, export-key modal)
- [x] Build Side Panel component (vault state, unlock, dashboard, connection approval)
- [x] Build Options component (SettingsLayout: general, security, networks, permissions, address book, transactions, session, about)
- [x] Wire Zustand stores to React components
- [x] TransactionHistoryView: chain filters, details modal, block-explorer link, CSV export

### Integration
- [x] Real dApp test landing page with `window.veilpay` calls (`dapp-demo.html`, dev server, exercises EVM + Solana provider surface)
- [x] Content script ↔ Inpage script messaging (postMessage)
- [x] Background ↔ UI messaging (chrome.runtime.onMessage)
- [x] Handle connection + transaction/signature approval flow end-to-end (pending requests, approval overlays, `tx.resolve`)
- [x] EVM dapp signing: `eth_sendTransaction` (incl. calldata), `personal_sign` (EIP-191)
- [x] Solana dapp signing: `signTransaction` (wire-format parse + fee-payer slot insert), `signMessage` (ed25519)
- [x] `wallet_switchEthereumChain` (EIP-1193 4902 for unsupported chains, `chainChanged` event, `wallet_addEthereumChain` → 4200)

### Security
- [ ] Password hashing (scrypt or bcrypt)
- [ ] Session timeout (15 min auto-lock)
- [ ] Private key in-memory only (no leaking to DevTools)
- [ ] CSP headers on all HTML pages

### Blockchain
- [ ] RPC client (ethers.js or ethcall)
- [ ] Account balance queries
- [ ] Transaction simulation (dry run)
- [ ] Multi-chain support (Ethereum + test networks)

### ZK (Conditional)
- [ ] Replace stub proofs with real range proofs (if CSP spike successful)
- [ ] Proof verification in background
- [ ] Privacy group routing

## Testing Checklist (Phase 1)

- [ ] Run `npm run build` without errors
- [ ] Run `npm run typecheck` — all pass
- [ ] Run `npm run lint` — no issues
- [ ] Run `npm run test:unit` — all pass (crypto, messaging, CSP spike)
- [ ] Manual: Load `dist/` into Chrome, verify manifest loads
- [ ] Manual: Open DevTools, check no CSP errors or network blocks
- [ ] Manual: Trigger vault unlock via console, verify IndexedDB encryption

## Local Development

```bash
# Install
npm install

# Watch + rebuild
npm run dev

# Run tests
npm run test:unit

# Build for extension load
npm run build

# Check sizes
npm run build:check-size
```

**Load unpacked**:
1. `chrome://extensions`
2. Enable "Developer mode"
3. "Load unpacked" → `dist/`
4. Pin extension

**Debugging**:
- Extension page: `chrome://extensions` → "Service Worker" link
- Popup: Right-click extension icon → "Inspect popup"
- Content script: Inspect page → DevTools Sources, find content script
- Storage: DevTools → Application → IndexedDB (Veilpay)

## Success Criteria

**Functional**:
- Vault encrypts/decrypts with correct password
- Message routing correlates requests to responses
- CSP spike generates proof stub without errors
- All unit tests pass

**Code Quality**:
- No TS errors, lint warnings, or dead code
- >80% coverage on crypto and messaging modules
- Manifest generates correctly

**DevOps**:
- CI runs on every commit
- Build artifact <5MB
- No console errors in background or content script

## Blockers & Risks

1. **Chrome API Mocking**: If chrome.storage or tabs API changes, tests fail. → Monitor canary builds.
2. **CSP Header Conflicts**: If manifest sets overly strict CSP, scripts won't run. → Relax CSP for inpage script injection.
3. **ZK Proof Validation**: If CSP spike requires real proof verification, may need Wasm port. → Defer to Phase 2 spike.
