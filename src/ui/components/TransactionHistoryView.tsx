import { useEffect, useState } from 'react';
import type { ChainId } from '@/core/messaging/protocol';
import { fetchTransactionHistory, type IndexerTx } from '@/core/chains/indexer-service';
import { useWallet } from '@/ui/store/useWallet';
import { Button } from '@/ui/components/Button';
import { EmptyState, ErrorState } from '@/ui/components/ErrorBoundary';

/**
 * Block-explorer URL for a transaction hash on a given chain (testnet).
 * Returns null when no explorer is known for the chain.
 */
export function explorerUrlFor(chain: ChainId, hash: string): string | null {
  switch (chain) {
    case 'evm':
      return `https://sepolia.etherscan.io/tx/${hash}`;
    case 'solana':
      return `https://explorer.solana.com/tx/${hash}?cluster=devnet`;
    case 'stellar':
      return `https://stellar.expert/explorer/testnet/tx/${hash}`;
    default:
      return null;
  }
}

/**
 * Serializes the visible transactions to CSV (RFC-4180-ish: quotes fields that
 * contain a comma, quote, or newline; doubles embedded quotes).
 */
export function transactionsToCsv(txs: IndexerTx[]): string {
  const escape = (value: string | number | undefined): string => {
    const s = value === undefined ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['chain', 'hash', 'status', 'timestamp', 'block', 'from', 'to', 'amount', 'fee'];
  const rows = txs.map((tx) =>
    [tx.chain, tx.hash, tx.status, tx.timestamp, tx.block, tx.from, tx.to, tx.amount, tx.fee]
      .map(escape)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Transaction history view — sortable, filterable by chain, with a details
 * modal (block-explorer link) and CSV export of the visible rows.
 */
export function TransactionHistoryView() {
  const { accounts } = useWallet();
  const [txs, setTxs] = useState<IndexerTx[]>([]);
  const [filterChain, setFilterChain] = useState<ChainId | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IndexerTx | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const all: IndexerTx[] = [];
        for (const acc of accounts) {
          const history = await fetchTransactionHistory(acc.chain, acc.address, 20);
          for (const tx of history.transactions) {
            all.push(tx);
          }
        }
        // Sort by timestamp descending (ISO-8601 strings compare lexicographically).
        all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        if (!cancelled) setTxs(all);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load transaction history.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [accounts]);

  const filtered = filterChain === 'all' ? txs : txs.filter((tx) => tx.chain === filterChain);

  const handleExportCsv = () => {
    const csv = transactionsToCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'veilpay-transactions.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold text-content-primary">Transaction History</h2>
        <p className="font-body text-sm text-content-secondary">Loading…</p>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold text-content-primary">Transaction History</h2>
        <ErrorState title="Load failed" message={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-content-primary">Transaction History</h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleExportCsv} disabled={filtered.length === 0}>
            Export CSV
          </Button>
          <div className="flex gap-2">
            {(['all', 'evm', 'solana', 'stellar'] as const).map((c) => (
              <button
                key={c}
                className={`rounded-lg px-3 py-1 text-xs font-body transition-colors ${
                  filterChain === c
                    ? 'bg-accent-primary/20 text-content-primary font-semibold'
                    : 'text-content-secondary hover:bg-surface-700'
                }`}
                onClick={() => setFilterChain(c)}
              >
                {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="📭"
          title="No transactions"
          message="No transactions found for the selected filter."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((tx) => (
            <button
              key={tx.hash}
              type="button"
              className="rounded-xl bg-surface-800 p-4 text-left transition-colors hover:bg-surface-700"
              onClick={() => setSelected(tx)}
            >
              <div className="flex items-center justify-between">
                <span className="font-body text-xs font-semibold text-content-secondary">
                  {tx.chain}
                </span>
                <span className="font-body text-xs text-content-secondary">
                  {tx.status ?? 'completed'}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-content-primary break-all">{tx.hash}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-body text-xs text-content-tertiary">
                  {formatTimestamp(tx.timestamp)}
                </span>
                <span className="font-body text-xs text-accent-primary">Details →</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected !== null && (
        <TransactionDetailsModal tx={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

/**
 * Details modal for a single transaction: full fields plus a block-explorer link
 * for the chain. Clicking outside the card closes it (light dismiss).
 */
function TransactionDetailsModal({ tx, onClose }: { tx: IndexerTx; onClose: () => void }) {
  const url = explorerUrlFor(tx.chain, tx.hash);

  const row = (label: string, value: string) => (
    <div className="flex flex-col gap-0.5">
      <span className="font-body text-[10px] uppercase tracking-wide text-content-tertiary">
        {label}
      </span>
      <span className="font-mono text-xs text-content-primary break-all">{value}</span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Transaction details"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-surface-800 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base font-semibold text-content-primary">
            Transaction details
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {row('Chain', tx.chain)}
          {row('Hash', tx.hash)}
          {row('Status', tx.status ?? 'completed')}
          {row('Timestamp', formatTimestamp(tx.timestamp))}
          {row('Block / slot', String(tx.block))}
          {row('From', tx.from)}
          {row('To', tx.to)}
          {row('Amount', tx.amount)}
          {row('Fee', tx.fee)}
        </div>

        {url !== null && (
          <div className="mt-4">
            <Button fullWidth variant="secondary" onClick={() => window.open(url, '_blank')}>
              View on explorer
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
