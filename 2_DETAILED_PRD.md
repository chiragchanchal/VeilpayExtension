# Veilpay Browser Extension - Product Requirements Document (PRD)

## 📖 Document Control

| Field | Value |
|-------|-------|
| **Title** | Veilpay Browser Extension PRD |
| **Version** | 1.0 |
| **Status** | Draft |
| **Date** | 2026-08-07 |
| **Owner** | Product Management |
| **Audience** | Engineering, Design, Security, QA |

---

## 1. Product Overview

### 1.1 Problem Statement

Users need a browser-based wallet that:
- Provides **full mobile wallet parity** in the browser
- Supports **privacy-first transactions** (stealth addresses, encrypted notes, ZK proofs)
- Enables **x402 agentic payments** for Web3 services
- Matches **Veilpay's design language** for brand consistency
- Works **across EVM, Solana, and Stellar** chains
- Maintains **self-custody** (keys never leave device)

### 1.2 Solution Overview

**Veilpay Browser Extension** is a Chrome/Firefox extension that replicates the Veilpay mobile wallet with browser-native features:

- **25+ screens** from mobile app (responsive UI)
- **Multi-chain support** (EVM, Solana, Stellar)
- **Privacy layers** (stealth addresses, encrypted notes, ZK proofs on testnet)
- **x402 payment layer** (consumer + provider modes)
- **DApp connector** (like MetaMask)
- **Page overlays** for x402 payment requests
- **Session management** (15-min timeout + auto-lock)

### 1.3 Target Users

| User Type | Primary Use Case |
|-----------|------------------|
| **Traders** | Multi-chain portfolio management in browser |
| **Privacy-conscious users** | Stealth transfers, encrypted notes |
| **Developers** | x402 payment integration, API monetization |
| **Service providers** | Accept x402 payments for premium features |
| **DeFi participants** | Send/receive across chains, manage assets |

---

## 2. Feature Requirements

### 2.1 Core Wallet Features (MVP)

#### 2.1.1 Onboarding & Account Setup

**Screen: OnboardingScreen**
- Welcome screen with Veilpay branding
- Two paths: **Create New** | **Import Existing**
- Sign-in method: Passphrase setup (no biometrics in browser)

**Create New Wallet**
- Mnemonic generation (BIP39, 12/24 words)
- Seed phrase display + backup confirmation
- Passphrase setup + confirm
- PIN setup (optional, for faster unlock)

**Import Existing Wallet**
- Seed phrase input (12/24 words)
- Passphrase setup
- PIN setup

**Requirements:**
- ✅ Mnemonic stored encrypted in IndexedDB (AES-256)
- ✅ Never export plaintext seed phrase to UI
- ✅ Seed verification step (user selects correct words)
- ✅ Support BIP44 derivation (EVM, Solana, Stellar address families)

#### 2.1.2 Home Dashboard

**Screen: HomeDashboardScreen**
- Display **total portfolio value** (USD equivalent)
- **Multi-chain balances** with chain icons (EVM, Solana, Stellar)
- **Recent transactions** (last 5)
- **Quick actions**: Send | Receive | Swap (future)
- **Notification badge** (pending transactions)

**Requirements:**
- ✅ Real-time balance polling (configurable interval: 5-30s)
- ✅ Show network status (connected/disconnected)
- ✅ Display gas prices for active chains
- ✅ Support testnet toggle (dev mode)

#### 2.1.3 Send & Receive

**Screen: SendCryptoScreen**
- Recipient address input (with address book autocomplete)
- Amount input (with token/currency selector)
- Network selector (EVM, Solana, Stellar)
- Advanced options (gas price, slippage for swaps)

**Screen: PaymentConfirmScreen**
- Display transaction summary
- Show estimated fees
- Passphrase unlock prompt
- Confirm/Cancel buttons

**Screen: ReceiveScreen**
- Generate receive address per chain
- Display QR code
- Copy address button
- Share via native share API

