# Veilpay Repository Complete Documentation

**Repository:** https://github.com/Veilpayapp/VEILPAY-APP  
**Language:** TypeScript  
**Build Tool:** Turbo (monorepo)  
**Package Manager:** pnpm 9.x  
**Node.js:** 20.11.0 (pinned in `.nvmrc`)

---

## 📋 Table of Contents

1. [Repository Overview](#repository-overview)
2. [Monorepo Structure](#monorepo-structure)
3. [Consumer App (Expo React Native)](#consumer-app-expo-react-native)
4. [Backend (Express API)](#backend-express-api)
5. [Indexer (Chain Events)](#indexer-chain-events)
6. [Shared Packages](#shared-packages)
7. [Smart Contracts & Circuits](#smart-contracts--circuits)
8. [Key Technologies & Dependencies](#key-technologies--dependencies)

---

## Repository Overview

Veilpay is a **multi-privacy payments wallet** supporting public and private transactions across three blockchain networks:

- **EVM:** Ethereum, Polygon, Arbitrum, Optimism, Base, BSC, Sepolia
- **Solana:** Mainnet, Devnet
- **Stellar:** Mainnet, Testnet (with native Private XLM support via Stellar Private Payments)

### Core Architecture Principles
- **User signing material** (mnemonics, private keys) remains on-device in SecureStore
- **Backend** acts as infrastructure boundary, never accessing signing material
- **Indexer** polls chain events and syncs state
- **Three main executable surfaces:** Consumer App, Backend API, Indexer

---

## Monorepo Structure

```
veilpay-app/
├── config/                    # Root configuration
│   ├── tsconfig/              # TypeScript configurations
│   ├── turbo.json             # Turbo build orchestration
│   ├── prettier.config.js     # Code formatting
│   └── eslint.config.js       # Linting rules
├── infra/                     # Infrastructure & deployment configs
├── docs/                      # Product, architecture, security docs
├── e2e/                       # End-to-end tests
├── scripts/                   # Automation scripts
│
├── apps/
│   ├── consumer-app/          # Expo React Native wallet (primary UI)
│   ├── backend/               # Express API server
│   └── indexer/               # Chain event indexer & status detection
│
├── packages/
│   ├── shared/                # Shared types, validation (Zod)
│   ├── contracts-evm/         # EVM contracts (Solidity/Foundry)
│   ├── circuits/              # Circom privacy circuits
│   ├── contracts-solana/      # Solana programs (Anchor)
│   ├── spp-native/            # Stellar Private Payments native bridge (Rust)
│   ├── auditor/               # Security auditing tools
│   └── vendor/                # Vendored dependencies (git submodules)
│
├── package.json               # Root workspace configuration
├── pnpm-workspace.yaml        # Workspace layout definition
└── pnpm-lock.yaml             # Dependency lock file
```

---

## Consumer App (Expo React Native)

**Path:** `apps/consumer-app/`  
**Language:** TypeScript + React Native  
**Framework:** Expo (managed React Native)

### Source Structure

```
apps/consumer-app/src/
├── components/                # Reusable UI components
├── screens/                   # Full-screen pages/views
├── stores/                    # Zustand state management
├── services/                  # API & blockchain integrations
├── hooks/                     # Custom React hooks
├── navigation/                # React Navigation setup
├── features/                  # Feature-specific logic
├── constants/                 # App-wide constants
├── schemas/                   # Zod validation schemas
├── types/                     # TypeScript type definitions
├── utils/                     # Utility functions
├── i18n/                      # Internationalization
├── styles/                    # Global & theme styles
└── __tests__/                 # Unit & integration tests
```

### Key Components

#### Components (UI Building Blocks)

| Component | Purpose |
|-----------|---------|
| `BiometricPrompt.tsx` | Biometric authentication (fingerprint/face ID) |
| `BootSplash.tsx` | Splash screen during app startup |
| `BottomNavBar.tsx` | Primary navigation bar with tabs |
| `Button.tsx` | Reusable button component |
| `Card.tsx` | Container/card layout |
| `CurrencySelectorModal.tsx` | Currency/token selection UI |
| `FiatGatewayModal.tsx` | Fiat on/off-ramp integration |
| `Icon.tsx` | Icon system (SVG/font icons) |
| `NetworkIcons.tsx` | Network-specific icons (EVM, Solana, Stellar) |
| `WalletIcons.tsx` | Wallet visual indicators |
| `ErrorBoundary.tsx` | React error boundary wrapper |
| `EmptyState.tsx` | Empty state UI patterns |
| `ErrorState.tsx` | Error display component |
| `ZkpProver.tsx` | Zero-knowledge proof proving interface |
| `CommitmentSaveBanner.tsx` | Privacy commitment state banner |
| `HybridInput.tsx` | Multi-mode input field |
| `Logo.tsx` | App logo component |
| **Dashboard Components** | `dashboard/` - Dashboard-specific UI |
| **Home Components** | `home/` - Home screen sub-components |
| **Payment Components** | `payment/` - Payment flow UI |

#### Screens (Full Pages)

| Screen | Purpose |
|--------|---------|
| `HomeDashboardScreen.tsx` | Main wallet dashboard/home |
| `OnboardingScreen.tsx` | Initial app onboarding flow |
| `CreateWalletScreen.tsx` | Create new wallet UI |
| `ImportWalletScreen.tsx` | Import existing wallet (seed phrase) |
| `BackupWalletScreen.tsx` | Wallet backup/seed phrase display |
| `BiometricSetupScreen.tsx` | Biometric authentication setup |
| `ExportPrivateKeyScreen.tsx` | Export private key (with confirmation) |
| `DepositCryptoScreen.tsx` | Receive/deposit address display |
| `SendCryptoScreen.tsx` | Send transaction form |
| `PaymentConfirmScreen.tsx` | Transaction confirmation UI |
| `PaymentResultScreen.tsx` | Transaction result/receipt |
| `TransactionHistoryScreen.tsx` | List of past transactions |
| `TransactionDetailsScreen.tsx` | Single transaction details |
| `ReceiveScreen.tsx` | Receive address/QR code |
| `SettingsScreen.tsx` | App settings & preferences |
| `NetworkSettingsScreen.tsx` | RPC & network configuration |
| `AddCustomNetworkScreen.tsx` | Add custom EVM network |
| `VerifyWalletScreen.tsx` | Seed phrase verification |
| `OnrampAmountScreen.tsx` | Fiat on-ramp amount input |
| `OnrampQuotesScreen.tsx` | Fiat provider quotes |
| `OnrampWidgetScreen.tsx` | Fiat gateway widget |
| `TransakWebViewScreen.tsx` | Transak integration WebView |
| `WithdrawFiatScreen.tsx` | Fiat off-ramp withdrawal |
| `InAppBrowserScreen.tsx` | In-app web browser |
| `WalletConnectScreen.tsx` | WalletConnect session management |

### State Management (Zustand Stores)

**Path:** `apps/consumer-app/src/stores/`

| Store | Responsibility |
|-------|-----------------|
| `walletStore.ts` | Primary wallet state (accounts, balances, private keys) |
| `transactionStore.ts` | Transaction history & pending transactions |
| `settingsStore.ts` | User preferences (theme, network, language) |
| `addressBookStore.ts` | Saved contact addresses |
| `sppAccountStore.ts` | Stellar Private Payments account state |
| `sppNoteStore.ts` | Private notes for SPP transactions |
| `commitmentStore.ts` | Privacy commitment/proof tracking |
| `pendingCommitmentQueue.ts` | Queue of pending privacy commitments |

### Custom Hooks

**Path:** `apps/consumer-app/src/hooks/`

Common hooks likely include:
- `useWallet()` - Access wallet store
- `useTransaction()` - Transaction operations
- `useBalance()` - Balance queries
- `useNetwork()` - Network management
- `useBiometric()` - Biometric auth
- `useNavigation()` - Navigation utilities
- `useApi()` - Backend API calls

### Services (API & Blockchain Integration)

**Path:** `apps/consumer-app/src/services/`

Expected service modules:
- `walletService.ts` - HD wallet derivation, account management
- `transactionService.ts` - Transaction building & submission
- `blockchainService.ts` - Chain RPC interactions (viem/Web3.js)
- `solanaService.ts` - Solana Web3 SDK integration
- `stellarService.ts` - Stellar SDK + SPP native bridge
- `apiService.ts` - Backend API client
- `storageService.ts` - Expo SecureStore for sensitive data
- `biometricService.ts` - Biometric authentication
- `qrCodeService.ts` - QR code generation/scanning
- `cryptoService.ts` - Encryption/decryption utilities

### Navigation Structure

**Path:** `apps/consumer-app/src/navigation/`

- React Navigation stacks (native stack, bottom tabs)
- Auth stack (pre-wallet screens)
- App stack (post-wallet screens)
- Deep linking configuration
- Route parameters & linking

### Constants

**Path:** `apps/consumer-app/src/constants/`

- `chains.ts` - Supported chain configurations
- `tokens.ts` - Token list & metadata
- `api.ts` - API endpoints & timeout settings
- `ui.ts` - UI dimensions, spacing, colors
- `errors.ts` - Error messages & codes

### Schemas (Zod Validation)

**Path:** `apps/consumer-app/src/schemas/`

- Transaction validation schemas
- Payment form schemas
- Settings validation
- Address validation

---

## Backend (Express API)

**Path:** `apps/backend/`  
**Language:** TypeScript + Node.js  
**Framework:** Express  
**Database:** PostgreSQL (Prisma ORM)  
**Job Queue:** Redis + BullMQ

### Source Structure

```
apps/backend/src/
├── index.ts                   # Server entry point
├── config/                    # Environment & configuration
├── routes/                    # API route handlers
├── controllers/               # Business logic controllers
├── services/                  # Business services
├── middleware/                # Express middleware
├── jobs/                      # Async job handlers
├── lib/                       # Shared backend utilities
├── schemas/                   # Zod validation schemas
├── types/                     # TypeScript types
├── utils/                     # Utility functions
└── __tests__/                 # Tests
```

### API Routes

**Path:** `apps/backend/src/routes/`

Expected endpoints:

| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | Service health check |
| `/api/invoices` | POST | Create invoice |
| `/api/invoices/:id` | GET | Get invoice details |
| `/api/invoices/:id` | PUT | Update invoice |
| `/api/merchants` | POST | Register merchant |
| `/api/merchants/:id` | GET | Get merchant profile |
| `/api/webhooks` | POST | Webhook registration |
| `/api/webhooks/events` | POST | Webhook event delivery |
| `/api/rpc/*` | POST | RPC proxy endpoints (EVM, Solana, Stellar) |
| `/api/transactions` | POST | Transaction history query |
| `/api/balance` | POST | Balance check endpoint |

### Services

**Path:** `apps/backend/src/services/`

| Service | Responsibility |
|---------|-----------------|
| `merchantService.ts` | Merchant onboarding & management |
| `invoiceService.ts` | Invoice creation, status tracking |
| `webhookService.ts` | Webhook dispatch & retries |
| `rpcProxyService.ts` | RPC request forwarding & caching |
| `transactionService.ts` | Transaction tracking & reconciliation |
| `paymentService.ts` | Payment processing & settlement |
| `authService.ts` | API key validation |

### Middleware

**Path:** `apps/backend/src/middleware/`

- Authentication (API key validation)
- Request validation (Zod schemas)
- Rate limiting
- Error handling
- Logging/monitoring
- CORS

### Database Models (Prisma)

Expected schema entities:
- `Merchant` - Merchant accounts
- `Invoice` - Payment invoices
- `Transaction` - Transaction records
- `Webhook` - Webhook endpoints
- `WebhookEvent` - Event delivery log
- `ApiKey` - Merchant API credentials

### Jobs (BullMQ)

**Path:** `apps/backend/src/jobs/`

Async job handlers:
- Invoice status reconciliation
- Webhook delivery & retries
- Transaction confirmation polling
- Merchant settlement

---

## Indexer (Chain Events)

**Path:** `apps/indexer/`  
**Language:** TypeScript + Node.js  
**Purpose:** Poll blockchains, detect events, sync app state

### Source Structure

```
apps/indexer/src/
├── index.ts                   # Indexer entry point
├── config/                    # Chain & polling config
├── indexers/                  # Chain-specific indexers
├── lib/                       # Shared indexer utilities
├── queue/                     # Job queue setup
├── stealth/                   # Stealth address detection
├── webhook/                   # Webhook dispatching
└── __tests__/                 # Tests
```

### Chain Indexers

**Path:** `apps/indexer/src/indexers/`

| Indexer | Chain | Responsibility |
|---------|-------|-----------------|
| `evmIndexer.ts` | EVM | Poll EVM RPC, parse logs, detect transfers |
| `solanaIndexer.ts` | Solana | Poll Solana via web3.js, detect transactions |
| `stellarIndexer.ts` | Stellar | Poll Stellar ledger, detect payments & SPP events |

### Stealth Address Detection

**Path:** `apps/indexer/src/stealth/`

- Stealth address scanning logic
- Ephemeral key derivation
- Commitment detection

### Webhook Dispatcher

**Path:** `apps/indexer/src/webhook/`

- Event aggregation
- Merchant webhook dispatch
- Retry logic

### Configuration

**Path:** `apps/indexer/src/config/`

- Chain RPC endpoints
- Polling intervals
- Starting block numbers
- Network-specific parameters

---

## Shared Packages

### 1. Shared Types & Validation

**Path:** `packages/shared/src/`

| File | Content |
|------|---------|
| `index.ts` | Main export barrel |
| `types.ts` | Common TypeScript types |
| `chains.ts` | Chain configuration & constants |
| `common.ts` | Shared utilities & enums |

#### chains.ts

```typescript
// Expected exports:
- SupportedChain (union type)
- ChainConfig (interface)
- EVM_CHAINS
- SOLANA_CHAINS
- STELLAR_CHAINS
- getChainConfig(chainId)
- isValidChain(chainId)
```

#### types.ts

```typescript
// Expected types:
- Account
- Transaction
- Invoice
- Merchant
- Webhook
- WebhookEvent
- PaymentFlow
- PrivacyLevel
```

### 2. EVM Smart Contracts

**Path:** `packages/contracts-evm/`

Solidity contracts for privacy-preserving payments:

```
contracts-evm/
├── contracts/
│   ├── Stealth.sol            # Stealth address contract
│   ├── EncryptedNote.sol       # Encrypted note contract
│   ├── PrivacyPool.sol         # Privacy pool (experimental)
│   └── Verifier.sol            # ZK verifier contracts
├── circuits/                  # Circom circuit sources
├── test/                      # Forge tests
├── script/                    # Deployment scripts
├── foundry.toml              # Foundry config
└── README.md
```

### 3. Privacy Circuits

**Path:** `packages/circuits/`

Circom zero-knowledge circuits for privacy proofs:

```
circuits/
├── circuits/
│   ├── withdraw.circom        # Withdrawal proof
│   ├── transfer.circom        # Private transfer proof
│   ├── merkleProof.circom     # Merkle tree proof components
│   └── commitmentHash.circom  # Commitment hash proof
├── keys/                      # Proving/verification keys
├── test/                      # Test circuits
├── scripts/                   # Ceremony & compilation scripts
└── README.md
```

### 4. Solana Programs

**Path:** `packages/contracts-solana/`

Anchor-based Solana programs:

```
contracts-solana/
├── programs/
│   └── veilpay/               # Main Solana program
│       ├── src/
│       │   ├── lib.rs         # Program entry
│       │   ├── state.rs       # On-chain state
│       │   ├── instructions/  # Instruction handlers
│       │   └── errors.rs      # Custom errors
├── tests/                     # Anchor tests
└── Anchor.toml               # Anchor config
```

### 5. Stellar SPP Native Bridge

**Path:** `packages/spp-native/`

Rust native module for Stellar Private Payments:

```
spp-native/
├── src/
│   ├── lib.rs                 # FFI bindings
│   ├── account.rs             # SPP account management
│   ├── note.rs                # Note handling
│   └── proving.rs             # Proof generation
├── Cargo.toml
└── build.rs                   # Native build script
```

### 6. Security Auditor

**Path:** `packages/auditor/`

Tools for security verification & testing:

```
auditor/
├── src/
│   ├── cli/
│   │   └── index.ts           # CLI entry point
│   ├── checks/
│   │   ├── contractAudit.ts
│   │   ├── circuitAudit.ts
│   │   ├── keyManagement.ts
│   │   └── vulnerability.ts
│   └── reports/
│       └── generateReport.ts
├── package.json
└── README.md
```

---

## Smart Contracts & Circuits

### EVM Contracts

**Key Contracts:**

1. **Stealth.sol** - Ephemeral key-based stealth addresses
   - Account registration
   - Stealth address computation
   - Payment detection

2. **EncryptedNote.sol** - Encrypted note storage
   - Note encryption/decryption
   - Access control
   - Batch note retrieval

3. **PrivacyPool.sol** - Optional privacy pool (experimental)
   - Shielded input/output
   - Proof verification
   - Liquidity management

4. **Verifier.sol** - Zero-knowledge proof verification
   - Circuit-specific verifiers
   - Proof validation
   - Event logging

### Circom Circuits

**Key Circuits:**

1. **withdraw.circom** - Prove valid withdrawal
   - Merkle tree proof
   - Nullifier generation
   - Amount verification

2. **transfer.circom** - Prove private transfer
   - Sender commitment
   - Recipient encryption
   - Zero-knowledge proof

3. **merkleProof.circom** - Merkle tree inclusion
   - Leaf verification
   - Path validation

4. **commitmentHash.circom** - Pedersen/Poseidon hash
   - Commitment computation
   - Hash verification

### Solana Programs

**Key Instructions:**

- `Initialize` - Create privacy account
- `Shield` - Convert public to private
- `Unshield` - Convert private to public
- `PrivateTransfer` - Privacy-preserving transfer
- `UpdateNote` - Update encrypted note

---

## Key Technologies & Dependencies

### Frontend Stack
- **Runtime:** Expo / React Native
- **UI:** React, React Navigation
- **State:** Zustand
- **HTTP:** axios / fetch
- **Validation:** Zod
- **Blockchain:** viem, @solana/web3.js, stellar-sdk
- **Storage:** Expo SecureStore, AsyncStorage
- **Biometric:** react-native-biometrics

### Backend Stack
- **Runtime:** Node.js 20+
- **Framework:** Express
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Job Queue:** Redis + BullMQ
- **Validation:** Zod
- **HTTP:** axios

### Blockchain Libraries
- **EVM:** viem (primary), ethers.js (fallback)
- **Solana:** @solana/web3.js, @solana/spl-token
- **Stellar:** stellar-sdk, @stellar/js-stellar-spp
- **Privacy:** snarkjs, circomlibjs

### Development Tools
- **Build:** Turbo, Webpack/Metro
- **Type:** TypeScript 5.4+
- **Testing:** Jest
- **Smart Contracts:** Foundry, Anchor, Soroban CLI
- **Linting:** ESLint
- **Formatting:** Prettier
- **Version:** Node 20.11.0 (pinned)

---

## Development Workflow

### Setup

```bash
# Install dependencies
pnpm install

# Update git submodules
git submodule update --init --recursive

# Copy environment template
cp .env.example .env

# Start infrastructure
pnpm db:up
pnpm --filter @veilpay/backend db:generate
pnpm --filter @veilpay/backend db:migrate
```

### Running Services

```bash
# Terminal 1: Backend API
pnpm backend:dev

# Terminal 2: Indexer
pnpm indexer:dev

# Terminal 3: Consumer App
pnpm consumer:dev
```

### Quality Checks

```bash
pnpm lint              # ESLint
pnpm typecheck         # TypeScript type check
pnpm test              # Run tests
pnpm build             # Build backend & indexer
pnpm build:full        # Build all packages
pnpm format            # Auto-format code
pnpm format:check      # Check formatting
```

---

## File Manifest by Category

### Consumer App Components (50+)
- Biometric, Boot, Navigation, Modal, Input, Icon, Logo, Network, Wallet
- Payment, Transaction, Settings, Onboarding, Card, Button, List, Tab
- Error, Empty, Loading, Confirmation, Toast, Badge, Avatar, QR

### Consumer App Screens (25+)
- Home, Settings, Send, Receive, Transaction, Wallet, Onboarding
- Payment flows (confirmation, result), Privacy, Network, Fiat (on/off-ramp)
- WalletConnect, Browser, Backup, Import, Export, Biometric Setup

### Backend Routes
- Health, Invoices, Merchants, Webhooks, RPC Proxy, Transactions

### Backend Services
- Merchant, Invoice, Webhook, RPC, Transaction, Payment, Auth

### Indexer Components
- EVM, Solana, Stellar indexers
- Stealth address detection
- Webhook dispatcher
- Queue management

### Packages
- Shared: types, chains, validation
- EVM Contracts: Stealth, Encrypted Note, Privacy Pool, Verifier
- Circuits: Withdraw, Transfer, Merkle Proof, Commitment Hash
- Solana Programs: Privacy account, Shield/Unshield, Private Transfer
- SPP Native: Account, Note, Proving
- Auditor: CLI, checks, reports

---

## Security Considerations

1. **Private Key Management**
   - Keys stored in Expo SecureStore (device-level encryption)
   - Never transmitted to backend
   - On-device signing only

2. **Privacy XLM**
   - Requires native SPP capabilities
   - Full state synchronization before operations
   - Readiness gate prevents incomplete state operations

3. **Stealth Addresses**
   - Ephemeral key-based discovery
   - No on-chain link between sender and recipient
   - Indexed locally on client

4. **Zero-Knowledge Proofs**
   - Snarkjs circuit compilation
   - Local proof generation
   - Backend verification only

5. **API Security**
   - API key authentication
   - Rate limiting
   - Request validation (Zod)
   - Error sanitization

---

## Notes for Extension Development

- **Entry Point for Wallet Logic:** `apps/consumer-app/src/stores/walletStore.ts`
- **Transaction Building:** `apps/consumer-app/src/services/transactionService.ts`
- **Network Configuration:** `packages/shared/src/chains.ts`
- **State Management:** Zustand stores in `apps/consumer-app/src/stores/`
- **Type Definitions:** `packages/shared/src/types.ts` and `apps/consumer-app/src/types/`
- **API Communication:** Backend routes in `apps/backend/src/routes/`
- **Chain Polling:** Indexer in `apps/indexer/src/`
- **Privacy Implementation:** SPP native bridge in `packages/spp-native/`

---

**Last Updated:** 2026-08-07  
**Repository Status:** Active Development  
**External Audit:** Pending (not yet completed)
