# Veilpay Browser Extension - Architecture Design

**Document Version:** 1.0  
**Last Updated:** 2026-08-08  
**Status:** Professional Plan

---

## 📐 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    VEILPAY BROWSER EXTENSION                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─── UI Layer ────────────────────────────────────────────────┐   │
│  │ • React Components (Popup, Dashboard, Screens)             │   │
│  │ • Design System (Sovereign Minimalist theme)               │   │
│  │ • x402 Request Overlay                                     │   │
│  │ • Wallet UI (Send, Receive, Settings)                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                 ↓                                    │
│  ┌─── State Management Layer ───────────────────────────────────┐   │
│  │ Zustand Stores:                                             │   │
│  │ • walletStore (accounts, balances, keys)                    │   │
│  │ • transactionStore (history, pending)                       │   │
│  │ • settingsStore (theme, network, preferences)              │   │
│  │ • privacyStore (stealth addresses, commitments)            │   │
│  │ • payboxStore (payment channels, x402 grants)              │   │
│  │ • sessionStore (auth, session timeout)                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                 ↓                                    │
│  ┌─── Service Layer ────────────────────────────────────────────┐   │
│  │ Wallet Services:                                            │   │
│  │ • WalletService (HD derivation, account mgmt)              │   │
│  │ • TransactionService (building, signing, broadcast)        │   │
│  │ • PrivacyService (stealth, encrypted notes, ZK proofs)    │   │
│  │ • StorageService (ExtensionStorage, SecureEncryption)      │   │
│  │ • BiometricService (WebAuthn, PIN fallback)                │   │
│  │                                                             │   │
│  │ Blockchain Services:                                        │   │
│  │ • EVMService (viem, contract interaction)                  │   │
│  │ • SolanaService (@solana/web3.js)                          │   │
│  │ • StellarService (@stellar/stellar-sdk)                    │   │
│  │                                                             │   │
│  │ x402 & Payment Services:                                    │   │
│  │ • x402PaymentService (channel mgmt, proof verification)    │   │
│  │ • PaymentChannelService (open, close, settle)              │   │
│  │ • MicroPaymentService (fractionalized payments)            │   │
│  │ • GrantService (manage payment authorizations)             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                 ↓                                    │
│  ┌─── Crypto & Signing Layer ───────────────────────────────────┐   │
│  │ • libp2p (DHT, pubsub for peer communication)              │   │
│  │ • TweetNaCl (Ed25519 signatures, encryption)               │   │
│  │ • Web Crypto API (AES-256-GCM for local encryption)        │   │
│  │ • Elliptic (@noble/secp256k1 for EVM signing)             │   │
│  │ • Groth16 (snarkjs for ZK proof verification)              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                 ↓                                    │
│  ┌─── Extension Runtime Layer ──────────────────────────────────┐   │
│  │ • Background Script (persistent logic)                      │   │
│  │ • Content Scripts (page interaction, x402 interception)    │   │
│  │ • Service Worker (async tasks, timers)                      │   │
│  │ • Message Handler (popup ↔ background communication)       │   │
│  │ • Storage Handler (chrome.storage API wrapper)              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                 ↓                                    │
│  ┌─── External Services ────────────────────────────────────────┐   │
│  │ RPC Endpoints:                                              │   │
│  │ • EVM: Infura, Alchemy, Ankr (fallback rotation)           │   │
│  │ • Solana: QuickNode, Helius, Alchemy                       │   │
│  │ • Stellar: Horizon API                                      │   │
│  │                                                             │   │
│  │ Indexing & Status:                                          │   │
│  │ • The Graph (EVM events)                                    │   │
│  │ • Solana FM (Solana events)                                 │   │
│  │ • Stellar Expert (Stellar events)                           │   │
│  │                                                             │   │
│  │ x402 Infrastructure:                                        │   │
│  │ • Payment Channel Registry (smart contract)                │   │
│  │ • Grant Storage (IPFS + on-chain)                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Extension Directory Structure

