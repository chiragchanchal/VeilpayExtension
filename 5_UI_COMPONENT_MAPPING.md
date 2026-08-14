# Veilpay Browser Extension - UI Component Mapping

**Version:** 1.0  
**Status:** Planning Phase  
**Created:** 2026-08-08

---

## 📱 UI Parity Strategy: Mobile → Extension

This document maps all 25+ mobile screens to browser extension equivalents, accounting for platform constraints and UX differences.

---

## 1. Onboarding Flows

### Mobile Screen: `OnboardingScreen.tsx` → Extension: `OnboardingFlow`

**Desktop Adaptations:**
- Full-width container (max 600px) centered on screen
- Multi-step wizard (not swipeable carousels)
- Navigation: Next/Back buttons instead of gestures
- Visual: Same color scheme, typography, spacing

**Extension Components:**
```tsx
<OnboardingFlow>
  <Step1_Welcome />
  <Step2_PrivacyExplainer />
  <Step3_CreateVsImport />
  <Step4_SeedGeneration />
  <Step5_Verification />
  <Step6_SecuritySetup />
</OnboardingFlow>
```

**Key Differences:**
- No biometric setup on first run (optional later)
- PIN/passphrase mandatory for extension
- QR code display (no camera on page 1)

---

### Mobile Screen: `CreateWalletScreen.tsx` → Extension: `CreateWalletModal`

**Desktop Adaptations:**
- Modal overlay (not full-screen)
- Seed display with copy button
- Verification checklist before confirm
- No haptic feedback (replace with toast notifications)

**Extension Components:**
```tsx
<CreateWalletModal>
  <SeedGeneration />
  <SeedDisplay /> {/* Copy, print, share warnings */}
  <SeedVerification /> {/* Forced sequencing */}
  <ConfirmButton />
</CreateWalletModal>
```

**Key Differences:**
- Forced backup verification before proceeding
- PDF export option
- Password-protected seed backup

---

### Mobile Screen: `ImportWalletScreen.tsx` → Extension: `ImportWalletModal`

**Desktop Adaptations:**
- Textarea for seed phrase paste (instead of individual word inputs)
- Word suggestion dropdown
- Paste detection from clipboard

**Extension Components:**
```tsx
<ImportWalletModal>
  <SeedPhraseInput /> {/* Textarea with validation */}
  <WordSuggestions /> {/* Auto-complete */}
  <ValidationStatus /> {/* Real-time feedback */}
  <ImportButton />
</ImportWalletModal>
```

---

### Mobile Screen: `VerifyWalletScreen.tsx` → Extension: `VerifyWalletFlow`

**Desktop Adaptations:**
- Grid of words (clickable buttons)
- Sequence indicator
- Keyboard shortcuts (1-12 for word selection)

**Extension Components:**
```tsx
<VerifyWalletFlow>
  <SeedWords /> {/* Shuffle display */}
  <SequenceIndicator />
  <BackButton /> {/* Can retry */}
</VerifyWalletFlow>
```

---

## 2. Dashboard & Portfolio

### Mobile Screen: `HomeDashboardScreen.tsx` → Extension: `DashboardView`

**Desktop Adaptations:**
- Compact card layout (sidebar + main area)
- Collapsible sections (expand on demand)
- No pull-to-refresh (refresh button instead)
- Horizontal scrolling for asset list (or pagination)

**Extension Components:**
```tsx
<DashboardLayout>
  <Header>
    <WalletSelector />
    <ThemeToggle />
    <SettingsLink />
  </Header>
  <PortfolioSummary /> {/* Total balance, % change */}
  <AssetList /> {/* Scrollable or paginated */}
  <RecentTransactions /> {/* Last 5 */}
  <QuickActions> {/* Send, Receive, Buy */}
    <SendButton />
    <ReceiveButton />
    <PayButton />
  </QuickActions>
</DashboardLayout>
```

**Key Differences:**
- Always-visible header (no scroll collapse)
- Sidebar navigation (persistent)
- Expandable sections for mobile compatibility

---

