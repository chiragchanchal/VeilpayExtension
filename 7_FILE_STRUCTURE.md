# Veilpay Browser Extension - File Structure

**Version:** 1.0  
**Date:** 2026-08-08  
**Status:** Architecture Plan

---

## 📁 Recommended Project Structure

```
veilpay-extension/
│
├── public/
│   ├── manifest.json                 # Chrome extension manifest (v3)
│   ├── icons/
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   ├── icon-128.png
│   │   └── logo.svg
│   ├── popup.html                    # Popup entry point
│   └── background.html               # Service worker template
│
├── src/
│   ├── manifest.ts                   # Manifest v3 typed definition
│   │
│   ├── popup/                        # Popup UI (React + Vite)
│   │   ├── App.tsx                   # Root popup component
│   │   ├── index.tsx                 # Entry point
│   │   ├── routes/                   # Popup navigation screens
│   │   │   ├── Home.tsx
│   │   │   ├── Send.tsx
│   │   │   ├── Receive.tsx
│   │   │   ├── Settings.tsx
│   │   │   ├── TransactionHistory.tsx
│   │   │   ├── PrivateTransfer.tsx   # New privacy feature
│   │   │   ├── StealthAddress.tsx    # New privacy feature
│   │   │   ├── EncryptedNotes.tsx    # New privacy feature
│   │   │   ├── X402Manager.tsx       # New x402 feature
│   │   │   └── PaymentOverlay.tsx    # x402 request handler
│   │   ├── components/               # Shared UI components
│   │   │   ├── buttons/
│   │   │   │   ├── PrimaryButton.tsx
│   │   │   │   ├── SecondaryButton.tsx
│   │   │   │   └── IconButton.tsx
│   │   │   ├── cards/
│   │   │   │   ├── BalanceCard.tsx
│   │   │   │   ├── AssetCard.tsx
│   │   │   │   └── TransactionCard.tsx
│   │   │   ├── modals/
│   │   │   │   ├── ConfirmModal.tsx
│   │   │   │   ├── ErrorModal.tsx
│   │   │   │   ├── X402ApprovalModal.tsx  # New
│   │   │   │   └── BiometricPrompt.tsx
│   │   │   ├── inputs/
│   │   │   │   ├── TextInput.tsx
│   │   │   │   ├── AddressInput.tsx
│   │   │   │   ├── AmountInput.tsx
│   │   │   │   └── PasswordInput.tsx
│   │   │   ├── icons/
│   │   │   │   ├── NetworkIcon.tsx
│   │   │   │   ├── ChainIcon.tsx
│   │   │   │   ├── TokenIcon.tsx
│   │   │   │   └── StatusIcon.tsx
│   │   │   ├── layouts/
│   │   │   │   ├── PopupLayout.tsx
│   │   │   │   ├── AuthLayout.tsx
│   │   │   │   └── ContentLayout.tsx
│   │   │   ├── navigation/
│   │   │   │   └── TabNavigation.tsx
│   │   │   └── common/
│   │   │       ├── LoadingSpinner.tsx
│   │   │       ├── ErrorBoundary.tsx
│   │   │       ├── EmptyState.tsx
│   │   │       └── SessionTimeoutWarning.tsx
│   │   └── styles/
│   │       ├── theme.ts              # Design tokens (reuse from mobile)
│   │       ├── globals.css
│   │       └── tailwind.config.ts    # Optional: Tailwind setup
│   │
│   ├── content-scripts/              # Content scripts (injected into pages)
│   │   ├── index.ts                  # Main content script
│   │   ├── x402-detector.ts          # Detect x402 requests on pages
│   │   ├── payment-overlay.ts        # Inject payment overlay
│   │   └── page-messaging.ts         # Communication with page context
│   │
│   ├── background/                   # Service worker (persistent logic)
│   │   ├── index.ts                  # Main service worker
│   │   ├── message-handlers.ts       # Handle extension messages
│   │   ├── x402-handler.ts           # x402 payment orchestration
│   │   ├── storage-sync.ts           # Sync state across tabs
│   │   └── alarms.ts                 # Session timeout & periodic tasks
│   │
│   ├── stores/                       # Zustand state management (reuse mobile patterns)
│   │   ├── walletStore.ts            # Wallet state
│   │   ├── transactionStore.ts       # Transaction history
│   │   ├── settingsStore.ts          # User settings & preferences
│   │   ├── addressBookStore.ts       # Saved addresses
│   │   ├── x402Store.ts              # x402 grants & payments (NEW)
│   │   ├── privacyStore.ts           # Privacy commitments & stealth addresses (NEW)
│   │   ├── sessionStore.ts           # Session & auth state (NEW)
│   │   └── notificationStore.ts      # Toast/notification queue (NEW)
│   │
│   ├── services/                     # Business logic & integrations
│   │   ├── wallet/
│   │   │   ├── walletService.ts      # HD wallet derivation, account mgmt
│   │   │   ├── cryptoService.ts      # Encryption/decryption (TweetNaCl)
│   │   │   ├── keyManagement.ts      # Private key handling
│   │   │   └── mnemonic.ts           # Mnemonic generation & validation
│   │   ├── blockchain/
│   │   │   ├── evmService.ts         # EVM chain interactions (viem)
│   │   │   ├── solanaService.ts      # Solana interactions (@solana/web3.js)
│   │   │   ├── stellarService.ts     # Stellar interactions (@stellar/sdk)
│   │   │   ├── rpcProvider.ts        # Shared RPC provider management
│   │   │   └── networkService.ts     # Chain/network configuration
│   │   ├── privacy/
│   │   │   ├── stealthService.ts     # Stealth address generation (NEW)
│   │   │   ├── encryptedNoteService.ts # Encrypted notes (NEW)
│   │   │   ├── zkProverService.ts    # ZK proof generation (NEW)
│   │   │   ├── commitmentService.ts  # Manage commitments (NEW)
│   │   │   └── privacyCircuits.ts    # Integration with snarkjs (NEW)
│   │   ├── x402/
│   │   │   ├── x402Service.ts        # x402 grant & payment mgmt (NEW)
│   │   │   ├── paymentChannelService.ts # Payment channel operations (NEW)
│   │   │   ├── x402Parser.ts         # Parse x402 headers/metadata (NEW)
│   │   │   └── paymentProofService.ts # Generate proof of payment (NEW)
│   │   ├── api/
│   │   │   ├── apiClient.ts          # Backend API client
│   │   │   ├── indexerClient.ts      # Indexer polling
│   │   │   ├── webhookHandler.ts     # Receive webhook events
│   │   │   └── errorHandler.ts       # API error handling
│   │   ├── storage/
│   │   │   ├── storageService.ts     # chrome.storage API wrapper
│   │   │   ├── indexedDbService.ts   # IndexedDB for large data
│   │   │   ├── encryptedStorage.ts   # Encrypt sensitive data before storing
│   │   │   └── syncService.ts        # Sync across extension contexts
│   │   └── platform/
│   │       ├── extensionMessaging.ts # chrome.runtime.sendMessage wrapper
│   │       ├── contentScriptBridge.ts # Communicate with content scripts
│   │       └── pageMessaging.ts      # Page ↔ content script messaging
│   │
│   ├── hooks/                        # Custom React hooks (reuse mobile patterns)
│   │   ├── useWallet.ts
│   │   ├── useTransaction.ts
│   │   ├── useBalance.ts
│   │   ├── useNetwork.ts
│   │   ├── usePrivacy.ts             # NEW: Privacy operations
│   │   ├── useX402.ts                # NEW: x402 operations
│   │   ├── useSession.ts             # NEW: Session management
│   │   ├── useStorageSync.ts         # NEW: Sync storage across contexts
│   │   └── useExtensionMessage.ts    # NEW: Extension messaging
│   │
│   ├── schemas/                      # Zod validation schemas
│   │   ├── transaction.ts
│   │   ├── wallet.ts
│   │   ├── address.ts
│   │   ├── x402.ts                   # NEW: x402 request/response schemas
│   │   ├── privacy.ts                # NEW: Privacy operation schemas
│   │   └── payment.ts                # NEW: Payment schemas
│   │
│   ├── types/                        # TypeScript type definitions
│   │   ├── index.ts                  # Main type barrel
│   │   ├── wallet.ts
│   │   ├── transaction.ts
│   │   ├── chain.ts
│   │   ├── x402.ts                   # NEW: x402 types
│   │   ├── privacy.ts                # NEW: Privacy types
│   │   ├── extension.ts              # NEW: Extension-specific types
│   │   └── messages.ts               # NEW: Message interface types
│   │
│   ├── utils/                        # Utility functions
│   │   ├── format.ts                 # Number/address formatting
│   │   ├── validation.ts             # Input validation helpers
│   │   ├── crypto.ts                 # Crypto utility functions
│   │   ├── conversion.ts             # Unit conversion helpers
│   │   ├── error.ts                  # Error formatting
│   │   ├── x402.ts                   # NEW: x402 utilities
│   │   ├── privacy.ts                # NEW: Privacy utilities
│   │   ├── session.ts                # NEW: Session timeout helpers
│   │   └── security.ts               # NEW: Security helpers (encryption, etc)
│   │
│   ├── constants/                    # App constants
│   │   ├── chains.ts                 # Chain configurations
│   │   ├── tokens.ts                 # Token metadata
│   │   ├── api.ts                    # API endpoints
│   │   ├── x402.ts                   # NEW: x402 defaults & constants
│   │   ├── privacy.ts                # NEW: Privacy parameters
│   │   └── ui.ts                     # UI constants
│   │
│   ├── i18n/                         # Internationalization (optional)
│   │   ├── index.ts
│   │   ├── en.json
│   │   └── locales/
│   │
│   ├── lib/                          # Shared libraries
│   │   ├── snarkjs-wrapper.ts        # Wrapper around snarkjs for ZK proofs
│   │   ├── libp2p-crypto.ts          # libp2p crypto wrappers
│   │   ├── tweetnacl-wrapper.ts      # TweetNaCl convenience functions
│   │   ├── viem-wrapper.ts           # viem extensions
│   │   └── solana-wrapper.ts         # Solana SDK extensions
│   │
│   └── index.tsx                     # Main entry point for popup
│
├── tests/                            # Test files (mirror src structure)
│   ├── unit/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── stores/
│   │   └── hooks/
│   ├── integration/
│   │   ├── x402-flow.test.ts
│   │   ├── privacy-flow.test.ts
│   │   └── wallet-operations.test.ts
│   ├── e2e/
│   │   └── extension.spec.ts         # Playwright tests
│   └── fixtures/
│       ├── mockData.ts
│       ├── mockChains.ts
│       └── mockX402Requests.ts
│
├── config/
│   ├── vite.config.ts                # Vite build config
│   ├── webpack.config.ts             # Alternative webpack config
│   ├── tsconfig.json
│   ├── eslint.config.js
│   ├── prettier.config.js
│   └── tailwind.config.ts            # If using Tailwind
│
├── scripts/
│   ├── build.sh                      # Build for production
│   ├── dev.sh                        # Development build
│   ├── package.sh                    # Package for Chrome Web Store
│   ├── generate-keys.ts              # Generate test keypairs
│   └── migrate-from-mobile.ts        # Helper to migrate mobile state
│
├── docs/
│   ├── ARCHITECTURE.md               # High-level architecture
│   ├── X402_INTEGRATION.md           # x402 payment flow details
│   ├── PRIVACY_IMPLEMENTATION.md     # Privacy feature details
│   ├── EXTENSION_MESSAGING.md        # Extension message protocol
│   ├── SECURITY_MODEL.md             # Security considerations
│   ├── TESTING_GUIDE.md              # Testing approach
│   └── DEPLOYMENT.md                 # Chrome Web Store & GitHub release
│
├── .github/
│   ├── workflows/
│   │   ├── test.yml                  # Run tests on PR
│   │   ├── build.yml                 # Build on main branch
│   │   └── release.yml               # Create GitHub releases
│   └── ISSUE_TEMPLATE/
│
├── .env.example                      # Example environment variables
├── .gitignore
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── README.md
└── LICENSE

```