```
veilpay-extension/
├── public/
│   ├── manifest.json              # Manifest v3 configuration
│   ├── icons/                     # Extension icons (16, 48, 128)
│   ├── assets/                    # Static assets
│   └── popup.html                 # Popup entry point
│
├── src/
│   ├── background/                # Background script & service worker
│   │   ├── index.ts              # Entry point
│   │   ├── messageHandler.ts      # Message listener
│   │   ├── sessionManager.ts      # Session & timeout logic
│   │   └── rpcProxy.ts            # RPC forwarding & caching
│   │
│   ├── content/                   # Content scripts for page interaction
│   │   ├── index.ts              # Content script entry
│   │   ├── x402Interceptor.ts     # x402 request detection & overlay
│   │   ├── pageInjector.ts        # Inject extension API into page
│   │   └── dappConnector.ts       # DApp wallet provider (metamask-like)
│   │
│   ├── popup/                     # Popup UI
│   │   ├── App.tsx               # Main popup component
│   │   ├── index.tsx             # React entry
│   │   └── styles.css            # Popup styles
│   │
│   ├── components/               # Shared React components (from mobile, adapted)
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── Input.tsx
│   │   ├── Icon.tsx
│   │   ├── wallet/               # Wallet-specific components
│   │   ├── payment/              # Payment flow components
│   │   ├── privacy/              # Privacy UI components
│   │   └── x402/                 # x402 payment UI
│   │
│   ├── screens/                  # Full-page screens (adapted from mobile)
│   │   ├── HomeScreen.tsx        # Dashboard
│   │   ├── SendScreen.tsx        # Send flow
│   │   ├── ReceiveScreen.tsx     # Receive address
│   │   ├── SettingsScreen.tsx    # Settings
│   │   ├── PrivacyScreen.tsx     # Stealth addresses & notes
│   │   ├── x402GrantsScreen.tsx  # x402 grant management
│   │   ├── TransactionHistoryScreen.tsx
│   │   └── [25+ more screens...]
│   │
│   ├── stores/                   # Zustand state management
│   │   ├── walletStore.ts
│   │   ├── transactionStore.ts
│   │   ├── settingsStore.ts
│   │   ├── privacyStore.ts
│   │   ├── payboxStore.ts        # x402, payment channels
│   │   ├── sessionStore.ts       # Auth & session
│   │   └── index.ts              # Export all stores
│   │
│   ├── services/                 # Business logic services
│   │   ├── wallet/
│   │   │   ├── WalletService.ts
│   │   │   ├── AccountService.ts
│   │   │   └── KeyDerivationService.ts
│   │   ├── blockchain/
│   │   │   ├── EVMService.ts
│   │   │   ├── SolanaService.ts
│   │   │   └── StellarService.ts
│   │   ├── transaction/
│   │   │   ├── TransactionService.ts
│   │   │   └── SigningService.ts
│   │   ├── privacy/
│   │   │   ├── PrivacyService.ts
│   │   │   ├── StealthService.ts
│   │   │   ├── EncryptedNoteService.ts
│   │   │   └── ZKProofService.ts
│   │   ├── storage/
│   │   │   ├── StorageService.ts
│   │   │   ├── EncryptionService.ts
│   │   │   └── IndexedDBService.ts
│   │   ├── x402/
│   │   │   ├── x402PaymentService.ts
│   │   │   ├── PaymentChannelService.ts
│   │   │   ├── GrantService.ts
│   │   │   └── MicroPaymentService.ts
│   │   ├── auth/
│   │   │   ├── BiometricService.ts
│   │   │   ├── WebAuthnService.ts
│   │   │   └── PINService.ts
│   │   └── api/
│   │       ├── RPCService.ts
│   │       └── IndexerService.ts
│   │
│   ├── hooks/                    # Custom React hooks (adapted from mobile)
│   │   ├── useWallet.ts
│   │   ├── useTransaction.ts
│   │   ├── useBalance.ts
│   │   ├── useNetwork.ts
│   │   ├── usePrivacy.ts
│   │   ├── useX402.ts
│   │   ├── useSession.ts
│   │   └── useExtensionMessage.ts
│   │
│   ├── types/                    # TypeScript type definitions
│   │   ├── wallet.ts
│   │   ├── transaction.ts
│   │   ├── privacy.ts
│   │   ├── x402.ts
│   │   ├── chain.ts
│   │   └── index.ts
│   │
│   ├── schemas/                  # Zod validation schemas
│   │   ├── wallet.ts
│   │   ├── transaction.ts
│   │   ├── x402.ts
│   │   └── index.ts
│   │
│   ├── styles/                   # Global styles & design tokens (from mobile)
│   │   ├── design-tokens.ts      # Colors, typography, spacing
│   │   ├── globals.css           # Global styles
│   │   └── themes.ts             # Dark/light theme definitions
│   │
│   ├── utils/                    # Utility functions
│   │   ├── crypto.ts
│   │   ├── formatting.ts
│   │   ├── validation.ts
│   │   ├── address.ts
│   │   ├── chain.ts
│   │   └── storage.ts
│   │
│   ├── constants/                # App constants
│   │   ├── chains.ts             # Chain configurations
│   │   ├── tokens.ts             # Token list
│   │   ├── rpc.ts                # RPC endpoints
│   │   └── x402.ts               # x402 config
│   │
│   ├── i18n/                     # Internationalization (if needed)
│   │   └── index.ts
│   │
│   └── App.tsx                   # Main app component
│
├── tests/
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   └── e2e/                      # E2E tests (Playwright)
│
├── vite.config.ts                # Vite configuration for extension
├── tsconfig.json                 # TypeScript config
├── package.json                  # Dependencies
├── .env.example                  # Environment variables template
└── README.md                     # Project README
```

