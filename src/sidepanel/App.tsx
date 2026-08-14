import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { useWallet } from '@/ui/store/useWallet';
import { Button } from '@/ui/components/Button';
import { Input } from '@/ui/components/Input';
import { TestnetBanner } from '@/ui/components/TestnetBanner';
import { Dashboard } from '@/ui/components/Dashboard';
import { ConnectionApproval } from '@/ui/components/ConnectionApproval';
import { TransactionApproval } from '@/ui/components/TransactionApproval';
import { X402Approval } from '@/ui/components/X402Approval';
import { GrantApproval } from '@/ui/components/GrantApproval';

/** Full-height wallet companion surface for approvals and quick account access. */
export default function SidePanelApp() {
  const {
    vaultState, isLoading, error, accounts, pendingConnection, pendingApproval,
    pendingX402Payment, pendingGrantRequest, refresh, loadAccounts,
    loadPendingConnection, resolvePendingConnection, loadPendingApproval,
    resolvePendingApproval, loadPendingX402, resolvePendingX402,
    loadPendingGrantRequest, resolvePendingGrantRequest, unlock, lock,
  } = useWallet();
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    void loadPendingConnection();
    void loadPendingApproval();
    void loadPendingX402();
    void loadPendingGrantRequest();
  }, [refresh, loadPendingConnection, loadPendingApproval, loadPendingX402, loadPendingGrantRequest]);

  useEffect(() => {
    if (vaultState === 'unlocked' && accounts.length === 0) void loadAccounts();
  }, [vaultState, accounts.length, loadAccounts]);

  const handleUnlock = async () => {
    setUnlockError(null);
    if (unlockPassphrase.length === 0) {
      setUnlockError(t('wallet.passphrase'));
      return;
    }
    const ok = await unlock(unlockPassphrase);
    if (!ok) {
      setUnlockError(t('wallet.wrongPassphrase'));
      setUnlockPassphrase('');
    }
  };

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
    if (pendingConnection !== null) {
      await resolvePendingConnection(pendingConnection.origin, [], 'deny');
    }
  };

  const handleApproveApproval = async () => {
    if (pendingApproval !== null) await resolvePendingApproval(pendingApproval.id, 'approve');
  };

  const handleDenyApproval = async () => {
    if (pendingApproval !== null) await resolvePendingApproval(pendingApproval.id, 'deny');
  };

  const handleApproveX402 = async () => {
    if (pendingX402Payment !== null) await resolvePendingX402(pendingX402Payment.id, 'approve');
  };

  const handleDenyX402 = async () => {
    if (pendingX402Payment !== null) await resolvePendingX402(pendingX402Payment.id, 'deny');
  };

  const handleApproveGrant = async (pin?: string) => {
    if (pendingGrantRequest !== null) await resolvePendingGrantRequest(pendingGrantRequest.id, 'approve', pin);
  };

  const handleDenyGrant = async () => {
    if (pendingGrantRequest !== null) await resolvePendingGrantRequest(pendingGrantRequest.id, 'deny');
  };

  const openPopup = () => {
    void chrome.action.openPopup().catch(() => undefined);
  };

  if (pendingConnection !== null) {
    return (
      <div className="bg-surface-base">
        <ConnectionApproval
          origin={pendingConnection.origin}
          requestedAccounts={pendingConnection.requestedAccounts}
          onApprove={handleApproveConnection}
          onReject={handleDenyConnection}
        />
      </div>
    );
  }

  if (pendingApproval !== null) {
    return (
      <div className="bg-surface-base">
        <TransactionApproval
          approval={pendingApproval}
          onApprove={handleApproveApproval}
          onReject={handleDenyApproval}
        />
      </div>
    );
  }

  if (pendingX402Payment !== null) {
    return (
      <div className="bg-surface-base">
        <X402Approval
          payment={pendingX402Payment}
          onApprove={handleApproveX402}
          onReject={handleDenyX402}
        />
      </div>
    );
  }

  if (pendingGrantRequest !== null) {
    return (
      <div className="bg-surface-base">
        <GrantApproval
          request={pendingGrantRequest}
          onApprove={handleApproveGrant}
          onReject={handleDenyGrant}
        />
      </div>
    );
  }

  if (isLoading && vaultState === 'uninitialized') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
        <p className="font-body text-sm text-content-secondary">{t('status.loadingWallet')}</p>
      </main>
    );
  }

  const header = (
    <header className="flex items-baseline justify-between">
      <h1 className="font-display text-lg font-bold text-content-primary">{t('brand')}</h1>
      <span className="font-mono text-xs text-content-tertiary">{t('version')}</span>
    </header>
  );

  if (vaultState === 'uninitialized') {
    return (
      <main className="flex min-h-screen flex-col gap-4 p-4">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-700"><span className="text-xl">🪄</span></div>
          <h2 className="font-display text-base font-semibold text-content-primary">{t('wallet.noWallet')}</h2>
          <p className="font-body text-sm text-content-secondary max-w-xs">{t('wallet.noWalletDescription')}</p>
          <Button fullWidth onClick={openPopup}>{t('wallet.openPopup')}</Button>
        </div>
      </main>
    );
  }

  if (vaultState === 'locked') {
    return (
      <main className="flex min-h-screen flex-col gap-4 p-4">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-700"><span className="text-xl">🔒</span></div>
          <p className="font-body text-sm text-content-secondary">{t('wallet.locked')}</p>
          <div className="w-full max-w-sm">
            <Input
              type="password"
              label={t('wallet.passphrase')}
              placeholder={t('wallet.passphrase')}
              value={unlockPassphrase}
              onChange={(e) => { setUnlockPassphrase(e.target.value); setUnlockError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock(); }}
              error={unlockError ?? null}
              passwordToggle
              autoFocus
              disabled={isLoading}
            />
          </div>
          <Button fullWidth onClick={handleUnlock} disabled={isLoading || unlockPassphrase.length === 0}>
            {isLoading ? t('wallet.unlocking') : t('wallet.unlock')}
          </Button>
          {error !== null && <p className="font-body text-xs text-danger">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-3 p-4">
      {header}
      <TestnetBanner />
      <Dashboard accounts={accounts} onSend={openPopup} onReceive={openPopup} onImport={openPopup} onLock={() => void lock()} />
      <Button variant="ghost" fullWidth onClick={() => void chrome.runtime.openOptionsPage()}>{t('common.settings')}</Button>
    </div>
  );
}