---

## 📊 Key Directories Explained

### `src/popup/`
- **React component tree** matching mobile app screens
- All 25+ screens ported to extension UI
- Uses Vite hot reload during development
- Optimized for small viewport (typical extension popup: 340×600px, expandable to fullscreen)

### `src/content-scripts/`
- **Injected into every website** the user visits
- Detects x402 payment requests (headers, meta tags, etc.)
- Communicates with background service worker via `chrome.runtime`
- Non-blocking; user must explicitly approve payments

### `src/background/`
- **Service Worker** (persistent logic that survives tab closes)
- Handles wallet operations, transaction signing, storage sync
- Orchestrates x402 payment flows
- Manages session timeouts and security

### `src/stores/`
- **Zustand stores** for state management
- Synced across popup, background, content scripts
- Persisted to `chrome.storage.local` (backed up by IndexedDB for large data)
- NEW stores for x402 and privacy operations

### `src/services/`
- **Business logic layer** isolated from UI
- Wallet operations, signing, privacy computations
- Backend API communication
- Chain interactions via viem/Web3.js

### `src/hooks/`
- **Custom React hooks** following mobile patterns
- Connect components to stores and services
- Manage loading states, errors, side effects

---

## 🔐 Storage Architecture

### `chrome.storage.local` (Encrypted)
```
{
  "wallet:": {
    "accounts": [...],           // Encrypted
    "selectedAccount": "...",
    "derivationPath": "m/44'/60'/0'/0"
  },
  "transactions:": [...],        // Encrypted
  "settings:": {...},            // Plain
  "addressBook:": [...],         // Plain
  "x402Grants:": [...],          // Encrypted
  "privacyCommitments:": [...],  // Encrypted
}
```

