import { useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '@/i18n';
import { useWallet, type AccountView } from '@/ui/store/useWallet';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { Input } from '@/ui/components/Input';
import { TestnetBanner } from '@/ui/components/TestnetBanner';
import { Dashboard } from '@/ui/components/Dashboard';
import { ConnectionApproval } from '@/ui/components/ConnectionApproval';
import { TransactionApproval } from '@/ui/components/TransactionApproval';
import { X402Approval } from '@/ui/components/X402Approval';
import { GrantApproval } from '@/ui/components/GrantApproval';
import { Icon } from '@/ui/components/Icon';
import { Glyph } from '@/ui/components/Glyph';
import { BrandLogo } from '@/ui/components/BrandLogo';
import { QRCode } from '@/ui/components/QRCode';
import type { StellarAssetInput, TokenInputType, ZkCapability } from '@/core/messaging/protocol';

const AUTO_RELOAD_KEY = 'bootAutoReloadedAt';
const AUTO_RELOAD_WINDOW_MS = 60_000;

/**
 * One automatic recovery attempt for a stale/broken background service worker.
 *
 * If the popup boots to an error (SW never responded), Chrome may still be
 * running an old service worker from a previous build. Reloading the extension
 * re-registers the SW from the current `dist/`. Guarded by a per-session
 * timestamp so it runs at most once a minute — a genuinely broken SW surfaces
 * the manual Retry / Reload buttons instead of looping.
 */
async function maybeAutoReload(): Promise<boolean> {
  try {
    const stored = await chrome.storage.session.get(AUTO_RELOAD_KEY);
    const last = stored[AUTO_RELOAD_KEY] as number | undefined;
    const now = Date.now();
    if (typeof last === 'number' && now - last < AUTO_RELOAD_WINDOW_MS) return false;
    await chrome.storage.session.set({ [AUTO_RELOAD_KEY]: now });
    chrome.runtime.reload();
    return true;
  } catch {
    return false;
  }
}

type OnboardingStep = 'welcome' | 'phrase' | 'passphrase' | 'success' | 'complete' | 'import';

/**
 * Phase 1 popup — onboarding, unlock, accounts, send/receive, and import.
 *
 * State machine:
 *   vaultState=uninitialized → onboarding flow
 *   vaultState=locked       → unlock screen
 *   vaultState=unlocked     → account list with send/receive/import
 */
export default function App() {
  const {
    vaultState,
    isLoading,
    error,
    accounts,
    zkCapability,
    pendingConnection,
    pendingApproval,
    pendingX402Payment,
    pendingGrantRequest,
    refresh,
    loadAccounts,
    generateMnemonic,
    createVault,
    estimateTransfer,
    sendTransfer,
    unlock,
    lock,
    reset,
    clearError,
    loadPendingConnection,
    resolvePendingConnection,
    loadPendingApproval,
    resolvePendingApproval,
    loadPendingX402,
    resolvePendingX402,
    loadPendingGrantRequest,
    resolvePendingGrantRequest,
  } = useWallet();

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [phrase, setPhrase] = useState<string | null>(null);
  const [phraseRevealed, setPhraseRevealed] = useState(false);
  const [phraseCopied, setPhraseCopied] = useState(false);
  const [passphrase1, setPassphrase1] = useState('');
  const [passphrase2, setPassphrase2] = useState('');
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  // Send / receive / import view
  const [view, setView] = useState<'accounts' | 'send' | 'receive' | 'import'>('accounts');
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendAsset, setSendAsset] = useState<StellarAssetInput | undefined>(undefined);
  const [sendToken, setSendToken] = useState<TokenInputType | undefined>(undefined);
  const [sendFee, setSendFee] = useState<string | null>(null);
  const [sendDecimals, setSendDecimals] = useState<number | null>(null);
  const [sendSpendable, setSendSpendable] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<'fee' | 'confirm' | 'sending' | 'done'>('fee');
  const [sendHash, setSendHash] = useState<string | null>(null);
  const [receiveIdx, setReceiveIdx] = useState(0);
  const [importPhrase, setImportPhrase] = useState('');
  const [importPass1, setImportPass1] = useState('');
  const [importPass2, setImportPass2] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Refresh vault state on mount
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Load accounts once the vault is unlocked so the dashboard renders them.
  // Without this a fresh popup shows "No accounts loaded" with no way to fix it
  // (the dashboard's Refresh button only reloads balances, not the account list).
  useEffect(() => {
    if (vaultState === 'unlocked' && accounts.length === 0) {
      void loadAccounts();
    }
  }, [vaultState, accounts.length, loadAccounts]);

  // A dapp connection request can land while the popup is closed (the background
  // opens it via chrome.action.openPopup). Reload it on mount so the approval UI
  // is rendered even if the popup started fresh.
  useEffect(() => {
    void loadPendingConnection();
  }, [loadPendingConnection]);

  // Same for a dapp transaction/signature request awaiting approval.
  useEffect(() => {
    void loadPendingApproval();
  }, [loadPendingApproval]);

  // Same for an x402 payment request awaiting approval.
  useEffect(() => {
    void loadPendingX402();
  }, [loadPendingX402]);

  // Same for a VAP grant request awaiting approval.
  useEffect(() => {
    void loadPendingGrantRequest();
  }, [loadPendingGrantRequest]);

  // If the background service never answered while still on the WELCOME step
  // (no create/import flow started), Chrome may be running a stale service
  // worker. One automatic reload re-registers it from the current build; only
  // fires on the initial load so a create/import error never nukes the form.
  useEffect(() => {
    if (
      error !== null &&
      vaultState === 'uninitialized' &&
      phrase === null &&
      step === 'welcome'
    ) {
      void maybeAutoReload();
    }
  }, [error, vaultState, phrase, step]);

  const handleApproveConnection = async () => {
    if (pendingConnection === null) return;
    const granted = await resolvePendingConnection(
      pendingConnection.origin,
      pendingConnection.requestedAccounts.map((a) => a.address),
      'approve',
    );
    if (granted) void refresh();
  };

  const handleDenyConnection = async () => {
    if (pendingConnection === null) return;
    await resolvePendingConnection(pendingConnection.origin, [], 'deny');
  };

  const handleApproveApproval = async () => {
    if (pendingApproval === null) return;
    await resolvePendingApproval(pendingApproval.id, 'approve');
  };

  const handleDenyApproval = async () => {
    if (pendingApproval === null) return;
    await resolvePendingApproval(pendingApproval.id, 'deny');
  };

  const handleApproveX402 = async () => {
    if (pendingX402Payment === null) return;
    await resolvePendingX402(pendingX402Payment.id, 'approve');
  };

  const handleDenyX402 = async () => {
    if (pendingX402Payment === null) return;
    await resolvePendingX402(pendingX402Payment.id, 'deny');
  };

  const handleApproveGrant = async (pin?: string, webauthn?: boolean) => {
    if (pendingGrantRequest === null) return;
    await resolvePendingGrantRequest(pendingGrantRequest.id, 'approve', pin, webauthn);
  };

  const handleDenyGrant = async () => {
    if (pendingGrantRequest === null) return;
    await resolvePendingGrantRequest(pendingGrantRequest.id, 'deny');
  };

  // Reset onboarding state when vault state changes (e.g., after reset)
  useEffect(() => {
    if (vaultState === 'uninitialized') {
      setStep('welcome');
      setPhrase(null);
      setPhraseRevealed(false);
      setPhraseCopied(false);
      setPassphrase1('');
      setPassphrase2('');
      setPassphraseError(null);
      setUnlockPassphrase('');
      setUnlockError(null);
      setResetConfirm(false);
    }
  }, [vaultState]);

  const handleCreateWallet = async () => {
    const mnemonic = await generateMnemonic(256);
    if (mnemonic !== null) {
      setPhrase(mnemonic);
      setPhraseRevealed(false);
      setPhraseCopied(false);
      setStep('phrase');
    }
  };

  const handleCopyPhrase = () => {
    if (phrase !== null) {
      void navigator.clipboard.writeText(phrase);
      setPhraseCopied(true);
      setTimeout(() => setPhraseCopied(false), 2000);
    }
  };

  const handlePhraseRevealed = () => {
    setPhraseRevealed(true);
  };

  const handlePhraseConfirmed = () => {
    setStep('passphrase');
  };

  const handlePassphraseSubmit = async () => {
    setPassphraseError(null);

    // Matches the vault's authoritative minimum (src/core/vault/index.ts,
    // MIN_PASSPHRASE_LENGTH). The UI must not accept a passphrase the vault will
    // reject, or the create flow fails after the user submits.
    if (passphrase1.length < 10) {
      setPassphraseError(t('onboarding.passphraseMin'));
      return;
    }
    if (passphrase1 !== passphrase2) {
      setPassphraseError(t('onboarding.passphraseMismatch'));
      return;
    }
    if (phrase === null) {
      setPassphraseError(t('onboarding.noPhrase'));
      return;
    }

    const ok = await createVault(phrase, passphrase1);
    if (ok) {
      setStep('success');
      setPassphrase1('');
      setPassphrase2('');
    }
  };

  const handleFinishOnboarding = () => {
    // The vault is already unlocked at this point; 'complete' is a sentinel so
    // the success screen gives way to the account view.
    setStep('complete');
  };

  const handleUnlock = async () => {
    setUnlockError(null);
    if (unlockPassphrase.length === 0) {
      setUnlockError('Enter your passphrase.');
      return;
    }
    const ok = await unlock(unlockPassphrase);
    if (!ok) {
      setUnlockError('Wrong passphrase. Try again.');
      setUnlockPassphrase('');
    }
  };

  const handleReset = async () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    setResetConfirm(false);
    await reset();
  };

  const handleLock = async () => {
    await lock();
  };

  const [sendAccount, setSendAccount] = useState<AccountView | null>(null);

  const startSend = (idx: number) => {
    const acc = accounts[idx];
    if (acc === undefined) return;
    setSendAccount(acc);
    setSendTo('');
    setSendAmount('');
    setSendAsset(undefined);
    setSendToken(undefined);
    setSendFee(null);
    setSendDecimals(null);
    setSendSpendable(null);
    setSendStatus('fee');
    setSendHash(null);
    setView('send');
  };

  // Convert a Stellar asset selection into a TokenInput (for the unified send
  // path); native assets collapse to the generic `native` kind.
  const tokenFromAsset = (asset: StellarAssetInput | undefined): TokenInputType | undefined =>
    asset === undefined || asset.type === 'native'
      ? { kind: 'native' }
      : { kind: 'stellar-issued', code: asset.code, issuer: asset.issuer };

  // The current send form computes this token object once, from the per-chain
  // asset/token selection, so the estimate and the confirm always agree.
  // Wrapped in useCallback so its identity stays stable across renders that do
  // not change the estimate inputs — this prevents the debounced auto-estimate
  // effect from re-firing in a loop after each successful estimate.
  const handleSendFee = useCallback(
    async (token?: TokenInputType) => {
      if (sendAccount === null || sendTo.length === 0 || sendAmount.length === 0) return;
      const resolvedToken = token ?? sendToken ?? tokenFromAsset(sendAsset);
      try {
        const fee = await estimateTransfer(
          sendAccount.chain,
          sendAccount.index,
          sendTo,
          sendAmount,
          sendAsset,
          resolvedToken,
        );
        setSendFee(fee.feeNative);
        setSendDecimals(fee.decimals);
        setSendSpendable(fee.spendableBalance);
        setSendStatus('confirm');
      } catch {
        // error is surfaced via the store
      }
    },
    [sendAccount, sendTo, sendAmount, sendAsset, sendToken, estimateTransfer],
  );

  const handleSendConfirm = async () => {
    if (sendAccount === null) return;
    setSendStatus('sending');
    try {
      const { hash } = await sendTransfer(
        sendAccount.chain,
        sendAccount.index,
        sendTo,
        sendAmount,
        sendAsset,
        sendToken ?? tokenFromAsset(sendAsset),
      );
      setSendHash(hash);
      setSendStatus('done');
    } catch {
      setSendStatus('fee');
    }
  };

  const startReceive = (idx: number) => {
    setReceiveIdx(idx);
    setView('receive');
  };

  const handleImportSubmit = async () => {
    setImportError(null);
    if (importPass1.length < 10) {
      setImportError('Passphrase must be at least 10 characters.');
      return;
    }
    if (importPass1 !== importPass2) {
      setImportError('Passphrases do not match.');
      return;
    }
    const ok = await createVault(importPhrase.trim(), importPass1);
    if (ok) {
      if (step === 'import') {
        // Onboarding import: show success screen, then let user proceed
        setStep('success');
      } else {
        setView('accounts');
        void loadAccounts();
      }
    } else {
      setImportError('Could not import wallet. Check the phrase.');
    }
  };

  // ── Loading (INITIAL BOOT ONLY) ─────────────────────────────────────────
  // Gate strictly to the boot state: once the user has picked an onboarding
  // step (create/import) the step's own component renders its progress, and the
  // page-level "Loading wallet…" spinner must NOT hijack it. Import never sets
  // `phrase`, so without the step guard an in-flight `createVault` would swap
  // the whole popup to the boot spinner.
  if (isLoading && vaultState === 'uninitialized' && phrase === null && step === 'welcome') {
    return (
      <main className="flex min-h-[600px] w-[400px] flex-col items-center justify-center gap-3 p-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
        <p className="font-body text-sm text-content-secondary">{t('status.loadingWallet')}</p>
      </main>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error && vaultState === 'uninitialized' && phrase === null) {
    return (
      <main className="flex min-h-[600px] w-[400px] flex-col items-center justify-center gap-4 p-4">
        <p className="font-body text-sm text-danger text-center">{error}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => refresh()}>
            Retry
          </Button>
          <Button variant="ghost" onClick={() => chrome.runtime.reload()}>
            Reload extension
          </Button>
        </div>
      </main>
    );
  }

  // ── Success (transient: after vault.create, before first unlock) ─────────
  // Must render before the vaultState === 'unlocked' branch so the success
  // screen shows even though the vault is now unlocked.
  if (step === 'success') {
    return (
      <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
        <header className="flex items-baseline justify-between">
          <h1 className="font-display text-lg font-bold text-content-primary">{t('brand')}</h1>
          <span className="font-mono text-xs text-content-tertiary">{t('version')}</span>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/20">
            <Icon name="check" className="h-6 w-6" />
          </div>
          <h2 className="font-display text-lg font-semibold text-content-primary">{t('onboarding.walletCreated')}</h2>
          <p className="font-body text-sm text-content-secondary text-center max-w-xs">
            {t('onboarding.walletCreatedHint')}
          </p>
          <Button fullWidth onClick={handleFinishOnboarding}>
            {t('onboarding.continue')}
          </Button>
        </div>
      </main>
    );
  }

  // ── Pending dapp connection — takes over the popup so the user can approve ──
  if (vaultState === 'unlocked' && pendingConnection !== null) {
    return (
      <ConnectionApproval
        origin={pendingConnection.origin}
        requestedAccounts={pendingConnection.requestedAccounts}
        onApprove={handleApproveConnection}
        onReject={handleDenyConnection}
      />
    );
  }

  // ── Pending dapp transaction/signature — takes over the popup ───────────
  if (vaultState === 'unlocked' && pendingApproval !== null) {
    return (
      <TransactionApproval
        approval={pendingApproval}
        onApprove={handleApproveApproval}
        onReject={handleDenyApproval}
      />
    );
  }

  // ── Pending x402 payment — takes over the popup so the user can approve ──
  if (vaultState === 'unlocked' && pendingX402Payment !== null) {
    return (
      <X402Approval
        payment={pendingX402Payment}
        onApprove={handleApproveX402}
        onReject={handleDenyX402}
      />
    );
  }

  // ── Pending VAP grant request — takes over the popup so the user can decide ──
  if (vaultState === 'unlocked' && pendingGrantRequest !== null) {
    return (
      <GrantApproval
        request={pendingGrantRequest}
        onApprove={handleApproveGrant}
        onReject={handleDenyGrant}
      />
    );
  }

  // ── Unlocked — send / receive / accounts / import ──────────────────────
  if (vaultState === 'unlocked') {
    if (view === 'send') {
      return (
        <SendForm
          account={sendAccount ?? accounts[0]!}
          sendTo={sendTo}
          sendAmount={sendAmount}
          sendAsset={sendAsset}
          sendToken={sendToken}
          sendFee={sendFee}
          sendDecimals={sendDecimals}
          sendSpendable={sendSpendable}
          sendStatus={sendStatus}
          sendHash={sendHash}
          isLoading={isLoading}
          error={error}
          onToChange={setSendTo}
          onAmountChange={setSendAmount}
          onAssetChange={setSendAsset}
          onTokenChange={setSendToken}
          onEstimate={handleSendFee}
          onConfirm={handleSendConfirm}
          onBack={() => setView('accounts')}
          onClearError={clearError}
        />
      );
    }
    if (view === 'receive') {
      const acc = accounts[receiveIdx];
      if (acc === undefined) return null;
      return <ReceiveView account={acc} onBack={() => setView('accounts')} />;
    }
    if (view === 'import') {
      return (
        <ImportWallet
          importPhrase={importPhrase}
          importPass1={importPass1}
          importPass2={importPass2}
          importError={importError}
          isLoading={isLoading}
          onPhraseChange={setImportPhrase}
          onPass1Change={setImportPass1}
          onPass2Change={setImportPass2}
          onSubmit={handleImportSubmit}
          onBack={() => setView('accounts')}
        />
      );
    }

    // Default: Dashboard with portfolio, assets, and recent tx
    return (
      <main className="flex min-h-[600px] w-[400px] flex-col gap-3 p-4">
        <header className="flex items-baseline justify-between">
          <h1 className="font-display text-lg font-bold text-content-primary">{t('brand')}</h1>
          <span className="font-mono text-xs text-content-tertiary">{t('version')}</span>
        </header>

        <TestnetBanner />

        <Dashboard
          accounts={accounts}
          onSend={startSend}
          onReceive={startReceive}
          onImport={() => setView('import')}
          onLock={handleLock}
        />

        <ZkResult capability={zkCapability} />

        <div className="mt-auto">
          <Button variant="ghost" fullWidth onClick={() => void chrome.runtime.openOptionsPage()}>
            Settings
          </Button>
        </div>
      </main>
    );
  }

  // ── Locked — unlock screen ──────────────────────────────────────────────
  if (vaultState === 'locked') {
    return (
      <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
        <header className="flex items-baseline justify-between">
          <h1 className="font-display text-lg font-bold text-content-primary">{t('brand')}</h1>
          <span className="font-mono text-xs text-content-tertiary">{t('version')}</span>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-700">
            <Icon name="lock" className="h-6 w-6" />
          </div>
          <p className="font-body text-sm text-content-secondary">{t('wallet.locked')}</p>

          <div className="w-full max-w-xs">
            <Input
              type="password"
              label={t('wallet.passphrase')}
              placeholder={t('wallet.passphrase')}
              value={unlockPassphrase}
              onChange={(e) => {
                setUnlockPassphrase(e.target.value);
                setUnlockError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleUnlock();
              }}
              error={unlockError ?? null}
              passwordToggle
              autoFocus
              disabled={isLoading}
            />
          </div>

          <Button
            fullWidth
            onClick={handleUnlock}
            disabled={isLoading || unlockPassphrase.length === 0}
          >
            {isLoading ? t('wallet.unlocking') : t('wallet.unlock')}
          </Button>

          {error && (
            <p className="font-body text-xs text-danger">{error}</p>
          )}

          <div className="flex gap-2">
            {resetConfirm ? (
              <>
                <p className="font-body text-xs text-danger">This cannot be undone.</p>
                <Button variant="danger" size="sm" onClick={handleReset}>
                  Confirm reset
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setResetConfirm(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Reset wallet
              </Button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ── Onboarding flows ────────────────────────────────────────────────────

  // Import flow (from welcome screen)
  if (step === 'import') {
    return (
      <ImportWallet
        importPhrase={importPhrase}
        importPass1={importPass1}
        importPass2={importPass2}
        importError={importError}
        isLoading={isLoading}
        onPhraseChange={setImportPhrase}
        onPass1Change={setImportPass1}
        onPass2Change={setImportPass2}
        onSubmit={handleImportSubmit}
        onBack={() => setStep('welcome')}
      />
    );
  }

  // Step 3: Passphrase
  if (step === 'passphrase') {
    return (
      <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
        <header className="flex items-baseline justify-between">
          <h1 className="font-display text-lg font-bold text-content-primary">{t('brand')}</h1>
          <span className="font-mono text-xs text-content-tertiary">{t('version')}</span>
        </header>

        <div className="flex flex-1 flex-col gap-4">
          <h2 className="font-display text-base font-semibold text-content-primary">
            {t('onboarding.setPassphrase')}
          </h2>
          <p className="font-body text-xs text-content-secondary">
            {t('onboarding.passphraseHint')}
          </p>

          <div className="flex flex-col gap-3">
            <Input
              type="password"
              label="Passphrase (min. 10 characters)"
              placeholder="Passphrase (min. 10 characters)"
              value={passphrase1}
              onChange={(e) => {
                setPassphrase1(e.target.value);
                setPassphraseError(null);
              }}
              passwordToggle
              disabled={isLoading}
            />
            <Input
              type="password"
              label="Confirm passphrase"
              placeholder="Confirm passphrase"
              value={passphrase2}
              onChange={(e) => {
                setPassphrase2(e.target.value);
                setPassphraseError(null);
              }}
              passwordToggle
              error={passphraseError ?? null}
              disabled={isLoading}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep('phrase')} disabled={isLoading}>
              {t('common.back')}
            </Button>
            <Button
              fullWidth
              onClick={handlePassphraseSubmit}
              disabled={isLoading || passphrase1.length === 0 || passphrase2.length === 0}
            >
              {isLoading ? t('onboarding.creating') : t('onboarding.create')}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // Step 2: Phrase display
  if (step === 'phrase' && phrase !== null) {
    const words = phrase.split(' ');

    return (
      <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
        <header className="flex items-baseline justify-between">
          <h1 className="font-display text-lg font-bold text-content-primary">{t('brand')}</h1>
          <span className="font-mono text-xs text-content-tertiary">{t('version')}</span>
        </header>

        <div className="flex flex-1 flex-col gap-4">
          <h2 className="font-display text-base font-semibold text-content-primary">
            {t('onboarding.recoveryPhrase')}
          </h2>
          <p className="font-body text-xs text-content-secondary">
            {t('onboarding.phraseHint')}
          </p>

          {!phraseRevealed ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="font-body text-sm text-content-secondary text-center">
                {t('onboarding.phrasePrivacy')}
              </p>
              <Button variant="primary" onClick={handlePhraseRevealed}>
                {t('onboarding.revealPhrase')}
              </Button>
            </div>
          ) : (
            <>
              <Card className="!bg-surface-900">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {words.map((word, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 font-mono text-sm"
                    >
                      <span className="text-content-tertiary w-6 text-right text-xs">
                        {i + 1}
                      </span>
                      <span className="text-content-primary">{word}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleCopyPhrase}>
                  {phraseCopied ? 'Copied!' : t('common.copy')}
                </Button>
                <Button
                  variant="danger"
                  fullWidth
                  onClick={() => {
                    setPhrase(null);
                    setStep('welcome');
                  }}
                >
                  {t('onboarding.startOver')}
                </Button>
              </div>

              <div className="mt-auto">
                <Button fullWidth onClick={handlePhraseConfirmed}>
                  {t('onboarding.savedPhrase')}
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  // Step 1: Welcome
  return (
    <main className="flex min-h-[600px] w-[400px] flex-col gap-3 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-lg font-bold text-content-primary">{t('brand')}</h1>
        <span className="font-mono text-xs text-content-tertiary">{t('version')}</span>
      </header>

      <TestnetBanner />

      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-accent-500/20">
          <BrandLogo size="lg" />
        </div>
        <h2 className="font-display text-xl font-bold text-content-primary">
          {t('onboarding.welcome')}
        </h2>
        <p className="font-body text-sm text-content-secondary text-center max-w-xs">
          {t('onboarding.welcomeSubtitle')}
        </p>

        <Button fullWidth onClick={handleCreateWallet} disabled={isLoading}>
          {isLoading ? t('onboarding.generating') : t('onboarding.createWallet')}
        </Button>

        <Button variant="ghost" onClick={() => { setStep('import'); setImportPhrase(''); setImportPass1(''); setImportPass2(''); setImportError(null); }}>
          {t('onboarding.importExisting')}
        </Button>
      </div>

      <div className="mt-auto flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void chrome.runtime.openOptionsPage()}
        >
          {t('common.settings')}
        </Button>
      </div>
    </main>
  );
}

// ── ZK result card ───────────────────────────────────────────────────────

function ZkResult({ capability }: { capability: ZkCapability | null }) {
  if (capability === null) {
    return (
      <Card title="D3 — ZK capability">
        <p className="font-body text-xs text-content-tertiary">
          Not measured yet. The probe runs once in an offscreen document after install.
        </p>
      </Card>
    );
  }

  return (
    <Card title="D3 — ZK capability">
      <StatusRow
        label="Status"
        value={capability.status}
        tone={capability.status === 'viable' ? 'good' : 'neutral'}
      />
      <StatusRow
        label="WASM compile"
        value={capability.wasmCompileWorks ? 'works' : 'blocked'}
        tone={capability.wasmCompileWorks ? 'good' : 'bad'}
      />
      {capability.proofElapsedMs !== null && (
        <StatusRow
          label="Proof time"
          value={`${capability.proofElapsedMs} ms`}
          tone="neutral"
        />
      )}
      {capability.failureReason !== null && (
        <p className="mt-2 font-body text-xs text-content-tertiary">
          {capability.failureReason}
        </p>
      )}
    </Card>
  );
}

// ── Send form ───────────────────────────────────────────────────────────
const ESTIMATE_DEBOUNCE_MS = 400;

function decimalToBase(decimal: string, decimals: number): bigint {
  const dot = decimal.indexOf('.');
  const whole = dot === -1 ? decimal : decimal.slice(0, dot);
  const frac = dot === -1 ? '' : decimal.slice(dot + 1);
  const truncated = frac.slice(0, decimals).padEnd(decimals, '0');
  const scale = 10n ** BigInt(decimals);
  try {
    return BigInt(whole || '0') * scale + BigInt(truncated || '0');
  } catch {
    return 0n;
  }
}

function SendForm({
  account,
  sendTo,
  sendAmount,
  sendAsset,
  sendToken,
  sendFee,
  sendDecimals,
  sendSpendable,
  sendStatus,
  sendHash,
  isLoading,
  error,
  onToChange,
  onAmountChange,
  onAssetChange,
  onTokenChange,
  onEstimate,
  onConfirm,
  onBack,
  onClearError,
}: {
  account: AccountView;
  sendTo: string;
  sendAmount: string;
  sendAsset: StellarAssetInput | undefined;
  sendToken: TokenInputType | undefined;
  sendFee: string | null;
  sendDecimals: number | null;
  sendSpendable: string | null;
  sendStatus: 'fee' | 'confirm' | 'sending' | 'done';
  sendHash: string | null;
  isLoading: boolean;
  error: string | null;
  onToChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  onAssetChange: (a: StellarAssetInput | undefined) => void;
  onTokenChange: (t: TokenInputType | undefined) => void;
  onEstimate: (token?: TokenInputType) => Promise<void>;
  onConfirm: () => void;
  onBack: () => void;
  onClearError: () => void;
}) {
  const isStellar = account.chain === 'stellar';
  const nativeSymbol =
    account.chain === 'evm' ? 'ETH' : account.chain === 'solana' ? 'SOL' : 'XLM';
  const feeSymbol =
    account.chain === 'evm' ? 'Gwei' : account.chain === 'solana' ? 'lamports' : 'stroops';

  // Normalize the current selection into a TokenInput the estimate/confirm use.
  // For EVM/Solana the default (sendToken undefined) is the native token.
  // Memoized so its identity is stable, keeping the debounce effect stable too.
  const resolvedToken: TokenInputType | undefined = useMemo<TokenInputType | undefined>(
    () =>
      isStellar
        ? sendAsset === undefined || sendAsset.type === 'native'
          ? { kind: 'native' }
          : { kind: 'stellar-issued', code: sendAsset.code, issuer: sendAsset.issuer }
        : sendToken ?? { kind: 'native' },
    [isStellar, sendAsset, sendToken],
  );

  const assetLabel =
    sendAsset?.type === 'issued'
      ? sendAsset.code
      : sendToken?.kind === 'erc20' || sendToken?.kind === 'spl'
        ? 'Token'
        : nativeSymbol;

  // Auto-estimate: after the recipient/amount/token settle (debounced), run the
  // estimate so the fee preview appears without a manual button. Any change
  // resets the flow back to 'fee' until a fresh estimate lands.
  const ready =
    sendTo.length > 0 &&
    sendAmount.length > 0 &&
    resolvedToken !== undefined &&
    (resolvedToken.kind !== 'stellar-issued' || (sendAsset?.type === 'issued' && sendAsset.code.length > 0 && sendAsset.issuer.length > 0)) &&
    (resolvedToken.kind !== 'erc20' || (resolvedToken.address?.length ?? 0) > 0) &&
    (resolvedToken.kind !== 'spl' || (resolvedToken.mint?.length ?? 0) > 0);

  useEffect(() => {
    if (!ready || sendStatus === 'sending' || sendStatus === 'done') return;
    const id = window.setTimeout(() => {
      void onEstimate(resolvedToken);
    }, ESTIMATE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [sendTo, sendAmount, resolvedToken, ready, sendStatus, onEstimate]);

  // Spendable-balance gate. For a native send, amount + fee must fit the native
  // balance. For a token send, the amount must fit the token balance (fee is a
  // separate native-payment concern the background enforces at submit).
  const insufficientBalance =
    sendDecimals !== null && sendSpendable !== null && sendFee !== null && sendAmount.length > 0
      ? (() => {
          const base = decimalToBase(sendAmount, sendDecimals);
          const spendable = (() => {
            try {
              return BigInt(sendSpendable);
            } catch {
              return 0n;
            }
          })();
          const isNative = sendToken === undefined || sendToken.kind === 'native';
          const fee = isNative
            ? (() => {
                try {
                  return BigInt(sendFee);
                } catch {
                  return 0n;
                }
              })()
            : 0n;
          return base + fee > spendable;
        })()
      : false;

  const disableSend =
    isLoading ||
    sendStatus === 'sending' ||
    sendTo.length === 0 ||
    sendAmount.length === 0 ||
    ready === false ||
    insufficientBalance;

  if (sendStatus === 'done' && sendHash !== null) {
    return (
      <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
        <header className="flex items-baseline justify-between">
          <h1 className="font-display text-lg font-bold text-content-primary">{t('brand')}</h1>
          <span className="font-mono text-xs text-content-tertiary">{t('version')}</span>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/20">
            <Icon name="check" className="h-6 w-6" />
          </div>
          <h2 className="font-display text-lg font-semibold text-content-primary">Sent!</h2>
          <p className="font-mono text-xs text-content-tertiary break-all text-center max-w-xs">
            {sendHash}
          </p>
          <Button fullWidth onClick={onBack}>
            Back to accounts
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-lg font-bold text-content-primary">Veilpay</h1>
        <span className="font-mono text-xs text-content-tertiary">v0.0.1</span>
      </header>

      <p className="font-body text-xs text-content-secondary">
        Send from <span className="font-mono">{account.chain}</span> (#{account.index})
      </p>

      <div className="flex flex-1 flex-col gap-3">
        <Input
          label="Recipient address"
          placeholder="Recipient address"
          value={sendTo}
          onChange={(e) => { onToChange(e.target.value); onClearError(); }}
          disabled={isLoading || sendStatus === 'sending'}
        />

        {isStellar && (
          <div className="flex flex-col gap-1">
            <label className="font-body text-xs text-content-secondary">Asset</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { onAssetChange({ type: 'native' }); onClearError(); }}
                className={`flex-1 rounded-lg border px-3 py-2 font-body text-xs ${
                  sendAsset === undefined || sendAsset.type === 'native'
                    ? 'border-accent-500 bg-accent-500/10 text-content-primary'
                    : 'border-surface-700 text-content-secondary'
                }`}
                disabled={isLoading || sendStatus === 'sending'}
              >
                Native (XLM)
              </button>
              <button
                type="button"
                onClick={() => { onAssetChange({ type: 'issued', code: '', issuer: '' }); onClearError(); }}
                className={`flex-1 rounded-lg border px-3 py-2 font-body text-xs ${
                  sendAsset?.type === 'issued'
                    ? 'border-accent-500 bg-accent-500/10 text-content-primary'
                    : 'border-surface-700 text-content-secondary'
                }`}
                disabled={isLoading || sendStatus === 'sending'}
              >
                Testnet token
              </button>
            </div>
          </div>
        )}

        {!isStellar && (
          <div className="flex flex-col gap-1">
            <label className="font-body text-xs text-content-secondary">Token</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { onTokenChange(undefined); onClearError(); }}
                className={`flex-1 rounded-lg border px-3 py-2 font-body text-xs ${
                  sendToken === undefined || sendToken.kind === 'native'
                    ? 'border-accent-500 bg-accent-500/10 text-content-primary'
                    : 'border-surface-700 text-content-secondary'
                }`}
                disabled={isLoading || sendStatus === 'sending'}
              >
                Native ({nativeSymbol})
              </button>
              <button
                type="button"
                onClick={() => {
                  onTokenChange(account.chain === 'evm' ? { kind: 'erc20', address: '' } : { kind: 'spl', mint: '' });
                  onClearError();
                }}
                className={`flex-1 rounded-lg border px-3 py-2 font-body text-xs ${
                  sendToken?.kind === 'erc20' || sendToken?.kind === 'spl'
                    ? 'border-accent-500 bg-accent-500/10 text-content-primary'
                    : 'border-surface-700 text-content-secondary'
                }`}
                disabled={isLoading || sendStatus === 'sending'}
              >
                Token
              </button>
            </div>
          </div>
        )}

        {!isStellar && sendToken?.kind === 'erc20' && (
          <Input
            label="ERC-20 contract (0x…)"
            placeholder="0x…"
            value={sendToken.address ?? ''}
            onChange={(e) => { onTokenChange({ kind: 'erc20', address: e.target.value }); onClearError(); }}
            disabled={isLoading || sendStatus === 'sending'}
          />
        )}

        {!isStellar && sendToken?.kind === 'spl' && (
          <Input
            label="SPL mint"
            placeholder="SPL token mint"
            value={sendToken.mint ?? ''}
            onChange={(e) => { onTokenChange({ kind: 'spl', mint: e.target.value }); onClearError(); }}
            disabled={isLoading || sendStatus === 'sending'}
          />
        )}

        {sendAsset?.type === 'issued' && (
          <div className="flex flex-col gap-2">
            <Input
              label="Asset code"
              placeholder="e.g. USDC"
              value={sendAsset.code}
              onChange={(e) => {
                onAssetChange({ type: 'issued', code: e.target.value.toUpperCase(), issuer: sendAsset.issuer });
                onClearError();
              }}
              disabled={isLoading || sendStatus === 'sending'}
            />
            <Input
              label="Issuer address (G...)"
              placeholder="G..."
              value={sendAsset.issuer}
              onChange={(e) => {
                onAssetChange({ type: 'issued', code: sendAsset.code, issuer: e.target.value });
                onClearError();
              }}
              disabled={isLoading || sendStatus === 'sending'}
            />
          </div>
        )}

        <Input
          label={`Amount (${assetLabel})`}
          placeholder={`0.0 ${assetLabel}`}
          value={sendAmount}
          onChange={(e) => { onAmountChange(e.target.value); onClearError(); }}
          disabled={isLoading || sendStatus === 'sending'}
          inputMode="decimal"
        />

        {sendFee !== null && (
          <p className="font-body text-xs text-content-secondary">
            Estimated fee: {sendFee} {feeSymbol}
          </p>
        )}

        {insufficientBalance && sendStatus === 'confirm' && (
          <p className="font-body text-xs text-danger">
            Insufficient balance for the amount{sendToken === undefined || sendToken.kind === 'native' ? ' plus fee' : ''}.
          </p>
        )}

        {error !== null && (
          <p className="font-body text-xs text-danger">{error}</p>
        )}

        <div className="flex gap-2 mt-auto">
          <Button variant="secondary" onClick={onBack} disabled={isLoading}>
            Back
          </Button>
          {sendStatus !== 'done' && (
            <Button fullWidth onClick={onConfirm} disabled={disableSend}>
              {isLoading ? 'Sending…' : 'Send'}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Receive view ────────────────────────────────────────────────────────
function ReceiveView({
  account,
  onBack,
}: {
  account: AccountView;
  onBack: () => void;
}) {
  const { requestFaucet } = useWallet();
  const [faucetState, setFaucetState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [faucetError, setFaucetError] = useState<string | null>(null);
  const [faucetTxHash, setFaucetTxHash] = useState<string | null>(null);
  const [faucetOpened, setFaucetOpened] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(account.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** Opens an external faucet page in a new browser tab when one is returned. */
  const openExternalFaucet = (url: string) => {
    // The popup/sidepanel cannot fetch cross-origin, but a plain tab open is
    // allowed. The user completes any CAPTCHA/login there and funds arrive at
    // the pre-filled address.
    if (typeof chrome.tabs?.create === 'function') {
      void chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleFaucet = async () => {
    setFaucetState('loading');
    setFaucetError(null);
    setFaucetTxHash(null);
    setFaucetOpened(false);
    const result = await requestFaucet(account.chain, account.address);
    if (result.ok && result.faucetUrl !== undefined) {
      // External faucet (EVM always; Solana when the automatic airdrop fails):
      // open it so the user can complete the CAPTCHA / claim flow.
      openExternalFaucet(result.faucetUrl);
      setFaucetState('success');
      setFaucetOpened(true);
    } else if (result.ok) {
      // Fully automatic airdrop (Solana RPC success / Stellar Friendbot).
      setFaucetState('success');
      setFaucetTxHash(result.txHash ?? null);
    } else {
      setFaucetState('error');
      setFaucetError(result.error ?? 'Could not request testnet funds.');
    }
  };

  const faucetHint: Record<string, string> = {
    evm: 'Sepolia faucets need a CAPTCHA — we open one in a new tab with your address pre-filled.',
    solana: '0.1 SOL is airdropped automatically. If that fails, the web faucet opens in a new tab.',
    stellar: 'Friendbot funds this testnet address (10,000 XLM).',
  };

  return (
    <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-lg font-bold text-content-primary">Veilpay</h1>
        <span className="font-mono text-xs text-content-tertiary">v0.0.1</span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="font-body text-sm text-content-secondary">
          Your <span className="font-mono">{account.chain}</span> address
        </p>

        <div className="flex items-center justify-center rounded-2xl bg-white p-3">
          <QRCode value={account.address} size={220} />
        </div>

        <Card className="w-full">
          <p className="font-mono text-xs text-content-primary break-all text-center">
            {account.address}
          </p>
        </Card>
        <Button fullWidth onClick={handleCopy}>
          {copied ? (
            <>
              <Glyph name="check" className="h-4 w-4" /> Copied!
            </>
          ) : (
            <>
              <Glyph name="copy" className="h-4 w-4" /> Copy address
            </>
          )}
        </Button>

        <div className="w-full">
          <Button fullWidth variant="secondary" onClick={handleFaucet} disabled={faucetState === 'loading'}>
            {faucetState === 'loading' ? 'Requesting testnet funds…' : 'Get testnet funds'}
          </Button>
          <p className="mt-2 font-body text-xs text-content-tertiary text-center">{faucetHint[account.chain]}</p>

          {faucetState === 'success' && faucetOpened && (
            <div className="mt-2 rounded-xl border border-surface-600 bg-surface-700/60 p-3">
              <p className="font-body text-xs font-medium text-content-primary text-center">
                Faucet opened in a new tab.
              </p>
              <p className="mt-1 font-body text-xs text-content-secondary text-center">
                Complete the CAPTCHA there with this address to receive testnet funds.
              </p>
            </div>
          )}
          {faucetState === 'success' && !faucetOpened && faucetTxHash !== null && (
            <p className="mt-2 font-mono text-[10px] text-success break-all text-center">
              Requested. Tx: {faucetTxHash.slice(0, 18)}…
            </p>
          )}
          {faucetState === 'success' && !faucetOpened && faucetTxHash === null && (
            <p className="mt-2 font-body text-xs text-success text-center">Funds requested.</p>
          )}
          {faucetState === 'error' && (
            <p className="mt-2 font-body text-xs text-danger text-center">{faucetError}</p>
          )}
        </div>

        <Button variant="ghost" fullWidth onClick={onBack}>
          <Glyph name="arrow-left" className="h-4 w-4" /> Back
        </Button>
      </div>
    </main>
  );
}

// ── Import wallet ───────────────────────────────────────────────────────
function ImportWallet({
  importPhrase,
  importPass1,
  importPass2,
  importError,
  isLoading,
  onPhraseChange,
  onPass1Change,
  onPass2Change,
  onSubmit,
  onBack,
}: {
  importPhrase: string;
  importPass1: string;
  importPass2: string;
  importError: string | null;
  isLoading: boolean;
  onPhraseChange: (v: string) => void;
  onPass1Change: (v: string) => void;
  onPass2Change: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-lg font-bold text-content-primary">Veilpay</h1>
        <span className="font-mono text-xs text-content-tertiary">v0.0.1</span>
      </header>

      <div className="flex flex-1 flex-col gap-4">
        <h2 className="font-display text-base font-semibold text-content-primary">
          {t('onboarding.import')}
        </h2>
        <p className="font-body text-xs text-content-secondary">
          {t('onboarding.importHint')}
        </p>

        <Input
          label={t('onboarding.recoveryPhrase')}
          placeholder={t('onboarding.recoveryPhrase')}
          value={importPhrase}
          onChange={(e) => onPhraseChange(e.target.value)}
          disabled={isLoading}
        />
        <Input
          type="password"
          label="New passphrase (min. 10 chars)"
          placeholder="New passphrase (min. 10 chars)"
          value={importPass1}
          onChange={(e) => onPass1Change(e.target.value)}
          passwordToggle
          disabled={isLoading}
        />
        <Input
          type="password"
          label="Confirm passphrase"
          placeholder="Confirm passphrase"
          value={importPass2}
          onChange={(e) => onPass2Change(e.target.value)}
          passwordToggle
          error={importError ?? null}
          disabled={isLoading}
        />

        <div className="flex gap-2 mt-auto">
          <Button variant="secondary" onClick={onBack} disabled={isLoading}>
            {t('common.back')}
          </Button>
          <Button
            fullWidth
            onClick={onSubmit}
            disabled={isLoading || importPhrase.length === 0 || importPass1.length === 0 || importPass2.length === 0}
          >
            {isLoading ? t('onboarding.importing') : t('onboarding.import')}
          </Button>
        </div>
      </div>
    </main>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'good' | 'bad' | 'neutral';
}) {
  const color =
    tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-content-secondary';

  return (
    <div className="flex items-center justify-between py-1">
      <span className="font-body text-xs text-content-secondary">{label}</span>
      <span className={`font-mono text-xs ${color}`}>{value}</span>
    </div>
  );
}