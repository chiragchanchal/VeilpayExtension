import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { useWallet, type AccountView } from '@/ui/store/useWallet';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { ExportKeyModal } from '@/ui/components/ExportKeyModal';
import { fetchTransactionHistory, type IndexerTx } from '@/core/chains/indexer-service';

function formatBalance(balance: bigint, chain: string): string {
  switch (chain) {
    case 'evm':
      // Convert wei to ETH (display 4 decimals)
      return `${(Number(balance) / 1e18).toFixed(4)} ETH`;
    case 'solana':
      // Convert lamports to SOL
      return `${(Number(balance) / 1e9).toFixed(4)} SOL`;
    case 'stellar':
      // Convert stroops to XLM
      return `${(Number(balance) / 1e7).toFixed(4)} XLM`;
    default:
      return `${balance.toString()}`;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function Dashboard({
  accounts,
  onSend,
  onReceive,
  onImport,
  onLock,
}: {
  accounts: AccountView[];
  onSend: (idx: number) => void;
  onReceive: (idx: number) => void;
  onImport: () => void;
  onLock: () => void;
}) {
  const { balances, loadAllBalances, isLoading } = useWallet();
  const [txs, setTxs] = useState<IndexerTx[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  /** Account whose key export modal is open, if any. */
  const [exportAccount, setExportAccount] = useState<AccountView | null>(null);

  // Load balances and tx history on mount.
  useEffect(() => {
    void loadAllBalances();
    if (accounts.length > 0) {
      setTxLoading(true);
      void Promise.allSettled(
        accounts.map((acc) => fetchTransactionHistory(acc.chain, acc.address, 5)),
      ).then((results) => {
        const all: IndexerTx[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled') {
            all.push(...r.value.transactions);
          }
        }
        all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTxs(all.slice(0, 10));
        setTxLoading(false);
      });
    }
  }, [accounts, loadAllBalances]);

  // Per-chain totals in that chain's own native units. Summing base units across
  // chains into one figure (wei + lamports + stroops) and labeling it a single
  // "balance" would be meaningless and silently lossy, so each chain is summed
  // and formatted independently.
  const chainTotals = accounts.reduce<Partial<Record<AccountView['chain'], bigint>>>((sums, acc) => {
    const key = `${acc.chain}:${acc.address}` as const;
    const bal = balances[key] ?? 0n;
    sums[acc.chain] = (sums[acc.chain] ?? 0n) + bal;
    return sums;
  }, {});

  return (
    <div className="flex flex-col gap-3">
      {/* Portfolio summary */}
      <Card title={t('dashboard.portfolio')}>
        <div className="py-2 text-center">
          <p className="font-body text-xs text-content-tertiary">{t('dashboard.balancesByChain')}</p>
          <div className="mt-1 flex flex-col gap-1">
            {(Object.keys(chainTotals) as AccountView['chain'][]).map((chain) => {
              const total = chainTotals[chain];
              if (total === undefined || total === 0n) return null;
              return (
                <p key={chain} className="font-display text-base font-semibold text-content-primary">
                  {formatBalance(total, chain)}
                </p>
              );
            })}
          </div>
          {(Object.keys(chainTotals) as AccountView['chain'][]).every(
            (chain) => (chainTotals[chain] ?? 0n) === 0n,
          ) && (
            <p className="font-body text-xs text-content-tertiary">
              {t('dashboard.noBalances')}
            </p>
          )}
        </div>
      </Card>

      {/* Asset list */}
      <Card title={t('dashboard.assets')}>
        {accounts.length === 0 ? (
          <p className="font-body text-xs text-content-tertiary">
            {t('dashboard.noAccounts')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {accounts.map((acc, i) => {
              const key = `${acc.chain}:${acc.address}` as const;
              const bal = balances[key] ?? 0n;
              return (
                <li key={key} className="flex items-center justify-between rounded-lg bg-surface-700 px-3 py-2">
                  <div className="flex flex-col">
                    <span className="font-mono text-xs text-content-primary">{acc.chain}</span>
                    <span className="font-mono text-[10px] text-content-tertiary">
                      {acc.address.slice(0, 8)}…{acc.address.slice(-4)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-content-secondary">
                      {formatBalance(bal, acc.chain)}
                    </span>
                    <Button variant="primary" size="sm" onClick={() => onSend(i)}>
                      {t('common.send')}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onReceive(i)}>
                      {t('common.receive')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${t('common.export')} ${acc.chain} private key`}
                      onClick={() => setExportAccount(acc)}
                    >
                      {t('common.export')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => loadAllBalances()} disabled={isLoading}>
            {isLoading ? t('common.loading') : t('common.refresh')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onLock}>
            {t('common.lock')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onImport}>
            {t('common.import')}
          </Button>
        </div>
      </Card>

      {/* Recent transactions */}
      <Card title={t('dashboard.recentTransactions')}>
        {txLoading ? (
          <p className="font-body text-xs text-content-tertiary">{t('dashboard.loadingTransactions')}</p>
        ) : txs.length === 0 ? (
          <p className="font-body text-xs text-content-tertiary">
            {t('dashboard.noRecent')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {txs.map((tx, i) => (
              <li
                key={`${tx.hash}-${i}`}
                className="flex items-center justify-between rounded-lg bg-surface-700 px-3 py-2"
              >
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-mono text-xs text-content-primary">
                    {tx.chain} — {tx.status === 'confirmed' ? '✅' : tx.status === 'pending' ? '⏳' : '❌'}
                  </span>
                  <span className="font-mono text-[10px] text-content-tertiary truncate">
                    {tx.from.slice(0, 8)}… → {tx.to.slice(0, 8)}…
                  </span>
                </div>
                <div className="flex flex-col items-end shrink-0 ml-2">
                  <span className="font-mono text-xs text-content-secondary">
                    {formatBalance(BigInt(tx.amount), tx.chain)}
                  </span>
                  <span className="font-mono text-[10px] text-content-tertiary">
                    {formatTime(tx.timestamp)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {exportAccount !== null && (
        <ExportKeyModal account={exportAccount} onClose={() => setExportAccount(null)} />
      )}
    </div>
  );
}