### `IndexedDB` (For large data)
```
Database: "VeilpayExtension"
Object Stores:
  - "transactions" (indexed by date, chainId)
  - "blockchainEvents" (indexed by blockNumber, chainId)
  - "x402History" (indexed by timestamp, status)
  - "encryptedNotes" (indexed by commitmentHash)
```

---

## 🔌 Extension APIs Used

| API | Purpose |
|-----|---------|
| `chrome.runtime.sendMessage()` | Popup ↔ Background communication |
| `chrome.tabs.sendMessage()` | Background ↔ Content script communication |
| `window.postMessage()` | Content script ↔ Page context communication |
| `chrome.storage.local` | Persistent storage (sync across contexts) |
| `chrome.alarms` | Session timeout, periodic tasks |
| `chrome.webRequest` | Optional: intercept network requests for x402 detection |
| `chrome.declarativeNetRequest` | Optional: redirect x402 requests |

---

## 🏗️ Build Output Structure

After build, dist will contain:

```
dist/
├── manifest.json
├── popup.html
├── popup.js                # React app bundle
├── popup.css
├── background.js           # Service worker bundle
├── content-script.js       # Content script bundle
├── icons/
└── ...other static assets
```

**Bundle size targets:**
- Popup bundle: < 500KB (gzipped)
- Background bundle: < 300KB (gzipped)
- Content script: < 100KB (gzipped)
- Total: < 1MB (gzipped)