### Mobile Screen: `BalancesAndAssetsScreen.tsx` → Extension: `PortfolioView`

**Desktop Adaptations:**
- Table format (sortable columns: token, balance, value, change)
- Filter by chain/status
- Search input
- Inline token operations (send directly from table)

**Extension Components:**
```tsx
<PortfolioView>
  <TokenTable>
    <TokenRow /> {/* Each token with inline actions */}
  </TokenTable>
  <FilterBar /> {/* Chain, status filters */}
  <SearchInput /> {/* Token search */}
</PortfolioView>
```

---

## 3. Payment Flows

### Mobile Screen: `SendCryptoScreen.tsx` → Extension: `SendPaymentModal`

**Desktop Adaptations:**
- Modal or full-page view (toggle in settings)
- Address input with paste detection
- Recipient history dropdown
- Amount input with USD conversion
- Network selector (prominent)

**Extension Components:**
```tsx
<SendPaymentModal>
  <NetworkSelector /> {/* EVM, Solana, Stellar */}
  <TokenSelector /> {/* Chain-specific tokens */}
  <RecipientInput /> {/* Textarea, paste-detect, history */}
  <AmountInput /> {/* USD conversion */}
  <FeeEstimate /> {/* Auto-calc, editable (EVM) */}
  <TransactionType /> {/* Public, Private (testnet) */}
  <PreviewButton />
</SendPaymentModal>
```

**Key Differences:**
- Address book integration (suggested recipients)
- Stealth address option (toggle for privacy)
- Gas price control (EVM only, advanced toggle)

---

### Mobile Screen: `PaymentConfirmScreen.tsx` → Extension: `ConfirmPaymentModal`

**Desktop Adaptations:**
- Compact transaction summary (dark background)
- Transaction details collapsible section
- Approve/Reject buttons (large, accessible)
- Countdown timer for auto-reject (optional)

**Extension Components:**
```tsx
<ConfirmPaymentModal>
  <TransactionSummary>
    <FromAddress />
    <ToAddress />
    <Amount />
    <Fee />
    <Total />
  </TransactionSummary>
  <Details /> {/* Collapsible */}
  <ApproveButton /> {/* Primary */}
  <RejectButton /> {/* Secondary */}
</ConfirmPaymentModal>
```

**Key Differences:**
- Larger approval buttons (44×44pt minimum)
- Auto-lock after 5 min inactivity
- Keyboard shortcut (Enter = approve, Esc = reject)

---

### Mobile Screen: `ReceiveScreen.tsx` → Extension: `ReceiveModal`

**Desktop Adaptations:**
- QR code display (larger)
- Address copy button (prominent)
- Share buttons (remove social, keep clipboard)
- Network/token selector

**Extension Components:**
```tsx
<ReceiveModal>
  <NetworkSelector />
  <TokenSelector />
  <QRCode /> {/* Larger, printable */}
  <AddressDisplay /> {/* Copy button */}
  <ShareOptions /> {/* Copy, download QR */}
</ReceiveModal>
```

---

## 4. Transaction History

### Mobile Screen: `TransactionHistoryScreen.tsx` → Extension: `TransactionHistoryView`

**Desktop Adaptations:**
- Table format (sortable, filterable)
- Pagination (20 per page)
- Advanced filters (date range, status, chain, amount range)
- Export to CSV

**Extension Components:**
```tsx
<TransactionHistoryView>
  <FilterBar>
    <DateRangePicker />
    <ChainFilter />
    <StatusFilter />
    <SearchInput />
  </FilterBar>
  <TransactionTable>
    <TransactionRow /> {/* Each with details link */}
  </TransactionTable>
  <Pagination />
  <ExportButton /> {/* CSV */}
</TransactionHistoryView>
```

**Key Differences:**
- Sortable columns
- Status badges (Pending, Confirmed, Failed)
- Direct link to block explorer

---

### Mobile Screen: `TransactionDetailsScreen.tsx` → Extension: `TransactionDetailsModal`

**Desktop Adaptations:**
- Full details in modal or side panel
- Transaction timeline
- Link to block explorer (chainScan)

