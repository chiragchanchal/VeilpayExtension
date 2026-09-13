import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/core/messaging/client';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { Input } from '@/ui/components/Input';
import { Glyph } from '@/ui/components/Glyph';

/** Sends from the options surface; the bridge itself lives in the background. */
const send = createClient('options');

interface AgentStatus {
  enabled: boolean;
  port: number | null;
  paired: boolean;
  connected: boolean;
  lastPollAt: number | null;
}

const DEFAULT_PORT = 8765;

/**
 * Pairs the wallet with a local MCP server so an AI agent can request payments.
 *
 * The token shown here is a bearer credential: anything that reads it may spend
 * within the user's grant caps without a per-payment prompt. The copy says so.
 */
export function AgentBridgeSettings() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [token, setToken] = useState('');
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
    // Status is live (the poll loop may connect or drop), so poll it while open.
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const handlePair = async () => {
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
      await send('agent.configure', { port: parsedPort, token: token.trim() });
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
        <p className="mb-3 font-body text-xs text-content-secondary">
          Let an AI agent (Claude, or any MCP client) request payments. Start the
          server with <code className="font-mono text-content-primary">node mcp/veilpay-mcp.mjs</code>,
          then paste the token it prints here.
        </p>

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
            {status?.connected ? 'Connected' : status?.paired ? 'Waiting for the server' : 'Not paired'}
          </span>
          {status?.port !== null && status?.port !== undefined && (
            <span className="font-mono text-[11px] text-content-tertiary">
              127.0.0.1:{status.port}
            </span>
          )}
        </div>

        {status?.paired === true ? (
          <div className="flex flex-col gap-2">
            <p className="font-body text-xs text-content-secondary">
              Paired. The agent can request payments within your grant caps; anything
              above your approval threshold still waits for you.
            </p>
            <Button variant="secondary" fullWidth onClick={handleDisable} disabled={busy}>
              Unpair bridge
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
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
            <Button fullWidth onClick={handlePair} disabled={busy}>
              {busy ? 'Pairing…' : 'Pair bridge'}
            </Button>
          </div>
        )}

        {error !== null && (
          <p className="mt-2 font-body text-xs text-danger">{error}</p>
        )}
      </Card>

      <Card title="Before you pair">
        <ul className="flex flex-col gap-2 font-body text-xs text-content-secondary">
          <li className="flex gap-2">
            <Glyph name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              The token is a spending credential. Anything on this machine that reads
              it can spend within your caps without asking — keep the caps small.
            </span>
          </li>
          <li className="flex gap-2">
            <Glyph name="shield" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-tertiary" />
            <span>
              Payments are capped by the grants in <strong>VAP Grants</strong>, and every
              one is written to the audit ledger.
            </span>
          </li>
          <li className="flex gap-2">
            <Glyph name="wallet" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-tertiary" />
            <span>
              Testnet only. The wallet holds Sepolia ETH, devnet SOL, and testnet XLM —
              these have no monetary value.
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
