import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import {
  exportAudit,
  verifyAuditChain,
  type AuditLedgerRecord,
} from '@/core/vap/audit';

/**
 * Audit ledger view — shows the hash-chained, append-only payment and grant
 * history, can verify the chain is unbroken, and can export it as JSON.
 *
 * The ledger contains no key material (VAP-11): amounts, addresses, and
 * operation types only.
 */
export function AuditView() {
  const [entries, setEntries] = useState<AuditLedgerRecord[]>([]);
  const [verification, setVerification] = useState<{
    valid: boolean;
    brokenAt?: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [exported, setExported] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setEntries(await exportAudit());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleVerify = async () => {
    setVerification(await verifyAuditChain());
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'veilpay-audit.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-content-primary">Audit ledger</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleVerify} disabled={entries.length === 0}>
            Verify chain
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport} disabled={entries.length === 0}>
            {exported ? 'Exported!' : 'Export JSON'}
          </Button>
        </div>
      </div>

      <p className="font-body text-xs text-content-secondary">
        Append-only record of grant lifecycle and payment outcomes. Each entry is
        hash-chained to its predecessor, so tampering is detectable.
      </p>

      {verification !== null && (
        <Card title="Chain check">
          <p className={`font-body text-sm ${verification.valid ? 'text-success' : 'text-danger'}`}>
            {verification.valid
              ? 'Chain is valid — no tampering detected.'
              : `Chain is broken at sequence ${verification.brokenAt}.`}
          </p>
        </Card>
      )}

      {isLoading ? (
        <Card title="Entries">
          <p className="font-body text-sm text-content-secondary">Loading…</p>
        </Card>
      ) : entries.length === 0 ? (
        <Card title="Entries">
          <p className="font-body text-sm text-content-secondary">No audit entries yet.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <Card key={entry.sequence} title={entry.operationType}>
              <div className="flex flex-col gap-1">
                <span className="font-body text-xs text-content-tertiary">
                  seq {entry.sequence} · {new Date(entry.timestamp).toLocaleString()}
                </span>
                <span className="font-mono text-[10px] text-content-tertiary break-all">
                  {JSON.stringify(entry.sanitizedPayload)}
                </span>
                <span className="font-mono text-[10px] text-content-tertiary break-all">
                  hash {entry.entryHash.slice(0, 16)}…
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}