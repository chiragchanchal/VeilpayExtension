# Veilpay Architecture

## Overview

Veilpay is a privacy-preserving payment extension built on zero-knowledge proofs and encrypted message passing. It operates across four runtime domains:

- **Background Service Worker**: Vault orchestration, transaction signing, message routing
- **Content Script**: Web page bridge, x402 request interception
- **Inpage Script**: Native `window.veilpay` API for dApps
- **UI Surfaces**: Popup, side panel, options, offscreen workers

## Core Domains

### Messaging (`src/core/messaging/`)

**Contract**: Strongly typed request/response protocol with async-first routing.

- `protocol.ts`: Message type definitions (Request, Response, WrappedMessage)
- `client.ts`: Async messenger API with request/response correlation
- `router.ts`: Handler registry and dispatch logic

**Flow**: Content → Background via `chrome.runtime.sendMessage()`, Background publishes to UI surfaces via broadcast.

### Vault (`src/core/vault/`)

**Contract**: Encrypted key storage with zero-knowledge proof support.

- `storage.ts`: IndexedDB wrapper with AES-GCM encryption at rest
- `crypto.ts`: Key derivation (PBKDF2), encryption/decryption, ZK proof generation
- `index.ts`: Vault API (lock/unlock, sign, derive)

**State**: Locked by default; unlocked for 15 min after user auth; auto-locks or on ext suspend.

### Stores (`src/core/stores/`)

**Pattern**: Zustand slices composed into a root store. Persisted to IndexedDB via middleware.

- `auth.ts`: Session state, seed phrase management
- `accounts.ts`: Derived accounts, labels, balances
- `chains.ts`: Supported chains, metadata
- `transactions.ts`: Pending/history, signatures
- `ui.ts`: Modal state, selected account/chain
- `privacy.ts`: ZK proof cache, privacy preferences
- `settings.ts`: User preferences (theme, gas, slippage, RPC overrides)

### CSP ZK Spike (`src/spike/csp-zk-probe.ts`)

**Goal**: Feasibility check for confidential signing (CSP) + ZK proof emission on background thread.

**Approach**:
1. Derive ephemeral keypair from session secret + random nonce
2. Sign transaction hash with ephemeral key (CSP-compatible pattern)
3. Generate range proof over tx amount (stub for Phase 1)
4. Return proof + signature to content script; sign again with hot key for broadcast

**Why**: Allows extension to prove knowledge of transaction without revealing private key to untrusted page.

## Request/Response Flows

### Vault Lock/Unlock

```
Content: { type: "VAULT_UNLOCK", password }
  ↓
Background: Derive auth key, verify password hash
  ↓
Background: Load encrypted master seed, decrypt, cache in memory
  ↓
Response: { success: true, sessionId }
```

### Transaction Signing

```
Page (inpage): window.veilpay.signTx(tx)
  ↓
Inpage → Content: postMessage({ type: "REQUEST_SIGN", tx })
  ↓
Content → Background: chrome.runtime.sendMessage({ type: "REQUEST_SIGN", tx })
  ↓
Background: Correlate to UI (show approval modal)
  ↓
UI → Background: { type: "APPROVE_SIGN", correlationId }
  ↓
Background: Load account private key, sign, emit ZK proof
  ↓
Inpage: postMessage({ type: "SIGNATURE_READY", sig, proof })
  ↓
Page: Return to caller
```

### x402 Payment Request

```
Page: <script data-x402-recipient="addr" data-x402-amount="1.5">
  ↓
Content: Intercept, extract metadata
  ↓
Content → Background: { type: "REQUEST_PAYMENT", recipient, amount, scriptId }
  ↓
Background: Show payment approval modal (side panel)
  ↓
User: Approve + select account/chain
  ↓
Background: Sign, emit ZK proof, broadcast tx
  ↓
Inpage: postMessage({ type: "PAYMENT_COMPLETE", txHash })
```

## UI Surfaces

### Popup (390×600)

- Quick vault unlock
- Account selector
- Recent transactions
- Settings link

### Side Panel (480×680)

- Transaction approval modal
- Payment confirmation
- Key derivation UI
- Privacy settings

### Options (Full Window)

- Master seed backup/recovery
- Account management (create, rename, hide)
- Chain toggles
- RPC override configuration
- Gas preferences
- Privacy & ZK settings

### Offscreen Document

- Long-lived crypto operations (Key derivation, proof generation)
- Background message relay to UI

## Extension Manifest v3 Contract

**Permissions**:
- `storage` (IndexedDB + chrome.storage.local)
- `tabs` (tab query for content script injection)
- `webRequest` optional (future rate limiting)

**Entry Points**:
- `background.service_worker`: `src/background/index.ts`
- `content_scripts`: `src/content/index.ts`
- `action.default_popup`: `public/popup.html`
- `side_panel`: `public/sidepanel.html`
- `options_page`: `public/options.html`
- `offscreen_documents`: `public/offscreen.html`

## Build & Development

**Vite + React + TypeScript**:
- `npm run dev` watches all sources, rebuilds manifest
- `npm run build` produces `dist/` ready for `chrome://extensions` load
- `npm run build:check-size` fails if bundle > 5MB

**CI/CD** (`.github/workflows/ci.yml`):
- Typecheck, lint (ESLint), unit tests (Vitest)
- Build verification
- Bundle size check

## Testing Strategy

**Unit** (`tests/unit/core/`):
- Crypto (derive, encrypt, ZK stub)
- Messaging (client, router, protocol)
- CSP spike (ephemeral key, proof emission)

**Integration** (future):
- Content ↔ Background messaging
- Vault lock/unlock flow
- Transaction signing e2e

**Manual** (for now):
- Real dApp integration (test-landing-page.html in Phase 2)
- ZK proof verification (wait for CSP probe results)