**Requirements:**
- ✅ Address validation (chain-specific format)
- ✅ Balance checks before send
- ✅ Fee estimation before signing
- ✅ Timeout protection (5-min validity)

#### 2.1.4 Transaction History

**Screen: TransactionHistoryScreen**
- List all transactions (paginated, 20 per page)
- Filter by chain, status (pending/confirmed/failed)
- Search by address or txn hash

**Screen: TransactionDetailsScreen**
- Full transaction metadata
- Chain explorer link
- Timestamp, block confirmations
- Gas used, transaction fee

**Requirements:**
- ✅ Fetch from indexer (same as mobile backend)
- ✅ Cache locally (IndexedDB)
- ✅ Sync on wallet unlock
- ✅ Support testnet + mainnet data separation

#### 2.1.5 Settings & Preferences

**Screen: SettingsScreen**
- **Wallet Settings**: Export private key (with confirmation), change passphrase
- **Display Settings**: Theme (light/dark), language, currency (USD/EUR/GBP)
- **Network Settings**: Custom RPC endpoints per chain
- **Security Settings**: Session timeout duration, clear cache
- **Privacy Settings**: Privacy level toggle (public/stealth/encrypted)

**Screen: NetworkSettingsScreen**
- Pre-configured networks (mainnet, testnet)
- Option to add custom EVM networks
- RPC endpoint validation

**Requirements:**
- ✅ Theme persistence (localStorage)
- ✅ RPC validation before saving
- ✅ Security audit for private key export (passphrase + confirmation)
- ✅ Session timeout enforcement

#### 2.1.6 Biometric → Passphrase Adaptation

**Browser Security Model:**
- Biometrics unavailable in browser environment
- Replace with **Passphrase + Optional PIN**
- Passphrase required for: Unlock wallet, export keys, approve transactions
- PIN optional for faster re-unlock (5-min window)

**Requirements:**
- ✅ Passphrase hashing (Argon2 or PBKDF2)
- ✅ PIN stored locally (salted hash only)
- ✅ Auto-lock after 15 min inactivity
- ✅ Manual lock option (extension icon menu)

---

### 2.2 Multi-Chain Support

#### 2.2.1 EVM Networks

**Supported Networks:**
- Ethereum Mainnet (chain ID: 1) [Phase 2]
- Sepolia Testnet (chain ID: 11155111) [Phase 1]
- Polygon Mainnet (137) [Phase 2]
- Arbitrum (42161) [Phase 2]
- Optimism (10) [Phase 2]
- Base (8453) [Phase 2]
- BSC (56) [Phase 2]

**Requirements:**
- ✅ EIP-155 chain binding for signing
- ✅ viem for EVM operations
- ✅ Contract interaction via ethers.js
- ✅ Gas estimation per network

#### 2.2.2 Solana

**Supported Networks:**
- Solana Devnet (Phase 1)
- Solana Mainnet-Beta (Phase 2)

