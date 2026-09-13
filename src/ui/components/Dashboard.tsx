import { useEffect, useState } from 'react';
import { Glyph } from '@/ui/components/Glyph';
import { t } from '@/i18n';
import { useWallet, type AccountView } from '@/ui/store/useWallet';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { ExportKeyModal } from '@/ui/components/ExportKeyModal';
import type { IndexerTx } from '@/core/chains/indexer-service';

/** Display metadata per chain, used for the coin chip and balance rows. */
const CHAIN_META: Record<
  string,
  { label: string; symbol: string; initial: string; chip: string }
> = {
  evm: {
    label: 'Ethereum',
    symbol: 'ETH',
    initial: 'Ξ',
    chip: 'bg-gradient-to-br from-[#627EEA] to-[#4A5FC7]',
  },
  solana: {
    label: 'Solana',
    symbol: 'SOL',
    initial: 'S',
    chip: 'bg-gradient-to-br from-[#9945FF] to-[#14F195] text-surface-900',
  },
  stellar: {
    label: 'Stellar',
    symbol: 'XLM',
    initial: 'X',
    chip: 'bg-gradient-to-br from-[#7B8299] to-[#3E4557]',
  },
};

function metaFor(chain: string) {
  return (
    CHAIN_META[chain] ?? {
      label: chain.toUpperCase(),
      symbol: chain.toUpperCase(),
      initial: chain.charAt(0).toUpperCase(),
      chip: 'bg-surface-600',
    }
  );
}