---

## 🔄 Data Flow Diagrams

### User Authentication Flow

```
User Opens Extension
    ↓
├─ Has stored wallet?
│  ├─ Yes → Check session timeout
│  │        ├─ Active → Show dashboard
│  │        └─ Expired → Lock wallet (WebAuthn/PIN)
│  │
│  └─ No → Show onboarding
│           ├─ Create wallet → Generate mnemonic (SecureStore-equivalent)
│           ├─ Import wallet → Enter seed phrase
│           └─ Hardware wallet → Connect Ledger/Trezor
│
Setup biometric auth (optional but recommended)
    ↓
Enter PIN as fallback
    ↓
Show dashboard
```

### Send Transaction Flow

```
User clicks Send
    ↓
Select recipient & amount
    ↓
Choose payment mode (public/private)
    ├─ Public: Validate address → Show fee estimate → Confirm
    │           ↓
    │          Sign with TweetNaCl/secp256k1 (in-memory)
    │           ↓
    │          Broadcast via RPC
    │           ↓
    │          Poll for confirmation
    │
    └─ Private: Check SPP readiness (testnet only)
                ↓
               Generate ZK proof (Groth16)
                ↓
               Shield/transfer/unshield flow
                ↓
               Broadcast & reconcile
```

### x402 Payment Request Flow

```
User visits website with x402 endpoint
    ↓
Content script detects x402 header/meta tag
    ↓
Page makes fetch() to x402 URL
    ↓
Content script intercepts & displays overlay
    ├─ Show payment details (amount, service, recipient)
    ├─ User confirms → extension proceeds
    └─ User denies → request fails
    ↓
Extension creates payment channel (if needed)
    ↓
Sign & send x402 proof
    ↓
Service verifies & responds with content
    ↓
Remove overlay, inject response into page
```

### x402 Grant Management Flow

```
User goes to x402GrantsScreen
    ↓
List existing payment authorizations
    ├─ Grant name (service)
    ├─ Limit (amount/month)
    ├─ Expiration
    └─ Revoke button
    ↓
Create new grant
    ├─ Enter service URL
    ├─ Set monthly limit
    ├─ Approve with biometric/PIN
    └─ Store grant + generate channel ID
```

---

## 🔐 Security Architecture

### Key Storage & Encryption

```
Browser Extension Storage Hierarchy:

┌─────────────────────────────────────┐
│ Sensitive Data (Encrypted)          │
├─────────────────────────────────────┤
│ • Mnemonic                          │
│ • Private keys (derived)            │
│ • x402 channel secrets              │
│ • Session tokens                    │
│                                     │
│ Encryption: AES-256-GCM             │
│ Key Derivation: PBKDF2(PIN/pass)   │
│ Storage: IndexedDB (encrypted)      │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│ Semi-Sensitive Data (Hashed)        │
├─────────────────────────────────────┤
│ • Public addresses                  │
│ • Transaction history               │
│ • Grant metadata                    │
│                                     │
│ Hashing: SHA-256 or Blake2b         │
│ Storage: chrome.storage.local       │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│ Public Data (Plaintext)             │
├─────────────────────────────────────┤
│ • Settings (theme, language)        │
│ • Network preferences               │
│ • UI state                          │
│                                     │
│ Storage: chrome.storage.local       │
└─────────────────────────────────────┘
```

### Session Management

```
Session Lifecycle:

┌─ User unlocks wallet (biometric/PIN)
│  ├─ Create session token
│  ├─ Set inactivity timer (configurable: 5-60 min)
│  └─ Store in volatile memory (not persisted)
│
├─ User active
│  ├─ Reset inactivity timer on every action
│  └─ Show remaining time indicator (optional)
│
└─ Inactivity timeout reached
   ├─ Clear session token
   ├─ Lock UI (show unlock screen)
   ├─ Require biometric/PIN to resume
   └─ No sensitive data left in memory
```

