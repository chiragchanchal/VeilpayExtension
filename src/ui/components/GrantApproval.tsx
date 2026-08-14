import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { Input } from '@/ui/components/Input';
import { useWallet } from '@/ui/store/useWallet';
import type { PendingGrantRequest } from '@/ui/store/useWallet';

/** Formats a wei decimal string as a short ETH figure for display. */
function formatEthAmount(wei: string): string {
  try {
    const value = BigInt(wei);
    const whole = value / 10n ** 18n;
    const fraction = value % 10n ** 18n;
    const frac = fraction.toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
    return `${whole}${frac.length > 0 ? `.${frac}` : ''} ETH`;
  } catch {
    return `${wei} wei`;
  }
}

/**
 * Grant approval overlay — shown when a page calls
 * `window.veilpay.agent.requestGrant(...)`.
 *
 * Displays the requested caps verbatim. Approving is gated by a 3s hold-to-
 * confirm countdown (anti-clickjack, spec §9), and — when a PIN is configured —
 * by the PIN itself (VAP-01: a grant cannot be created without PIN or WebAuthn
 * confirmation). The PIN is verified in the background at resolve time, not in
 * the UI.
 */
export function GrantApproval({
  request,
  onApprove,
  onReject,
}: {
  request: PendingGrantRequest;
  onApprove: (pin?: string) => void;
  onReject: () => void;
}) {
  const { securityStatus, loadSecurityStatus } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<'idle' | 'counting' | 'ready'>('idle');
  const [confirmCount, setConfirmCount] = useState(3);
  const [pin, setPin] = useState('');
  const caps = request.requestedCaps;
  const expiresAt = new Date(Date.now() + request.expiresInSeconds * 1000);

  const pinRequired = securityStatus?.pinEnabled === true;

  useEffect(() => {
    void loadSecurityStatus();
  }, [loadSecurityStatus]);

  const handleApprove = async () => {
    if (confirmState === 'idle') {
      setConfirmState('counting');
      const timer = setInterval(() => {
        setConfirmCount((c) => {
          if (c <= 1) {
            clearInterval(timer);
            setConfirmState('ready');
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      return;
    }
    if (confirmState !== 'ready') return;
    if (pinRequired && pin.length === 0) return;
    setIsLoading(true);
    await onApprove(pinRequired ? pin : undefined);
  };

  const handleReject = async () => {
    setIsLoading(true);
    await onReject();
  };

  // The button must stay enabled in the idle state so the first click can start
  // the countdown; the PIN requirement gates only the ready (post-hold) state.
  const approveDisabled =
    isLoading ||
    confirmState === 'counting' ||
    (confirmState === 'ready' && pinRequired && pin.length === 0);

  return (
    <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-lg font-bold text-content-primary">{t('brand')}</h1>
        <span className="font-mono text-xs text-content-tertiary">{t('version')}</span>
      </header>

      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col items-center justify-center gap-3 py-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary/20">
            <span className="text-2xl">🔑</span>
          </div>
          <h2 className="font-display text-lg font-semibold text-content-primary">
            {t('vap.grantTitle')}
          </h2>
          <p className="font-body text-sm text-content-secondary text-center max-w-xs">
            {t('vap.grantDescription')}
          </p>
          <p className="font-mono text-xs text-content-tertiary">{request.origin}</p>
        </div>

        <Card title={t('vap.requestedCaps')}>
          <div className="flex flex-col gap-2">
            <DetailRow label={t('vap.maxPerOperation')} value={formatEthAmount(caps.maxPerOperation)} />
            <DetailRow label={t('vap.maxPerWindow')} value={formatEthAmount(caps.maxPerWindow)} />
            <DetailRow label={t('vap.window')} value={`${caps.windowSeconds / 3600} hours`} />
            <DetailRow label={t('vap.autoApproveUnder')} value={formatEthAmount(caps.approvalThreshold)} />
            <DetailRow label={t('vap.expires')} value={expiresAt.toLocaleString()} mono={false} />
          </div>
        </Card>

        {pinRequired && confirmState === 'ready' && (
          <Input
            type="password"
            label="PIN"
            placeholder="Enter your PIN to create the grant"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
            disabled={isLoading}
          />
        )}

        <div className="mt-auto flex gap-3">
          <Button variant="secondary" fullWidth onClick={handleReject} disabled={isLoading}>
            {t('common.reject')}
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={handleApprove}
            disabled={approveDisabled}
          >
            {isLoading
              ? 'Creating…'
              : confirmState === 'counting'
                ? t('vap.holdToConfirm', { count: confirmCount })
                : t('vap.createGrant')}
          </Button>
        </div>
      </div>
    </main>
  );
}

function DetailRow({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-body text-[10px] uppercase tracking-wide text-content-tertiary">
        {label}
      </span>
      <span
        className={`text-xs text-content-primary break-all ${
          mono ? 'font-mono' : 'font-body'
        }`}
      >
        {value}
      </span>
    </div>
  );
}