**Extension Components:**
```tsx
<TransactionDetailsModal>
  <TransactionSummary /> {/* Amount, time, status */}
  <Timeline /> {/* Submitted → Confirmed */}
  <DetailsList>
    <DetailRow key="from" />
    <DetailRow key="to" />
    <DetailRow key="hash" />
    <DetailRow key="fee" />
  </DetailsList>
  <ExplorerLink /> {/* Block explorer */}
</TransactionDetailsModal>
```

---

## 5. Privacy Features

### Mobile Screen: `PrivateXLMShieldScreen.tsx` → Extension: `ShieldXLMModal` (Testnet)

**Desktop Adaptations:**
- Simplified UI (testnet warning banner)
- Manual SPP state sync button
- Amount input for shielding
- Confirmation with risk disclosure

**Extension Components:**
```tsx
<ShieldXLMModal>
  <TestnetWarning />
  <SPPStatusCheck />
  <AmountInput /> {/* XLM to shield */}
  <FeeDisplay /> {/* SPP fee */}
  <ConfirmButton />
  <StateRefreshButton />
</ShieldXLMModal>
```

**Key Differences:**
- Testnet-only badge
- Manual state sync (due to extension limitations)
- Simplified privacy explanation

---

### Mobile Screen: `PrivateXLMUnshieldScreen.tsx` → Extension: `UnshieldXLMModal` (Testnet)

**Desktop Adaptations:**
- Address verification (copy to clipboard)
- Manual amount input
- Confirmation

**Extension Components:**
```tsx
<UnshieldXLMModal>
  <TestnetWarning />
  <RecipientInput />
  <AmountInput /> {/* Private balance */}
  <FeeDisplay />
  <ConfirmButton />
</UnshieldXLMModal>
```

---

### Mobile Screen: `StealthAddressScreen.tsx` → Extension: `StealthAddressModal`

**Desktop Adaptations:**
- EVM only (cross-chain testnet stealth TBD)
- Network selector
- Generated address display (copy)
- Optional: Link to ephemeral key

**Extension Components:**
```tsx
<StealthAddressModal>
  <NetworkSelector /> {/* EVM chains */}
  <GenerateButton />
  <StealthAddressDisplay /> {/* Copy */}
  <SPendingKeysInfo /> {/* Optional disclosure */}
</StealthAddressModal>
```

---

### Mobile Screen: `EncryptedNotesScreen.tsx` → Extension: `EncryptedNotesModal`

**Desktop Adaptations:**
- Notes displayed as list (hover to edit)
- Add note button
- Search/filter notes

**Extension Components:**
```tsx
<EncryptedNotesModal>
  <NotesList>
    <NoteItem /> {/* Hover for edit */}
  </NotesList>
  <AddNoteButton />
  <SearchInput />
</EncryptedNotesModal>
```

---

## 6. Settings & Configuration

### Mobile Screen: `SettingsScreen.tsx` → Extension: `SettingsPage`

**Desktop Adaptations:**
- Left sidebar menu (navigation)
- Main content area (settings sections)
- Toggle switches (not radio buttons)
- Confirmation dialogs for destructive actions

**Extension Components:**
```tsx
<SettingsLayout>
  <Sidebar>
    <SettingsMenu>
      <MenuItem label="General" icon="settings" />
      <MenuItem label="Security" icon="shield" />
      <MenuItem label="Wallet" icon="wallet" />
      <MenuItem label="Networks" icon="globe" />
      <MenuItem label="Appearance" icon="palette" />
      <MenuItem label="Privacy" icon="lock" />
      <MenuItem label="About" icon="info" />
    </SettingsMenu>
  </Sidebar>
  <MainContent>
    <GeneralSettings />
    {/* Other settings sections */}
  </MainContent>
</SettingsLayout>
```

**Key Sections:**
1. **General**: Language, currency, session timeout
2. **Security**: PIN setup, passphrase change, session lock
3. **Wallet**: View seed (with confirmation), export private key
4. **Networks**: Add custom RPC, network settings
5. **Appearance**: Theme (light/dark), font size
6. **Privacy**: Privacy level, default transaction type
7. **About**: Version, permissions, terms

