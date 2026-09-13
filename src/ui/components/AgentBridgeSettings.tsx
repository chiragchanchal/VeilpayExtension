import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/core/messaging/client';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { Input } from '@/ui/components/Input';
import { Glyph } from '@/ui/components/Glyph';

const send = createClient('options');

interface AgentStatus {
  enabled: boolean;
  mode: 'local' | 'relay' | null;
  endpoint: string | null;
  paired: boolean;
  connected: boolean;
  lastPollAt: number | null;
}

const DEFAULT_PORT = 8765;

/**
 * Pairs the wallet with an AI client, two ways.
 *
 * `relay` is the zero-install path: the user runs nothing, enters a code once,
 * and a hosted server routes requests. `local` runs the MCP server on this
 * machine, which avoids a third party seeing payment metadata but requires Node.
 */
export function AgentBridgeSettings() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [mode, setMode] = useState<'relay' | 'local'>('relay');
  const [relayUrl, setRelayUrl] = useState('');
  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [token, setToken] = useState('');
  const [pairing, setPairing] = useState<{ code: string; mcpUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await send('agent.status', {}));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read bridge status.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Connection state is live, so poll it while the panel is open.
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  /** Requests access to the user-supplied relay origin, if not already granted. */
  const ensureRelayPermission = async (origin: string): Promise<boolean> => {
    const pattern = `${origin}/*`;
    const has = await chrome.permissions.contains({ origins: [pattern] });
    if (has) return true;
    // Must be called from a user gesture, which a button click is.
    return chrome.permissions.request({ origins: [pattern] });
  };

  const handleRelayConnect = async () => {
    setError(null);
    setPairing(null);
    const trimmed = relayUrl.trim().replace(/\/$/, '');
    if (!/^https?:\/\//.test(trimmed)) {
      setError('Enter the relay URL, including https://.');
      return;
    }

    setBusy(true);
    try {
      // The relay is a user-supplied origin, so permission is requested at the
      // moment of use rather than granted to every site up front.
      if (!(await ensureRelayPermission(new URL(trimmed).origin))) {
        setError('Permission for that relay was declined.');
        return;
      }
      const result = await send('agent.relay.register', { baseUrl: trimmed });
      setPairing({ code: result.code, mcpUrl: result.mcpUrl });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach the relay.');
    } finally {
      setBusy(false);
    }
  };

  const handleLocalPair = async () => {
    setError(null);
    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
      setError('Port must be a number between 1 and 65535.');
      return;
    }
    if (token.trim().length < 16) {
      setError('Paste the pairing token printed by the MCP server.');
      return;
    }

    setBusy(true);
    try {
      await send('agent.configure', {
        mode: 'local',
        baseUrl: `http://127.0.0.1:${parsedPort}`,
        token: token.trim(),
      });
      setToken('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not pair the bridge.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      await send('agent.disable', {});
      setPairing(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not unpair.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Card title="Agent bridge">
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-body text-[11px] font-medium ${
              status?.connected
                ? 'bg-success/15 text-success'
                : status?.paired
                  ? 'bg-warning/15 text-warning'
                  : 'bg-surface-700 text-content-tertiary'
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${
                status?.connected ? 'bg-success' : status?.paired ? 'bg-warning' : 'bg-content-tertiary'
              }`}
            />
            {status?.connected
              ? 'Connected'
              : status?.paired
                ? 'Waiting for the AI client'
                : 'Not connected'}
          </span>
          {status?.endpoint !== null && status?.endpoint !== undefined && (
            <span className="truncate font-mono text-[11px] text-content-tertiary">
              {status.endpoint}
            </span>
          )}
        </div>

        {pairing !== null ? (
          <div className="flex flex-col gap-3">
            <p className="font-body text-xs text-content-secondary">
              Enter this code where you configured the AI client. It expires in 15
              minutes.
            </p>
            <p className="rounded-xl border border-accent-500/30 bg-accent-500/10 py-3 text-center font-mono text-xl font-bold tracking-widest text-accent-400">
              {pairing.code}
            </p>
            <div className="rounded-xl bg-surface-900 p-3">
              <p className="font-body text-[10px] uppercase tracking-wide text-content-tertiary">
                MCP server URL
              </p>
              <p className="mt-0.5 break-all font-mono text-[11px] text-content-primary">
                {pairing.mcpUrl}
              </p>
            </div>
            <Button variant="secondary" fullWidth onClick={handleDisable} disabled={busy}>
              Disconnect
            </Button>
          </div>
        ) : status?.paired === true ? (
          <div className="flex flex-col gap-2">
            <p className="font-body text-xs text-content-secondary">
              Connected. The agent can request payments within your grant caps;
              anything above your approval threshold still waits for you.
            </p>
            <Button variant="secondary" fullWidth onClick={handleDisable} disabled={busy}>
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('relay')}
                aria-pressed={mode === 'relay'}
                className={`flex-1 rounded-xl border px-3 py-2 font-body text-xs ${
                  mode === 'relay'
                    ? 'border-accent-500 bg-accent-500/10 text-content-primary'
                    : 'border-surface-700 text-content-secondary'
                }`}
              >
                Hosted relay
              </button>
              <button
                type="button"
                onClick={() => setMode('local')}
                aria-pressed={mode === 'local'}
                className={`flex-1 rounded-xl border px-3 py-2 font-body text-xs ${
                  mode === 'local'
                    ? 'border-accent-500 bg-accent-500/10 text-content-primary'
                    : 'border-surface-700 text-content-secondary'
                }`}
              >
                Run locally
              </button>
            </div>

            {mode === 'relay' ? (
              <>
                <Input
                  label="Relay URL"
                  placeholder="https://relay.example"
                  value={relayUrl}
                  onChange={(e) => setRelayUrl(e.target.value)}
                  disabled={busy}
                />
                <Button fullWidth onClick={handleRelayConnect} disabled={busy}>
                  {busy ? 'Connecting…' : 'Connect'}
                </Button>
              </>
            ) : (
              <>
                <Input
                  label="Bridge port"
                  placeholder={String(DEFAULT_PORT)}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  disabled={busy}
                />
                <Input
                  type="password"
                  passwordToggle
                  label="Pairing token"
                  placeholder="Paste the token from the MCP server"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={busy}
                />
                <Button fullWidth onClick={handleLocalPair} disabled={busy}>
                  {busy ? 'Pairing…' : 'Pair bridge'}
                </Button>
              </>
            )}
          </div>
        )}

        {error !== null && <p className="mt-2 font-body text-xs text-danger">{error}</p>}
      </Card>

      <Card title="Before you connect">
        <ul className="flex flex-col gap-2 font-body text-xs text-content-secondary">
          <li className="flex gap-2">
            <Glyph name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              This grants a spending capability. Keep your caps in{' '}
              <strong>VAP Grants</strong> small, and disconnect when you are done.
            </span>
          </li>
          <li className="flex gap-2">
            <Glyph name="shield" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-tertiary" />
            <span>
              A relay can only <em>ask</em> for payments — it can never authorise one.
              Caps and approvals are enforced here, in the extension.
            </span>
          </li>
          <li className="flex gap-2">
            <Glyph name="wallet" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-tertiary" />
            <span>
              Testnet only. Sepolia ETH, devnet SOL, and testnet XLM — no monetary
              value.
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