---

## 📦 Dependencies Summary

### Core
- `react@19.2.0` - UI framework
- `react-dom@19.2.0` - DOM rendering
- `zustand@5.0.12` - State management
- `zod@3.23.0` - Validation

### Blockchain
- `viem@2.50.4` - EVM interactions
- `@solana/web3.js@1.91.0` - Solana
- `@stellar/stellar-sdk@14.6.1` - Stellar
- `ethers@6.12.0` - Fallback/legacy

### Privacy
- `snarkjs@0.7.2` - ZK proof generation
- `libp2p@1.x.x` - P2P crypto (optional)
- `tweetnacl-js@1.0.3` - Cryptography
- `@noble/secp256k1@2.1.0` - Signing

### Extension/Build
- `vite@5.x.x` - Build tool
- `@vitejs/plugin-react@4.x.x` - React support
- `crx@5.x.x` - Chrome extension builder (optional)

### Storage
- `idb@8.x.x` - IndexedDB wrapper

### Testing
- `vitest@1.x.x` - Unit tests
- `@testing-library/react@13.x.x` - Component testing
- `playwright@1.x.x` - E2E tests

---

## 🔄 Data Flow Example: Send Transaction

```
1. User clicks "Send" button in popup
2. PopupComponent dispatches action to walletStore
3. walletStore calls transactionService.buildTransaction()
4. transactionService validates + signs using walletService
5. walletService retrieves encrypted private key from storage
6. walletService signs transaction with viem/ethers
7. transactionService broadcasts via RPC
8. transactionStore updates pending transaction
9. Background service worker polls indexer for confirmation
10. Once confirmed, background updates transactionStore
11. PopupComponent re-renders showing confirmation
```

---

## Next Steps

1. **Setup Vite** with React + TypeScript
2. **Install dependencies** (see package.json)
3. **Create manifest.json** (Chrome extension v3)
4. **Implement wallet service** (reuse mobile code)
5. **Build popup UI** (port mobile screens)
6. **Create background service worker**
7. **Build content script** for x402 detection
8. **Add storage layer** (chrome.storage + IndexedDB)
9. **Implement x402 payment flow**
10. **Add privacy features** (stealth, encrypted notes, ZK)
11. **Testing** (unit, integration, e2e)
12. **Package & deploy** (Chrome Web Store + GitHub)