---

### Mobile Screen: `NetworkSettingsScreen.tsx` → Extension: `NetworkSettingsView`

**Desktop Adaptations:**
- Table of networks (sortable, editable)
- Add custom network button
- Test RPC button
- Delete confirmation

**Extension Components:**
```tsx
<NetworkSettingsView>
  <NetworkTable>
    <NetworkRow /> {/* Each with edit, test, delete */}
  </NetworkTable>
  <AddCustomNetworkButton />
</NetworkSettingsView>
```

---

### Mobile Screen: `AddCustomNetworkScreen.tsx` → Extension: `AddCustomNetworkModal`

**Desktop Adaptations:**
- Form fields (RPC URL, chain ID, name, symbol)
- Test RPC button
- Validation feedback

**Extension Components:**
```tsx
<AddCustomNetworkModal>
  <FormField label="Network Name" />
  <FormField label="RPC URL" />
  <FormField label="Chain ID" />
  <FormField label="Symbol" />
  <FormField label="Block Explorer (optional)" />
  <TestButton /> {/* Verify RPC */}
  <SaveButton />
</AddCustomNetworkModal>
```

---

## 7. WalletConnect & dApp Interaction

### Mobile Screen: `WalletConnectScreen.tsx` → Extension: `WalletConnectModal`

**Desktop Adaptations:**
- Session list (active dApps)
- Disconnect button per session
- QR code scanner (or paste URL)
- Session details (chain, methods, expiry)

**Extension Components:**
```tsx
<WalletConnectModal>
  <SessionsList>
    <SessionCard /> {/* Each with details, disconnect */}
  </SessionsList>
  <NewSessionSection>
    <QRScanner /> {/* Or paste */}
  </NewSessionSection>
</WalletConnectModal>
```

**Key Differences:**
- No native camera (use upload QR image)
- Paste WalletConnect URI option
- Session persistence (auto-connect on extension load)

---

## 8. Payment Features (PayBox-Like)

### Extension-Only Screen: `PaymentChannelScreen` (New)

**Purpose:** Create, manage, and monitor x402 payment channels

**Extension Components:**
```tsx
<PaymentChannelView>
  <ChannelsList>
    <ChannelCard /> {/* Active channels */}
  </ChannelsList>
  <CreateChannelModal>
    <RecipientInput />
    <AmountInput /> {/* Total budget */}
    <ExpiryDatePicker />
    <ConfirmButton />
  </CreateChannelModal>
  <ChannelDetails>
    <SpentAmount />
    <RemainingBalance />
    <TransactionHistory />
  </ChannelDetails>
</PaymentChannelView>
```

---

### Extension-Only Screen: `X402RequestOverlay` (New)

**Purpose:** Intercept and handle x402 payment requests from websites

**Extension Components:**
```tsx
<X402RequestOverlay>
  <ServiceName /> {/* Website requesting payment */}
  <PaymentDetails>
    <Amount />
    <Currency />
    <Description /> {/* What you're paying for */}
  </PaymentDetails>
  <ApproveButton /> {/* Primary */}
  <RejectButton /> {/* Secondary */}
  <RememberChoice /> {/* Checkbox: auto-approve for this site */}
</X402RequestOverlay>
```

**Behavior:**
- Appears as overlay (not modal)
- Auto-dismiss on approval/rejection
- Sound/notification for attention
- Auto-timeout (default 60s)

---

## 9. Biometric & Security

### Mobile Screen: `BiometricSetupScreen.tsx` → Extension: `SecuritySetupFlow`

**Desktop Adaptations:**
- PIN setup (required)
- Biometric options (optional, system-dependent)
- Recovery passphrase
- Session timeout configuration

**Extension Components:**
```tsx
<SecuritySetupFlow>
  <Step1_PINSetup /> {/* 6-12 digits */}
  <Step2_BiometricOptional /> {/* Fingerprint/FaceID if available */}
  <Step3_RecoveryCode /> {/* Backup code generation */}
  <Step4_TimeoutConfig /> {/* 5/15/30 min options */}
</SecuritySetupFlow>
```

