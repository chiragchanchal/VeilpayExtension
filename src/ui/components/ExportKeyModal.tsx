import { useEffect, useRef, useState } from 'react';
import { useWallet, type AccountView } from '@/ui/store/useWallet';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';

const CLIPBOARD_CLEAR_MS = 30_000;

/**
 * Export key modal.
 *
 * Requires the vault to be unlocked (enforced by the background handler), then
 * reveals the chain's private key. The key is copied to the clipboard and
 * auto-cleared after 30 seconds.
 */
export function ExportKeyModal({
  account,
  onClose,
}: {
  account: AccountView;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'confirm' | 'show'>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const clearTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (clearTimer.current !== null) {
        window.clearTimeout(clearTimer.current);
      }
    };
  }, []);

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimer.current = window.setTimeout(() => {
        // Only clear the clipboard if it still holds our key: the user may have
        // copied something else during the 30s window, and wiping that would be
        // destructive. Comparing avoids touching an unrelated value.
        void navigator.clipboard
          .readText()
          .then((current) => {
            if (current === value) {
              return navigator.clipboard.writeText('');
            }
            return undefined;
          })
          .catch(() => {
            // Clipboard read can be blocked (no permission); on failure, best
            // effort is to clear what we wrote. Overwriting an unknown value is
            // the lesser evil to keeping a private key on the system clipboard.
            return navigator.clipboard.writeText('');
          })
          .finally(() => setCopied(false));
      }, CLIPBOARD_CLEAR_MS);
    } catch {
      setCopied(false);
    }
  };

  const handleExport = async () => {
    setError(null);
    try {
      const result = await useWallet.getState().exportKey(account.chain, account.index);
      setKey(result.privateKey);
      setAddress(result.address);
      setStep('show');
      await copyToClipboard(result.privateKey);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export key.');
    }
  };

  if (step === 'confirm') {
    return (
      <Card title="Export private key">
        <p className="font-body text-xs text-content-secondary mb-3">
          Reveal the private key for your {account.chain} account?
        </p>
        <p className="font-body text-xs text-content-tertiary mb-3">
          Anyone with this key has full control of the account. Only export if you
          are sure you need it (e.g. importing into another wallet).
        </p>
        {error !== null && (
          <p className="font-body text-xs text-error mb-2">{error}</p>
        )}
        <div className="flex flex-col gap-2">
          <Button fullWidth onClick={handleExport}>
            Export private key
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Private key">
      <p className="font-body text-xs text-content-tertiary mb-3">
        Copied to clipboard. Auto-clears after 30 seconds. Do not share it.
      </p>
      <div className="rounded-lg bg-surface-900 p-3 font-mono text-xs text-content-primary break-all">
        {key}
      </div>
      <p className="font-mono text-[10px] text-content-tertiary mt-2">
        {address}
      </p>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => { if (key) void copyToClipboard(key); }}>
          {copied ? 'Copied ✓' : 'Copy again'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </Card>
  );
}