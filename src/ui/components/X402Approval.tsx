import { useState } from 'react';
import { Icon } from '@/ui/components/Icon';
import { t } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import type { PendingX402Payment } from '@/ui/store/useWallet';

/**
 * Converts a wei decimal string to a displayable amount.
 *
 * Shows up to 4 decimal places, or falls back to raw base units for amounts
 * that would round to "0" — a rounded zero in an approval overlay would make a
 * real payment look like a no-op.
 */
function formatX402Amount(amountWei: string, asset: string): string {
  try {
    const value = BigInt(amountWei);
    const whole = value / 10n ** 18n;
    const fraction = value % 10n ** 18n;
    const frac = fraction.toString().padStart(18, '0').slice(0, 4);
    if (whole === 0n && /^0+$/.test(frac)) {
      return `${amountWei} ${asset} (base units)`;
    }
    const trimmed = frac.replace(/0+$/, '');
    return `${whole}${trimmed.length > 0 ? `.${trimmed}` : ''} ${asset}`;
  } catch {
    return `${amountWei} ${asset}`;
  }
}

/**
 * x402 payment approval overlay — shown when a page calls
 * `window.veilpay.agent.payChallenge(challenge)`.
 *
 * Displays the service, resource, chain, amount, and recipient exactly as the
 * challenge named them. Approving wakes the awaiting background handler, which
 * signs the payment payload and returns the `X-PAYMENT` header to the page.
 */
export function X402Approval({
  payment,
  onApprove,
  onReject,
}: {
  payment: PendingX402Payment;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const challenge = payment.challenge;

  const handleApprove = async () => {
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
            <Icon name="card" className="h-7 w-7" />
          </div>
          <h2 className="font-display text-lg font-semibold text-content-primary">
            {t('x402.paymentTitle')}
          </h2>
          <p className="font-body text-sm text-content-secondary text-center max-w-xs">
            {t('x402.requestInfo')}
          </p>
          <p className="font-mono text-xs text-content-tertiary">{payment.origin}</p>
        </div>

        <Card title={t('x402.service')}>
          <div className="flex flex-col gap-2">
            <DetailRow label={t('x402.serviceDescription')} value={challenge.description} mono={false} />
            <DetailRow label={t('x402.resource')} value={challenge.resource} mono={false} />
            <DetailRow label={t('x402.chain')} value={challenge.chain} />
            <DetailRow
              label={t('x402.paymentAmount')}
              value={formatX402Amount(challenge.amount, challenge.asset)}
              mono={false}
            />
            <DetailRow label={t('x402.recipient')} value={challenge.payTo} />
          </div>
        </Card>

        <div className="mt-auto flex gap-3">
          <Button variant="secondary" fullWidth onClick={handleReject} disabled={isLoading}>
            {t('common.reject')}
          </Button>
          <Button variant="primary" fullWidth onClick={handleApprove} disabled={isLoading}>
            {isLoading ? 'Paying…' : t('x402.approvePayment')}
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