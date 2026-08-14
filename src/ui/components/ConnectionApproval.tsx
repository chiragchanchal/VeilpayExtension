import { useState } from 'react';
import { t } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';

/** Connection approval overlay shown when a dapp requests account access. */
export function ConnectionApproval({
  origin,
  requestedAccounts,
  onApprove,
  onReject,
}: {
  origin: string;
  requestedAccounts: { chain: string; address: string }[];
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

  return (
    <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-lg font-bold text-content-primary">{t('brand')}</h1>
        <span className="font-mono text-xs text-content-tertiary">{t('version')}</span>
      </header>

      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col items-center justify-center gap-3 py-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary/20">
            <span className="text-2xl">🔗</span>
          </div>
          <h2 className="font-display text-lg font-semibold text-content-primary">
            {t('approval.connectionTitle')}
          </h2>
          <p className="font-body text-sm text-content-secondary text-center max-w-xs">
            {t('approval.requestAccess', { origin })}
          </p>
        </div>

        <Card title={t('approval.account')}>
          <ul className="flex flex-col gap-2">
            {requestedAccounts.map((acc) => (
              <li
                key={`${acc.chain}:${acc.address}`}
                className="flex items-center justify-between rounded-lg bg-surface-700 px-3 py-2"
              >
                <span className="font-mono text-xs text-content-primary">{acc.chain}</span>
                <span className="font-mono text-[10px] text-content-tertiary">
                  {acc.address.slice(0, 10)}…{acc.address.slice(-4)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="mt-auto flex gap-3">
          <Button variant="secondary" fullWidth onClick={handleReject} disabled={isLoading}>
            {t('common.reject')}
          </Button>
          <Button variant="primary" fullWidth onClick={handleApprove} disabled={isLoading}>
            {isLoading ? 'Approving…' : t('approval.approveConnection')}
          </Button>
        </div>
      </div>
    </main>
  );
}