/** Formats a base-unit balance into a human number, e.g. "0.4852 ETH". */
function formatBalance(balance: bigint, chain: string): string {
  const symbol = metaFor(chain).symbol;
  switch (chain) {
    case 'evm':
      return `${(Number(balance) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`;
    case 'solana':
      return `${(Number(balance) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`;
    case 'stellar':
      return `${(Number(balance) / 1e7).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`;
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

function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function AssetRow({
  account,
  balance,
  onSend,
  onReceive,
  onExport,
}: {
  account: AccountView;
  balance: bigint;
  onSend: () => void;
  onReceive: () => void;
  onExport: () => void;
}) {
  const meta = metaFor(account.chain);
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    void navigator.clipboard?.writeText(account.address).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <li className="group flex items-center gap-3 rounded-2xl border border-surface-700/70 bg-surface-800/80 px-3 py-2.5 transition-colors hover:border-surface-600">
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-sm ${meta.chip}`}
      >
        {meta.initial}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <button
            type="button"
            onClick={copyAddress}
            className="truncate font-body text-sm font-semibold text-content-primary hover:text-accent-300"
            title={copied ? 'Copied!' : `Copy ${account.chain} address`}
          >
            {meta.label}
            {copied && <span className="ml-1 font-body text-[10px] font-medium text-success">Copied</span>}
          </button>
          <span className="shrink-0 font-mono text-xs font-semibold text-content-primary">
            {formatBalance(balance, account.chain)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={copyAddress}
            className="truncate font-mono text-[10px] text-content-tertiary hover:text-content-secondary"
            title={copied ? 'Copied!' : `Copy ${account.chain} address`}
          >
            {shortAddress(account.address)}
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onSend}
              className="rounded-lg bg-surface-700 px-2 py-1 font-body text-[11px] font-semibold text-content-primary transition-colors hover:bg-surface-600"
            >
              {t('common.send')}
            </button>
            <button
              type="button"
              onClick={onReceive}
              className="rounded-lg bg-surface-700 px-2 py-1 font-body text-[11px] font-semibold text-content-primary transition-colors hover:bg-surface-600"
            >
              {t('common.receive')}
            </button>
            <button
              type="button"
              onClick={onExport}
              aria-label={`${t('common.export')} ${account.chain} private key`}
              title={`${t('common.export')} ${account.chain} private key`}
              className="rounded-lg bg-surface-700 px-1.5 py-1 text-content-tertiary transition-colors hover:bg-surface-600 hover:text-content-primary"
            >
              <Glyph name="key" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
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
  const { balances, loadAllBalances, isLoading, loadHistory } = useWallet();
  const [txs, setTxs] = useState<IndexerTx[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [exportAccount, setExportAccount] = useState<AccountView | null>(null);

  useEffect(() => {
    void loadAllBalances();
    if (accounts.length > 0) {
      setTxLoading(true);
      void Promise.allSettled(
        accounts.map((acc) => loadHistory(acc.chain, acc.address, 5)),
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
  }, [accounts, loadAllBalances, loadHistory]);

  const chainTotals = accounts.reduce<Partial<Record<AccountView['chain'], bigint>>>((sums, acc) => {
    const key = `${acc.chain}:${acc.address}` as const;
    const bal = balances[key] ?? 0n;
    sums[acc.chain] = (sums[acc.chain] ?? 0n) + bal;
    return sums;
  }, {});

  const hasBalances = Object.values(chainTotals).some((val) => val !== undefined && val > 0n);

  const handleFaucet = () => {
    if (accounts.length === 0) return;
    onReceive(0);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-content-primary">Portfolio</h2>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadAllBalances()}
            disabled={isLoading}
            aria-label="Refresh balances"
            title="Refresh balances"
          >
            <Glyph name="refresh" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onImport}>
            {t('common.import')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onLock}>
            {t('common.lock')}
          </Button>
        </div>
      </div>

      {/* Balance hero */}
      <section
        style={{ animationDelay: '0ms' }}
        className="relative animate-fade-in-up overflow-hidden rounded-2xl bg-gradient-to-br from-accent-400 via-accent-500 to-accent-700 p-4 text-surface-900 shadow-[0_10px_28px_-12px_rgba(245,158,11,0.55)]"
      >
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
        <p className="font-body text-xs font-semibold uppercase tracking-wider text-surface-900/70">
          Total Balance
        </p>
        <p className="mt-1 font-display text-[26px] font-bold leading-tight">
          {hasBalances ? (
            Object.entries(chainTotals)
              .filter(([, total]) => total !== undefined && total > 0n)
              .map(([chain, total]) => formatBalance(total ?? 0n, chain))
              .join(' · ')
          ) : (
            '—'
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {accounts.map((acc) => {
            const meta = metaFor(acc.chain);
            return (
              <span
                key={`${acc.chain}:${acc.address}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-900/15 px-2 py-1 font-body text-[11px] font-medium backdrop-blur-sm"
              >
                <span aria-hidden className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold ${meta.chip}`}>
                  {meta.initial}
                </span>
                {meta.symbol}
                <span className="font-mono opacity-70">{shortAddress(acc.address)}</span>
              </span>
            );
          })}
        </div>
      </section>

      {/* Quick actions */}
      <div style={{ animationDelay: '60ms' }} className="grid animate-fade-in-up grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => { if (accounts.length > 0) onSend(0); }}
          disabled={accounts.length === 0}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-surface-700 bg-surface-800 px-2 py-2.5 font-body text-sm font-semibold text-content-primary transition-all duration-base ease-out hover:-translate-y-0.5 hover:border-accent-500/50 hover:bg-surface-700 active:scale-[0.97] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
        >
          <Glyph name="send" className="h-4 w-4" />
          {t('common.send')}
        </button>
        <button
          type="button"
          onClick={() => { if (accounts.length > 0) onReceive(0); }}
          disabled={accounts.length === 0}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-surface-700 bg-surface-800 px-2 py-2.5 font-body text-sm font-semibold text-content-primary transition-all duration-base ease-out hover:-translate-y-0.5 hover:border-accent-500/50 hover:bg-surface-700 active:scale-[0.97] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
        >
          <Glyph name="receive" className="h-4 w-4" />
          {t('common.receive')}
        </button>
        <button
          type="button"
          onClick={handleFaucet}
          disabled={accounts.length === 0}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-surface-700 bg-surface-800 px-2 py-2.5 font-body text-sm font-semibold text-content-primary transition-all duration-base ease-out hover:-translate-y-0.5 hover:border-accent-500/50 hover:bg-surface-700 active:scale-[0.97] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
        >
          <Glyph name="droplet" className="h-4 w-4" />
          Faucet
        </button>
      </div>

      {/* Assets */}
      <div style={{ animationDelay: '120ms' }} className="animate-fade-in-up">
        <Card title="Assets">
          {accounts.length === 0 ? (
            <p className="font-body text-xs text-content-tertiary">
              No accounts. Import or create a wallet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {accounts.map((acc, i) => {
                const key = `${acc.chain}:${acc.address}` as const;
                const bal = balances[key] ?? 0n;
                return (
                  <AssetRow
                    key={key}
                    account={acc}
                    balance={bal}
                    onSend={() => onSend(i)}
                    onReceive={() => onReceive(i)}
                    onExport={() => setExportAccount(acc)}
                  />
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Recent Transactions */}
      <div style={{ animationDelay: '180ms' }} className="animate-fade-in-up">
        <Card title="Recent Transactions">
          {txLoading ? (
            <ul className="flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="relative h-12 overflow-hidden rounded-xl border border-surface-700/70 bg-surface-800/60"
                >
                  <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                </li>
              ))}
            </ul>
          ) : txs.length === 0 ? (
            <p className="font-body text-xs text-content-tertiary">No recent transactions.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {txs.map((tx, i) => (
                <li
                  key={`${tx.hash}-${i}`}
                  className="flex items-center justify-between rounded-xl border border-surface-700/70 bg-surface-800/60 px-3 py-2 transition-colors hover:border-surface-600"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-content-primary">
                      {tx.chain}
                      {tx.status === 'confirmed' ? (
                        <Glyph name="check" className="h-3.5 w-3.5 text-success" />
                      ) : tx.status === 'pending' ? (
                        <Glyph name="spinner" className="h-3.5 w-3.5 animate-spin text-content-secondary" />
                      ) : (
                        <Glyph name="alert" className="h-3.5 w-3.5 text-error" />
                      )}
                    </span>
                    <span className="truncate font-mono text-[10px] text-content-tertiary">
                      {tx.from.slice(0, 8)}… → {tx.to.slice(0, 8)}…
                    </span>
                  </div>
                  <div className="ml-2 flex shrink-0 flex-col items-end">
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
      </div>

      {exportAccount !== null && (
        <ExportKeyModal account={exportAccount} onClose={() => setExportAccount(null)} />
      )}
    </div>
  );
}
