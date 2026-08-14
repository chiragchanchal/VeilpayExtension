import { useState } from 'react';
import { t } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
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
 * confirm countdown (anti-clickjack, spec §9): a hidden frame's programmatic
 * click cannot create a grant without the user visibly holding.
 */
export function GrantApproval({
  request,
  onApprove,
  onReject,
}: {
  request: PendingGrantRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<'idle' | 'counting' | 'ready'>('idle');
  const [confirmCount, setConfirmCount] = useState(3);
  const caps = request.requestedCaps;
  const expiresAt = new Date(Date.now() + request.expiresInSeconds * 1000);

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
    setIsLoading(true);
    await onApprove();
  };

  const handleReject = async () => {
    setIsLoading(true);
    await onReject();
  };

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

        <div className="mt-auto flex gap-3">
          <Button variant="secondary" fullWidth onClick={handleReject} disabled={isLoading}>
            {t('common.reject')}
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={handleApprove}
            disabled={isLoading || confirmState === 'counting'}
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