---

### Extension-Only Screen: `SessionManagementView` (New)

**Purpose:** Manage active sessions, lock wallet, auto-logout

**Extension Components:**
```tsx
<SessionManagementView>
  <SessionStatus /> {/* Active/Locked/Logged-out */}
  <TimeoutCounter /> {/* Minutes until auto-lock */}
  <LockButton /> {/* Manual lock */}
  <LogoutButton /> {/* Full logout (clear state) */}
  <DeviceList /> {/* If multi-device support later */}
</SessionManagementView>
```

---

## 10. Fiat Ramps (Excluded from Initial MVP)

**Mobile Screens Excluded:**
- `OnrampAmountScreen.tsx`
- `OnrampQuotesScreen.tsx`
- `OnrampWidgetScreen.tsx`
- `TransakWebViewScreen.tsx`
- `WithdrawFiatScreen.tsx`

**Rationale:** Fiat ramps require complex 3rd-party integrations (KYC, jurisdiction checks). Plan for Phase 2.

**Future Extension Components:**
```tsx
<FiatRampModal>
  <ProviderSelector /> {/* Transak, MoonPay, etc. */}
  <AmountInput />
  <PaymentMethodSelector />
  <KYCFlow /> {/* Delegated to provider */}
</FiatRampModal>
```

---

## 11. In-App Browser

### Mobile Screen: `InAppBrowserScreen.tsx` → Extension: `InAppBrowser` (Excluded MVP)

**Rationale:** Browser extension already has web browsing context; in-app browser is redundant.

**Future:** Deep linking to dApps (e.g., Uniswap) with WalletConnect pre-configured.

---

## 12. Component Reusability Matrix

| Component | Reusable | Notes |
|-----------|----------|-------|
| `Button` | ✅ Yes | Mobile styling works; adjust touch target for desktop |
| `Card` | ✅ Yes | Add hover state for desktop |
| `Input` | ✅ Yes | Remove mobile keyboard hints; add cursor styling |
| `Modal` | ✅ Yes | Max-width for desktop; focus management |
| `Icon` | ✅ Yes | Same SVG, different sizes |
| `Header` | ⚠️ Partial | Remove status bar, add extension chrome awareness |
| `BottomNav` | ❌ No | Replace with sidebar nav for desktop |
| `Toast` | ✅ Yes | Position top-right instead of bottom |

---

## 13. Responsive Breakpoints

**Desktop Extension Constraints:**
- **Popup Mode:** 360px × 600px (fixed, no resize)
- **Full Page Mode:** Full width, scrollable
- **Side Panel (Manifest V3):** 384px × variable height

**CSS Strategy:**
```css
/* Default: 360px popup */
@media (min-width: 768px) {
  /* Full page mode */
}

@media (max-width: 359px) {
  /* Micro screens (fallback) */
}
```

---

## 14. Accessibility Considerations

**WCAG 2.2 AA Targets (from mobile):**
- ✅ 4.5:1 contrast ratio (maintained)
- ✅ 44×44pt touch targets (mouse hover zones)
- ✅ Keyboard navigation (Tab, Enter, Escape)
- ✅ Screen reader support (semantic HTML)
- ✅ Focus indicators (visible :focus styles)

**Extension-Specific:**
- Keyboard shortcuts for common actions (Cmd+P for pay, Cmd+R for receive)
- Tab order optimization for popup mode
- Alt text for all icons

---

## Summary

**Total Screens: 25+ Mobile → Extension**
- **Fully Mapped:** 20 screens (direct port)
- **Excluded:** 5 screens (fiat ramps, in-app browser)
- **New/Enhanced:** 3 screens (payment channels, x402 overlay, session management)
- **Reusable Components:** ~80% of mobile component library
- **New Components:** ~15 desktop-specific components

**UI Consistency:** All designs follow Veilpay design tokens (colors, typography, spacing). See `design-tokens.ts` for reference.

---

**Next:** Proceed with implementation phase using this mapping as a blueprint.