### Message Security (Popup ↔ Background)

```
All inter-process communication must be validated:

┌─ Popup sends message to background
│  ├─ Add message signature (HMAC-SHA256)
│  ├─ Include timestamp + nonce
│  └─ Validate in background before processing
│
└─ Background responds to popup
   ├─ Sign response with same HMAC
   ├─ Include original message ID
   └─ Popup validates response matches request
```

---

## 💾 Storage Strategy

### IndexedDB Schema

```typescript
// ObjectStores:

WalletData {
  keyPath: 'id',
  data: {
    mnemonic: encrypted,
    accounts: [
      { address, network, derivationPath, isActive }
    ],
    addressBook: [
      { label, address, network }
    ]
  }
}

Transactions {
  keyPath: 'hash',
  indexes: ['from', 'to', 'network', 'timestamp'],
  data: {
    hash, from, to, amount, network, 
    status, timestamp, type (send/receive/privacy)
  }
}

x402Channels {
  keyPath: 'channelId',
  indexes: ['service', 'expiration'],
  data: {
    channelId, service, limit, spent, 
    expiration, isActive
  }
}

Sessions {
  keyPath: 'sessionId',
  data: {
    sessionId, createdAt, lastActivityAt,
    expiresAt, userAddress
  }
}

PrivacyCommitments {
  keyPath: 'commitmentId',
  indexes: ['status'],
  data: {
    commitmentId, nullifier, secret,
    amount, token, status (pending/confirmed)
  }
}
```

### chrome.storage Usage

```typescript
// Small config data only (max 10MB total)

chrome.storage.local {
  settings: {
    theme: 'dark|light',
    language: 'en|es|fr',
    network: 'ethereum|polygon|solana|stellar',
    rpcEndpoint: string,
    sessionTimeout: number
  },
  
  userPreferences: {
    defaultChain: string,
    showPrices: boolean,
    hideBalance: boolean,
    notificationsEnabled: boolean
  }
}
```

---

## 🔗 Inter-Process Communication (IPC)

### Message Protocol

```typescript
// All messages follow this structure:

interface Message {
  type: 'WALLET_ACTION' | 'PRIVACY_ACTION' | 'x402_ACTION' | 'UI_ACTION'
  action: string
  payload: any
  id: string (UUID for request/response matching)
  timestamp: number
  signature?: string (HMAC for validation)
}

// Examples:

// Send transaction
{
  type: 'WALLET_ACTION',
  action: 'SEND_TRANSACTION',
  payload: { to, amount, network, gasLimit },
  id: 'uuid-1234'
}

// Create x402 grant
{
  type: 'x402_ACTION',
  action: 'CREATE_GRANT',
  payload: { service, limit, duration },
  id: 'uuid-5678'
}

// Lock wallet
{
  type: 'UI_ACTION',
  action: 'LOCK_WALLET',
  payload: {},
  id: 'uuid-9999'
}
```

---

## 📦 Dependencies & Tech Stack

### Core Dependencies

```json
{
  "react": "19.2.0",
  "react-dom": "19.2.0",
  "zustand": "^5.0.0",
  "zod": "^3.23.0",
  "viem": "^2.50.0",
  "ethers": "^6.12.0",
  "@solana/web3.js": "^1.91.0",
  "@stellar/stellar-sdk": "^14.6.0",
  "tweetnacl": "^1.0.3",
  "@noble/secp256k1": "2.1.0",
  "libp2p": "^1.0.0",
  "snarkjs": "^0.7.2",
  "uuid": "^9.0.0"
}
```

### Development Dependencies

```json
{
  "vite": "^5.0.0",
  "@vitejs/plugin-react": "^4.0.0",
  "@types/chrome": "^0.0.241",
  "typescript": "^5.4.0",
  "jest": "^29.7.0",
  "@testing-library/react": "^15.0.0",
  "playwright": "^1.40.0",
  "web-ext": "^7.6.0"
}
```

---

## ✅ Next Steps

1. **Review architecture** — Confirm all layers align with requirements
2. **Create Vite config** — Set up for manifest v3 extension build
3. **Implement background script** — Core logic, message handling
4. **Build UI components** — Adapt from mobile, ensure Sovereign Minimalist theme
5. **Integrate crypto libraries** — TweetNaCl, viem, Solana Web3
6. **Implement x402 layer** — Payment channels, grant management
7. **Add testing** — Unit, integration, e2e tests

---

**Next Document:** `4_IMPLEMENTATION_ROADMAP.md` (phases, timeline, milestones)
