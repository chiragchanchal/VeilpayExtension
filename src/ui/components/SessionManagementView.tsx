import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { useWallet } from '@/ui/store/useWallet';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';

/**
 * Session management view — shows active session info, auto-lock config,
 * and allows locking the wallet.
 */
export function SessionManagementView() {
  const { vaultState, unlockedUntil, lock, refresh } = useWallet();
  const [timeLeft, setTimeLeft] = useState<string>('');

  // Refresh the session state once on mount. Crucially, this is NOT coupled to
  // the countdown: `vault.status` returns a freshly-computed `unlockedUntil`
  // every call, so depending on `unlockedUntil` while also calling `refresh()`
  // would re-trigger this effect on every refresh and spin an infinite call loop.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Countdown tick — depends only on the current expiry, never triggers a refresh.
  useEffect(() => {
    const tick = () => {
      if (vaultState === 'unlocked' && unlockedUntil !== null) {
        const remaining = Math.max(0, unlockedUntil - Date.now());
        const mins = Math.floor(remaining / 60_000);
        const secs = Math.floor((remaining % 60_000) / 1000);
        setTimeLeft(`${mins}m ${secs}s`);
      } else {
        setTimeLeft(t('surfaces.locked'));
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [vaultState, unlockedUntil]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-content-primary">{t('settings.session')}</h2>

      <Card title={t('settings.walletState')}>
        <p className="font-body text-sm text-content-secondary">
          Status: <span className="font-semibold text-content-primary">{vaultState}</span>
        </p>
        {vaultState === 'unlocked' && (
          <>
            <p className="font-body text-sm text-content-secondary">
              Auto-lock in: <span className="font-mono text-content-primary">{timeLeft}</span>
            </p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={lock}>
              {t('settings.lockWallet')}
            </Button>
          </>
        )}
      </Card>

      <Card title={t('settings.sessionTimeout')}>
        <p className="font-body text-sm text-content-secondary">
          The wallet locks automatically after 15 minutes of inactivity. This prevents
          unauthorized access if you leave your device unattended.
        </p>
      </Card>
    </div>
  );
}