**Requirements:**
- ✅ @solana/web3.js for RPC operations
- ✅ Ed25519 key derivation (BIP44-m/44'/501'/0'/0'/0')
- ✅ SPL Token balance queries
- ✅ Versioned transactions support

#### 2.2.3 Stellar

**Supported Networks:**
- Stellar Testnet (Phase 1)
- Stellar Mainnet (Phase 2)

**Requirements:**
- ✅ @stellar/stellar-sdk for operations
- ✅ XLM balance + asset balances
- ✅ Private XLM flows (testnet only, no mainnet SPP)
- ✅ Stellar federation address lookup (optional)

---

### 2.3 Privacy Features (Testnet Only, Phase 1)

#### 2.3.1 Stealth Addresses

**What It Does:**
- Hide recipient address on-chain
- Use ephemeral keys + commitment scheme
- Recipient can retrieve funds privately

**UX Flow:**
- **Sender**: Choose "private" mode → generate stealth address → send
- **Receiver**: Extension scans chain for commitments → derives private key → claims funds

**Supported Chains:**
- EVM (Sepolia testnet)
- Stellar (Testnet via SPP, no mainnet SPP)

**Requirements:**
- ✅ Ephemeral key generation (secp256k1)
- ✅ ECDH for shared secret derivation
- ✅ Commitment = Keccak256(ephemeral_pub || shared_secret)
- ✅ Background worker for scanning (non-blocking)

#### 2.3.2 Encrypted Notes

**What It Does:**
- Attach encrypted metadata to transactions
- Only recipient + sender can decrypt
- Use for memos, payment reasons, etc.

**UX Flow:**
- **Sender**: Attach note (e.g., "lunch reimbursement") → select encryption method → confirm
- **Receiver**: Decrypt note with passphrase → view metadata

**Requirements:**
- ✅ AES-256-GCM encryption
- ✅ Key derivation from shared ECDH secret
- ✅ Store in transaction calldata (EVM) or memo (Stellar)
- ✅ Graceful fallback if decryption fails

#### 2.3.3 Zero-Knowledge Proofs (Testnet)

**What It Does:**
- Privacy pool withdrawals
- Proof that user owns a commitment without revealing which one
- Groth16 proofs (pending trusted setup ceremony)

**UX Flow:**
- **User**: Deposit to privacy pool → pool stores commitment
- **User**: Initiate withdrawal → extension generates ZK proof → submit to pool contract
- **Result**: Funds received by recipient, no link to original deposit

**Supported Chains:**
- EVM Sepolia testnet only

**Requirements:**
- ✅ snarkjs for proof generation
- ✅ Merkle tree proof (in-browser, non-blocking)
- ✅ Groth16Verifier contract interaction
- ✅ Clear warnings: "Testnet only, not audited"

---

### 2.4 x402 Agentic Payments

#### 2.4.1 Consumer Mode (Pay for Services)

**What It Does:**
- User pays for API calls, agent services, premium content
- Extension intercepts `x402` HTTP headers
- User approves payment → service activated

**UX Flow:**

1. **User visits website** with x402 service
2. **Website returns 402 Payment Required** with x402 header
3. **Extension overlay appears:**
   - Service name/description
   - Payment amount (USD or crypto)
   - Recipient address
   - [Approve] [Deny] buttons
4. **User clicks Approve** → passphrase prompt
5. **Extension signs & submits transaction** via wallet
6. **Website receives payment confirmation** → activates service

**Requirements:**
- ✅ Intercept HTTP 402 responses (content script)
- ✅ Parse x402 header format
- ✅ Beautiful overlay UI (mobile-responsive)
- ✅ Payment timeout protection (5 min)
- ✅ Session-based approval (no re-prompt within 10 min for same service)
- ✅ Rate limiting (max 5 x402 payments/min to prevent spam)

#### 2.4.2 Provider Mode (Create Payment Channels)

**What It Does:**
- Developer/service provider creates x402 payment channel
- Generate unique x402 header with their address
- Share endpoint URL with users
- Receive payments for API calls/services

**UX Flow:**

**Screen: X402SetupScreen**
- Enter service name (e.g., "Image Processing API")
- Set payment amount per request (USD or token)
- Select recipient chain (EVM, Solana, Stellar)
- Generate x402 header (unique per service)
- Display endpoint URL to share

**Screen: X402ManagementScreen**
- List active payment channels
- View payments received (daily/weekly/monthly)
- Disable/delete channels
- View earnings in USD equivalent

**Requirements:**
- ✅ Generate deterministic x402 headers
- ✅ Track payments per channel in local database
- ✅ Export payment history (CSV)
- ✅ Real-time balance updates

---

### 2.5 Browser-Native Features

#### 2.5.1 Page Overlay for x402 Requests

**Behavior:**
- Smooth slide-up animation (bottom of page)
- Display payment details
- Passphrase unlock (if wallet locked)
- Approve/Deny buttons
- Timeout auto-dismiss (5 min)

**Requirements:**
- ✅ Use React Portal for overlay rendering
- ✅ z-index 9999 (above page content)
- ✅ Keyboard support (Enter = Approve, Esc = Deny)
- ✅ Mobile responsive

#### 2.5.2 Right-Click Context Menu

**Options:**
- "Send Crypto to This Address" (if address detected on page)
- "Copy Address to Clipboard"
- "Veilpay Settings"
- "Lock Wallet"

**Requirements:**
- ✅ Manifest v3 context menu API
- ✅ Address detection (regex for blockchain addresses)
- ✅ Copy-to-clipboard feedback

#### 2.5.3 DApp Connector

**What It Does:**
- Websites can request wallet connection (like MetaMask)
- User approves connection → website receives selected account
- Website can request transaction signing

**UX Flow:**

1. **Website calls**: `window.veilpay.request({method: 'eth_requestAccounts'})`
2. **Extension overlay**: "Website wants to connect. Approve?"
3. **User approves** → website receives `[userAddress]`
4. **Website requests**: `window.veilpay.request({method: 'eth_sendTransaction', ...})`
5. **Extension overlay**: "Sign transaction? [Details shown]"
6. **User approves** → extension signs & broadcasts

**Supported Methods:**
- `eth_requestAccounts` (connect wallet)
- `eth_accounts` (get connected accounts)
- `eth_sendTransaction` (sign & send tx)
- `eth_sign` / `personal_sign` (sign messages)
- `eth_chainId` (get current chain)
- `wallet_switchEthereumChain` (switch chains)

**Requirements:**
- ✅ Veilpay provider API (window.veilpay)
- ✅ Site permission storage (approve once per site)
- ✅ Transaction validation before signing
- ✅ Clear website name in approval overlays

---

### 2.6 Address Book & Contacts

**Screen: AddressBookScreen**
- List saved addresses per chain
- Search / filter
- Add new (name + address + chain)
- Edit existing
- Delete with confirmation

**Requirements:**
- ✅ Store in IndexedDB
- ✅ Persist across sessions
- ✅ Chain-aware (same address may exist on multiple chains)
- ✅ Export/import (JSON format)

---

### 2.7 Network & RPC Management

**Screen: NetworkSettingsScreen**
- List pre-configured networks per chain
- Add custom EVM networks
- Edit RPC endpoints
- Test connectivity (ping RPC)

**Requirements:**
- ✅ Validate RPC URL before saving
- ✅ Fallback to default if custom fails
- ✅ Cache RPC responses (5-min TTL)

---

## 3. Non-Functional Requirements

### 3.1 Security

| Requirement | Implementation |
|-------------|-----------------|
| **Key Management** | Web Crypto API + libp2p + TweetNaCl |
| **Storage Encryption** | AES-256-GCM for sensitive data |
| **Session Management** | 15-min timeout + auto-lock |
| **Passphrase Hashing** | Argon2 (or PBKDF2) with random salt |
| **Message Encryption** | Encrypt background ↔ content script messages |
| **CSP Headers** | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` |
| **No Plaintext Logging** | Never log mnemonics, keys, passphrases |
| **Audit Trail** | Log all key operations (creation, send, receive, approval) |

### 3.2 Performance

| Metric | Target |
|--------|--------|
| **Extension Load Time** | < 500ms |
| **Send/Receive Transaction** | < 5 seconds (excluding network) |
| **Balance Update** | < 2 seconds (cached) |
| **ZK Proof Generation** | < 10 seconds (web worker) |
| **Page Overlay Response** | < 300ms (x402 request to overlay visible) |
| **Memory Usage** | < 100MB (at idle) |
| **Bundle Size** | < 5MB (compressed) |

### 3.3 Accessibility (WCAG 2.2 Level AA)

- ✅ Text contrast ≥ 4.5:1
- ✅ Touch targets ≥ 44×44px (browser adaptation)
- ✅ Keyboard navigation support
- ✅ Screen reader compatible (ARIA labels)
- ✅ Color not sole differentiator

### 3.4 Testnet-First Approach

| Phase | Scope |
|-------|-------|
| **Phase 1 (MVP)** | Testnet only (Sepolia, Devnet, Stellar Testnet) |
| **Phase 2** | Mainnet support (post-security audit) |
| **Phase 3+** | Advanced features |

**Testnet Safety Measures:**
- ✅ Display prominent "TESTNET" badge in UI
- ✅ Warn users about privacy features being "not audited"
- ✅ Disable mainnet chains in initial release

---

## 4. User Flows (Detailed)

### 4.1 Onboarding Flow

```
User Opens Extension
    ↓
[First Time?] → OnboardingScreen
    ↓
[Create | Import]
    ↓
[Create Path]:
  - MnemonicGenerationScreen (display seed)
  - SeedBackupScreen (user confirms)
  - PassphraseSetupScreen (setup security)
  - ConfirmScreen
    ↓
[Import Path]:
  - SeedInputScreen (user enters 12/24 words)
  - PassphraseSetupScreen
  - ConfirmScreen
    ↓
HomeDashboardScreen (ready to use)
```

### 4.2 Send Transaction Flow

```
User Clicks "Send"
    ↓
SendCryptoScreen
  - Select network (EVM/Solana/Stellar)
  - Enter recipient address
  - Enter amount
  - [Optional] Privacy mode (stealth/encrypted)
    ↓
[Preview] PaymentConfirmScreen
  - Show transaction summary
  - Estimate fees
    ↓
[Confirm] → PassphrasePromptScreen
    ↓
[Sign] → Submit to chain via RPC
    ↓
[Poll] Indexer for confirmation
    ↓
PaymentResultScreen (success/failure)
```

### 4.3 x402 Payment Flow (Consumer)

```
User Visits Website (with x402 service)
    ↓
Website returns 402 Payment Required
    ↓
Extension Content Script detects x402 header
    ↓
Overlay displays: [Service name | Amount | Recipient | Approve/Deny]
    ↓
[User Approves]
    ↓
[Wallet Locked?] → PassphrasePromptScreen
    ↓
[Wallet Unlocked] → Sign transaction
    ↓
Submit payment to blockchain
    ↓
Website receives confirmation → activates service
```

---

## 5. Technical Architecture

### 5.1 Extension Architecture

```
┌─────────────────────────────────────────┐
│       Browser Context                    │
├─────────────────────────────────────────┤
│                                          │
│  ┌─ Background Worker (Service Worker)  │
│  │  - Wallet state management           │
│  │  - Transaction signing               │
│  │  - Key storage (encrypted)           │
│  │  - Session management                │
│  │  - Network requests (RPC proxying)   │
│  │                                      │
│  ├─ Content Script                      │
│  │  - Intercept x402 headers            │
│  │  - Inject Veilpay provider (window.veilpay)
│  │  - DApp communication bridge         │
│  │  - Overlay rendering                │
│  │                                      │
│  ├─ Popup UI (React)                    │
│  │  - 25+ screens (same as mobile)      │
│  │  - Theme tokens (Veilpay design)    │
│  │  - Zustand stores                    │
│  │                                      │
│  └─ Options Page (Settings)             │
│     - Advanced settings                 │
│     - Network configuration             │
│     - Security settings                 │
└─────────────────────────────────────────┘

Storage:
  ├─ IndexedDB (large data: transactions, commitments)
  └─ localStorage (config, theme, addresses)
```

### 5.2 Component Hierarchy

```
App (root)
├── Router
│   ├── OnboardingRoute
│   │   ├── OnboardingScreen
│   │   ├── CreateWalletScreen
│   │   ├── ImportWalletScreen
│   │   └── ...
│   │
│   ├── AuthRoute (protected)
│   │   ├── HomeDashboardScreen
│   │   ├── SendScreen
│   │   ├── ReceiveScreen
│   │   ├── TransactionHistoryScreen
│   │   ├── SettingsScreen
│   │   └── ...
│   │
│   └── X402Route
│       ├── X402SetupScreen
│       ├── X402ManagementScreen
│       └── X402OverlayComponent

GlobalComponents:
├── SessionTimeoutModal
├── PassphrasePromptModal
├── X402PaymentOverlay
└── NotificationToast
```

### 5.3 State Management (Zustand)

```typescript
stores/
├── walletStore.ts
│   - accounts, balances, chainIds
│   - unlock/lock
│   - selectAccount, switchChain
│
├── transactionStore.ts
│   - pending transactions
│   - transaction history
│   - add/update/remove
│
├── settingsStore.ts
│   - theme, language, currency
│   - session timeout
│   - privacy level
│
├── addressBookStore.ts
│   - saved addresses
│   - add/edit/delete
│
├── x402Store.ts
│   - active payment channels
│   - payments received
│   - create/delete channels
│
└── sessionStore.ts
    - lastActivity timestamp
    - isLocked boolean
    - lockCountdown
```

### 5.4 Storage Strategy

| Data | Storage | Encryption | Persistence |
|------|---------|-----------|------------|
| **Mnemonic** | IndexedDB | AES-256 | Until explicitly deleted |
| **Derived Keys** | Memory | Yes (in transit) | Session only |
| **Transactions** | IndexedDB | Optional | Until deleted |
| **Addresses** | IndexedDB | No (non-sensitive) | Until deleted |
| **Theme/Settings** | localStorage | No | Until cleared |
| **Session State** | Memory | Yes | Session only |

---

## 6. API & Integration Points

### 6.1 RPC Endpoints (Testnet Phase 1)

| Chain | Endpoint | Provider |
|-------|----------|----------|
| **EVM (Sepolia)** | `https://sepolia.infura.io/v3/{KEY}` | Infura |
| **Solana (Devnet)** | `https://api.devnet.solana.com` | Solana Labs |
| **Stellar (Testnet)** | `https://horizon-testnet.stellar.org` | Stellar Dev |

### 6.2 Indexer Integration

**Backend Endpoint:** `{VEILPAY_INDEXER_URL}/api/indexer`

**Queries:**
- `GET /transactions?address={addr}&chain={chain}&limit=20`
- `GET /balance?address={addr}&chain={chain}`
- `GET /token-list?chain={chain}`

### 6.3 Privacy Circuit Endpoints

**Local Circuit Compilation:**
- Circuits bundled with extension
- Proofs generated client-side (web worker)
- No external service calls

---

## 7. Testing Strategy

### 7.1 Unit Tests

```
jest + @testing-library/react
├── stores/ (Zustand store logic)
├── utils/ (crypto, address validation)
├── services/ (wallet, transaction services)
└── components/ (UI rendering, interactions)

Coverage Target: 80%+
```

### 7.2 Integration Tests

```
jest + @testing-library/react
├── Wallet creation → send transaction flow
├── x402 payment detection → approval → submission
├── Privacy feature (stealth address creation/scanning)
├── Session timeout enforcement
└── DApp connector communication
```

### 7.3 E2E Tests

```
playwright
├── Full onboarding flow (testnet)
├── Multi-chain send/receive
├── Privacy transaction (stealth + encrypted notes)
├── x402 payment (consumer + provider)
├── Session management (timeout, re-lock)
└── Browser compatibility (Chrome, Firefox)
```

### 7.4 Security Testing

```
Manual + Automated
├── Key exposure (audit logs for any plaintext storage)
├── Passphrase hashing validation
├── Session timeout correctness
├── CSP violations (check headers)
├── XSS prevention (sanitize user inputs)
├── CSRF protection (where applicable)
└── x402 payment validation (prevent double-spend, wrong amounts)
```

---

## 8. Deployment & Release

### 8.1 Chrome Web Store Submission

**Requirements:**
- ✅ Screenshots (1280×800 px, 5+ required)
- ✅ Description (up to 132 characters)
- ✅ Detailed description (up to 4000 characters)
- ✅ Category selection
- ✅ Privacy policy URL
- ✅ Support URL
- ✅ Permissions justification
- ✅ Developer account (paid)

**Checklist:**
- [ ] All testnet warnings clearly displayed
- [ ] Privacy policy finalized
- [ ] Support channels (Discord, email) ready
- [ ] Permissions justified (RPC, storage, content scripts)

### 8.2 GitHub Release

**Deliverables:**
- ✅ Source code (open-source or private repo)
- ✅ Build artifact (`.zip` for manual installation)
- ✅ Release notes (features, bug fixes, security updates)
- ✅ Installation guide (for dev mode)

**Installation (Dev Mode):**
```bash
# Clone repo
git clone https://github.com/veilpay/veilpay-extension.git
cd veilpay-extension

# Install dependencies
pnpm install

# Build
pnpm build

# Load in Chrome
# 1. chrome://extensions
# 2. Enable "Developer mode"
# 3. "Load unpacked" → select dist/ folder
```

### 8.3 Version & Update Strategy

- **Semantic Versioning:** v{major}.{minor}.{patch}
- **Auto-updates:** Chrome Web Store handles automatically
- **GitHub Releases:** Manual downloads for users

---

## 9. Post-Launch Roadmap

### Phase 2 (Mainnet + Security)

- [ ] Security audit (third-party firm)
- [ ] Mainnet chain support (post-audit)
- [ ] Hardware wallet integration (Ledger, Trezor)
- [ ] Firefox & Edge support
- [ ] Enhanced x402 UX (permission granularity)
- [ ] Transaction simulation (preview before sign)

### Phase 3 (Advanced Features)

- [ ] Native privacy chain support (Monero, Zcash, Midnight)
- [ ] Multi-sig support
- [ ] DeFi integrations (swap, staking, lending)
- [ ] Mobile ↔ Extension sync
- [ ] Custom smart contract UI
- [ ] Advanced transaction builder

---

## 10. Success Metrics

| Metric | Target | Measurement |
|--------|--------|------------|
| **DAU** | 500+ | Google Analytics / Extension dashboard |
| **Transaction Volume** | 1000+ txns/week | Indexer data |
| **x402 Payments** | 100+ payments/week | Extension database |
| **User Retention** | 60% D7 retention | Analytics |
| **Crash Rate** | < 0.1% | Sentry/crash logs |
| **Security Incidents** | 0 | Audit trail |
| **Chrome Store Rating** | 4.5+ stars | User reviews |

---

## 11. Appendix

### A. Glossary

- **BIP39**: Bitcoin Improvement Proposal for mnemonic encoding
- **BIP44**: Hierarchical deterministic wallet derivation
- **x402**: HTTP payment protocol for pay-per-use services
- **Stealth Address**: Privacy primitive hiding recipient identity
- **Groth16**: Zero-knowledge proof system
- **SPP**: Stellar Private Payments (native privacy on Stellar)
- **IndexedDB**: Browser database for large local storage
- **CSP**: Content Security Policy (web security mechanism)

### B. Referenced Documents

- Veilpay Mobile App PRD (product-prd.md)
- Design System (design-tokens.md)
- Security Model (security.md)
- x402 Specification (x402-spec.md)

### C. Risk Register

| Risk | Mitigation |
|------|-----------|
| ZK circuit bugs | Comprehensive testing + external audit |
| Key management complexity | Use proven libraries, security audit |
| Chrome Store rejection | Early policy review, clear disclaimers |
| Privacy feature misuse | Clear warnings, testnet-only for unaudited features |

---

**Document Status**: Draft v1.0  
**Last Updated**: 2026-08-07  
**Owner**: Product Management  
**Next Review**: After stakeholder feedback
