/**
 * Agent bridge — lets a local MCP server (Claude, ChatGPT via MCP) request
 * payments from the wallet.
 *
 * Direction of trust, which is the whole design: the extension cannot be
 * reached inbound, so *this* side polls a localhost HTTP server that the MCP
 * server runs. Nothing is exposed to the network, and every request is
 * authorised by the same grant machinery as a dapp payment — the bridge is just
 * another client. See `docs/AGENT_PAYMENTS.md`.
 *
 * This module owns transport only. What a tool *does* is injected as `execute`,
 * so the payment logic stays next to the rest of the wallet's signing code and
 * this file remains testable with a fake fetch.
 */

const STORAGE_KEY = 'agent:bridge';

/** How long a poll waits before the server answers 204. Matches the server. */
export const POLL_TIMEOUT_MS = 25_000;

/** Backoff after a failed poll, so a closed bridge does not spin. */
export const RETRY_DELAY_MS = 3_000;

export interface AgentBridgeConfig {
  port: number;
  /**
   * The pairing token. This is a bearer credential: anything that reads it can
   * drive the wallet within the user's grant caps. It lives in
   * `chrome.storage.local`, which is unencrypted on disk — acceptable because it
   * grants only local access that is further bounded by grants, but it is why
   * the token is never returned over the message bus or shown in logs.
   */
  token: string;
  /** Epoch ms when the user paired. */
  pairedAt: number;
}

export async function loadAgentBridgeConfig(): Promise<AgentBridgeConfig | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.port !== 'number' || typeof record.token !== 'string') return null;
  return {
    port: record.port,
    token: record.token,
    pairedAt: typeof record.pairedAt === 'number' ? record.pairedAt : 0,
  };
}

export async function saveAgentBridgeConfig(config: AgentBridgeConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
}

export async function clearAgentBridgeConfig(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

function baseUrl(config: AgentBridgeConfig): string {
  return `http://127.0.0.1:${config.port}`;
}

export interface BridgeRequest {
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

/**
 * Performs one poll cycle.
 *
 * Returns whether a request was handled, plus the connection state, so the
 * caller can drive backoff and status reporting without inspecting the network
 * itself.
 */
export async function pollOnce(
  config: AgentBridgeConfig,
  execute: (request: BridgeRequest) => Promise<unknown>,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<{ connected: boolean; handled: boolean }> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl(config)}/next`, {
      headers: { 'x-veilpay-token': config.token },
      ...(signal !== undefined ? { signal } : {}),
    });
  } catch {
    // Bridge not running, or the service worker is shutting down.
    return { connected: false, handled: false };
  }

  if (response.status === 204) {
    // Long-poll elapsed with no work: the server is healthy and idle.
    return { connected: true, handled: false };
  }
  if (!response.ok) {
    // 401 means the token no longer matches — surface as disconnected so the
    // UI can tell the user to re-pair rather than silently retrying forever.
    return { connected: false, handled: false };
  }

  let request: BridgeRequest;
  try {
    const parsed = (await response.json()) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return { connected: true, handled: false };
    const record = parsed as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.tool !== 'string') {
      return { connected: true, handled: false };
    }
    request = {
      id: record.id,
      tool: record.tool,
      args: typeof record.args === 'object' && record.args !== null
        ? (record.args as Record<string, unknown>)
        : {},
    };
  } catch {
    return { connected: true, handled: false };
  }

  let payload: { id: string; ok: boolean; data?: unknown; error?: { message: string } };
  try {
    const data = await execute(request);
    payload = { id: request.id, ok: true, data };
  } catch (cause) {
    // A tool failure is a normal outcome (cap exceeded, user denied), so it is
    // reported to the agent rather than thrown into the poll loop.
    const message = cause instanceof Error ? cause.message : 'The wallet could not complete that request.';
    payload = { id: request.id, ok: false, error: { message } };
  }

  try {
    await fetchImpl(`${baseUrl(config)}/result`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-veilpay-token': config.token,
      },
      body: JSON.stringify(payload),
      ...(signal !== undefined ? { signal } : {}),
    });
  } catch {
    // The agent will have timed out on its side; nothing more to do.
  }

  return { connected: true, handled: true };
}

export interface AgentBridgeLoop {
  stop(): void;
  /** Current connection state, for `agent.status`. */
  connected(): boolean;
  lastPollAt(): number | null;
}

/**
 * Runs `pollOnce` in a loop until stopped.
 *
 * The loop deliberately lives in the service worker rather than the offscreen
 * document: an in-flight `fetch` keeps the worker alive, so the poll survives,
 * and the vault still enforces its own idle deadline regardless. The cost is
 * that the worker stays warm while the bridge is enabled — the reason this is
 * opt-in rather than always-on.
 */
export function startAgentBridgeLoop(
  config: AgentBridgeConfig,
  execute: (request: BridgeRequest) => Promise<unknown>,
  fetchImpl: typeof fetch = fetch,
): AgentBridgeLoop {
  let running = true;
  let isConnected = false;
  let lastPoll: number | null = null;
  const controller = new AbortController();

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      controller.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    });

  void (async () => {
    while (running) {
      const outcome = await pollOnce(config, execute, fetchImpl, controller.signal);
      if (!running) break;
      isConnected = outcome.connected;
      if (outcome.connected) lastPoll = Date.now();
      // A healthy long-poll returns immediately after 204; only back off when
      // the bridge looks unreachable, so a live bridge adds no latency.
      if (!outcome.connected) await sleep(RETRY_DELAY_MS);
    }
  })();

  return {
    stop() {
      running = false;
      controller.abort();
    },
    connected: () => isConnected,
    lastPollAt: () => lastPoll,
  };
}
