import { useState } from 'react';
import { Icon } from '@/ui/components/Icon';
import { t } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import type { PendingApproval } from '@/ui/store/useWallet';

/** Converts a wei decimal string to a displayable ETH figure (4 decimals). */
function formatEth(wei: string | undefined): string {
  if (wei === undefined) return '0 ETH';
  try {
    const value = BigInt(wei);
    const whole = value / 10n ** 18n;
    const fraction = value % 10n ** 18n;
    const frac = fraction.toString().padStart(18, '0').slice(0, 4);
    return `${whole}.${frac} ETH`;
  } catch {
    return `${wei} wei`;
  }
}

/**
 * Transaction / signature approval overlay — shown when a dapp calls
 * `eth_sendTransaction` or `personal_sign`.
 *
 * Displays what the dapp asked for (recipient, amount, calldata presence, or
 * the message to sign) with Approve / Reject buttons. Approving wakes the
 * awaiting background handler, which signs and broadcasts (or signs the
 * message) and resolves the dapp's original call.
 */
export function TransactionApproval({
  approval,
  onApprove,
  onReject,
}: {
  approval: PendingApproval;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleApprove = async () => {
    setIsLoading(true);
    await onApprove();
  };

  const handleReject = async () => {
    setIsLoading(true);
    await onReject();
  };

  const isTx = approval.kind === 'tx';

  return (
    <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-lg font-bold text-content-primary">{t('brand')}</h1>
        <span className="font-mono text-xs text-content-tertiary">{t('version')}</span>
      </header>

      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col items-center justify-center gap-3 py-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary/20">
            <Icon name={isTx ? 'send' : 'sign'} className="h-7 w-7" />
          </div>
          <h2 className="font-display text-lg font-semibold text-content-primary">
            {isTx ? t('approval.transactionTitle') : t('approval.signatureTitle')}
          </h2>
          <p className="font-body text-sm text-content-secondary text-center max-w-xs">
            {t('approval.requestAction', {
              origin: approval.origin,
              action: isTx ? 'to send a transaction' : 'a message signature',
            })}
          </p>
        </div>

        {isTx ? (
          <Card title={t('approval.transaction')}>
            <div className="flex flex-col gap-2">
              <DetailRow label={t('approval.from')} value={approval.address} />
              <DetailRow label={t('approval.to')} value={approval.to ?? '—'} />
              <DetailRow label={t('approval.amount')} value={formatEth(approval.value)} mono={false} />
              {approval.data !== undefined && approval.data.length > 2 && (
                <DetailRow
                  label={t('approval.calldata')}
                  value={`${approval.data.slice(0, 18)}… (${((approval.data.length - 2) / 2).toFixed(0)} bytes)`}
                  mono={false}
                />
              )}
            </div>
          </Card>
        ) : (
          <Card title={t('approval.message')}>
            <div className="flex flex-col gap-2">
              <DetailRow label={t('approval.account')} value={approval.address} />
              <DetailRow label={t('approval.message')} value={approval.message ?? '—'} />
            </div>
          </Card>
        )}

        <div className="mt-auto flex gap-3">
          <Button variant="secondary" fullWidth onClick={handleReject} disabled={isLoading}>
            {t('common.reject')}
          </Button>
          <Button variant="primary" fullWidth onClick={handleApprove} disabled={isLoading}>
            {isLoading ? 'Approving…' : t('common.approve')}
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
