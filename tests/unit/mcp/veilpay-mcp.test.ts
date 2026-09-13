import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridge, tokenMatches } from '../../../mcp/bridge.mjs';
import {
  TOOLS,
  handleMcpMessage,
  loadConfig,
  validateArgs,
} from '../../../mcp/veilpay-mcp.mjs';

/** Shape of an MCP JSON-RPC response, for assertions. */
interface McpResponse {
  jsonrpc: string;
  id: number;
  result?: {
    protocolVersion?: string;
    serverInfo?: { name: string };
    tools?: { name: string; inputSchema: { type?: string } }[];
    content?: { type: string; text: string }[];
    isError?: boolean;
  };
  error?: { code: number; message: string };
}

const tempDirs: string[] = [];

function tempConfigPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'veilpay-mcp-'));
  tempDirs.push(dir);
  return join(dir, 'config.json');
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('token comparison', () => {
  it('accepts the matching token and rejects everything else', () => {
    expect(tokenMatches('abc123', 'abc123')).toBe(true);
    expect(tokenMatches('abc123', 'abc124')).toBe(false);
    // Length mismatch must not throw (timingSafeEqual throws on unequal lengths).
    expect(tokenMatches('abc123', 'abc12')).toBe(false);
    expect(tokenMatches('abc123', undefined)).toBe(false);
    expect(tokenMatches('abc123', 42)).toBe(false);
  });
});

describe('pairing config', () => {
  it('mints a token once and reuses it', () => {
    const path = tempConfigPath();

    const first = loadConfig(path);
    expect(first.created).toBe(true);
    expect(first.token.length).toBeGreaterThan(32);

    const second = loadConfig(path);
    expect(second.created).toBe(false);
    expect(second.token).toBe(first.token);

    // The token is what a local process would need, so it must persist to disk.
    const stored = JSON.parse(readFileSync(path, 'utf8')) as { token: string };
    expect(stored.token).toBe(first.token);
  });

  it('re-mints when the stored file is corrupt', () => {
    const path = tempConfigPath();
    const first = loadConfig(path);
    // Simulate a truncated write, which would otherwise wedge pairing forever.
    writeFileSync(path, '{ not json');

    const second = loadConfig(path);
    expect(second.created).toBe(true);
    expect(second.token).not.toBe(first.token);
  });
});

describe('tool argument validation', () => {
  it('accepts well-formed decimal amounts', () => {
    for (const amount of ['1', '0.05', '1000', '0.000000001']) {
      const result = validateArgs('send_payment', { chain: 'solana', to: 'addr', amount });
      expect(result.ok, `amount ${amount} should be accepted`).toBe(true);
    }
  });

  it('rejects malformed or non-positive amounts', () => {
    for (const amount of ['', 'abc', '-1', '0', '0.0', '1.2.3', '1e3', '  ']) {
      const result = validateArgs('send_payment', { chain: 'solana', to: 'addr', amount });
      expect(result.ok, `amount ${JSON.stringify(amount)} should be rejected`).toBe(false);
    }
  });

  it('rejects an unknown chain and a missing recipient', () => {
    expect(validateArgs('send_payment', { chain: 'bitcoin', to: 'a', amount: '1' }).ok).toBe(false);
    expect(validateArgs('send_payment', { to: 'a', amount: '1' }).ok).toBe(false);
    expect(validateArgs('send_payment', { chain: 'evm', to: '  ', amount: '1' }).ok).toBe(false);
  });

  it('attaches a fresh idempotency key to every send', () => {
    const a = validateArgs('send_payment', { chain: 'evm', to: 'x', amount: '1' });
    const b = validateArgs('send_payment', { chain: 'evm', to: 'x', amount: '1' });
    if (!a.ok || !b.ok) throw new Error('expected both to validate');

    // Two identical requests must not collide, or a legitimate second payment
    // would be swallowed as a retry of the first.
    expect(typeof a.value.idempotencyKey).toBe('string');
    expect(a.value.idempotencyKey).not.toBe(b.value.idempotencyKey);
  });
});

describe('tool catalogue', () => {
  it('exposes every tool with a usable schema', () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(names).toEqual([
      'wallet_status',
      'list_accounts',
      'get_balance',
      'send_payment',
      'list_grants',
      'revoke_grant',
    ]);
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('describes send_payment in terms an agent can act on', () => {
    const send = TOOLS.find((tool) => tool.name === 'send_payment');
    expect(send?.description).toMatch(/decimal/i);
    expect(send?.description).toMatch(/approve/i);
  });
});

/** A bridge stub that records dispatches and returns canned data. */
function stubBridge(data: unknown = { ok: true }) {
  const calls: { tool: string; args: unknown }[] = [];
  const bridge = {
    dispatch: vi.fn(async (tool: string, args: unknown) => {
      calls.push({ tool, args });
      return data;
    }),
  };
  return { bridge: bridge as never, calls };
}

describe('MCP message handling', () => {
  it('answers initialize with the protocol version and server name', async () => {
    const { bridge } = stubBridge();
    const response = (await handleMcpMessage({ id: 1, method: 'initialize' }, bridge)) as McpResponse;

    expect(response.id).toBe(1);
    expect(response.result?.protocolVersion).toBe('2024-11-05');
    expect(response.result?.serverInfo?.name).toBe('veilpay');
  });

  it('lists all six tools', async () => {
    const { bridge } = stubBridge();
    const response = (await handleMcpMessage({ id: 2, method: 'tools/list' }, bridge)) as McpResponse;
    expect(response.result?.tools).toHaveLength(6);
  });

  it('never replies to a notification', async () => {
    const { bridge } = stubBridge();
    // Notifications carry no id; answering one corrupts the MCP stream.
    expect(await handleMcpMessage({ method: 'notifications/initialized' }, bridge)).toBeNull();
  });

  it('returns a JSON-RPC error for an unknown method', async () => {
    const { bridge } = stubBridge();
    const response = (await handleMcpMessage({ id: 3, method: 'nope' }, bridge)) as McpResponse;
    expect(response.error?.code).toBe(-32601);
  });

  it('reports an unknown tool as a tool error, not a crash', async () => {
    const { bridge } = stubBridge();
    const response = (await handleMcpMessage(
      { id: 4, method: 'tools/call', params: { name: 'send_all_funds' } },
      bridge,
    )) as McpResponse;
    expect(response.result?.isError).toBe(true);
  });

  it('rejects invalid arguments before reaching the wallet', async () => {
    const { bridge, calls } = stubBridge();
    const response = (await handleMcpMessage(
      {
        id: 5,
        method: 'tools/call',
        params: { name: 'send_payment', arguments: { chain: 'evm', to: 'x', amount: 'abc' } },
      },
      bridge,
    )) as McpResponse;

    expect(response.result?.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('maps send_payment onto the send bridge tool and returns the result', async () => {
    const { bridge, calls } = stubBridge({ hash: '0xdead' });
    const response = (await handleMcpMessage(
      {
        id: 6,
        method: 'tools/call',
        params: { name: 'send_payment', arguments: { chain: 'solana', to: 'addr', amount: '1' } },
      },
      bridge,
    )) as McpResponse;

    expect(calls[0]?.tool).toBe('send');
    expect(response.result?.isError).toBeUndefined();
    expect(response.result?.content?.[0]?.text).toContain('0xdead');
  });

  it('turns a failed dispatch into a tool error that mentions the extension', async () => {
    const bridge = {
      dispatch: vi.fn(async () => {
        throw new Error('not connected');
      }),
    } as never;
    const response = (await handleMcpMessage(
      { id: 7, method: 'tools/call', params: { name: 'wallet_status' } },
      bridge,
    )) as McpResponse;

    expect(response.result?.isError).toBe(true);
    expect(response.result?.content?.[0]?.text).toMatch(/extension/i);
  });
});

describe('bridge queue', () => {
  it('hands a queued request to the next poller', async () => {
    const bridge = createBridge({ token: 't' });
    bridge.enqueue('status', {});
    const request = await bridge.nextRequest();

    expect(request?.tool).toBe('status');
    expect(typeof request?.id).toBe('string');
  });

  it('resumes a waiting poller as soon as work arrives', async () => {
    const bridge = createBridge({ token: 't', longPollMs: 5_000 });
    const pendingPoll = bridge.nextRequest();
    // Nothing is queued yet, so the poll must still be open.
    expect(bridge.queuedCount()).toBe(0);
    bridge.enqueue('accounts', {});
    const request = await pendingPoll;
    expect(request?.tool).toBe('accounts');
  });

  it('resolves a poll with null after the timeout', async () => {
    const bridge = createBridge({ token: 't', longPollMs: 10 });
    expect(await bridge.nextRequest()).toBeNull();
  });

  it('drops requests nobody collected in time', async () => {
    let clock = 1_000;
    const bridge = createBridge({
      token: 't',
      staleRequestMs: 100,
      // Bounded so the assertion below is "the poll found nothing", not a
      // 25-second wait on the production long-poll.
      longPollMs: 20,
      now: () => clock,
    });
    bridge.enqueue('status', {});
    // Advance past the staleness window: a delayed poll must not execute it.
    clock += 10_000;
    expect(await bridge.nextRequest()).toBeNull();
  });

  it('settles a dispatch with data', async () => {
    const bridge = createBridge({ token: 't' });
    const dispatched = bridge.dispatch('status', {});
    const request = await bridge.nextRequest();
    if (request === null) throw new Error('expected a queued request');
    bridge.settle(request.id, { ok: true, data: { unlocked: true } });
    await expect(dispatched).resolves.toEqual({ unlocked: true });
  });

  it('rejects a dispatch when the wallet reports failure', async () => {
    const bridge = createBridge({ token: 't' });
    const dispatched = bridge.dispatch('send', {});
    const request = await bridge.nextRequest();
    if (request === null) throw new Error('expected a queued request');
    bridge.settle(request.id, { ok: false, error: { message: 'Insufficient funds.' } });
    await expect(dispatched).rejects.toThrow('Insufficient funds.');
  });

  it('rejects an in-flight call when the bridge stops', async () => {
    const bridge = createBridge({ token: 't' });
    const dispatched = bridge.dispatch('status', {});
    await bridge.nextRequest();
    await bridge.stop();
    await expect(dispatched).rejects.toThrow(/shut down/i);
  });

  it('ignores a result for an unknown id', () => {
    const bridge = createBridge({ token: 't' });
    expect(bridge.settle('nope', { ok: true, data: null })).toBe(false);
  });
});

describe('bridge HTTP surface', () => {
  it('serves health without a token and 401s everything else', async () => {
    const bridge = createBridge({ token: 'secret', longPollMs: 20 });
    const port = await bridge.start(0);
    try {
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status).toBe(200);
      const body = (await health.json()) as { ok: boolean; extensionConnected: boolean };
      expect(body.ok).toBe(true);
      expect(body.extensionConnected).toBe(false);

      // Without the token the bridge must refuse: this is what stops another
      // local process from driving the wallet.
      const denied = await fetch(`http://127.0.0.1:${port}/next`);
      expect(denied.status).toBe(401);

      const wrongToken = await fetch(`http://127.0.0.1:${port}/next`, {
        headers: { 'x-veilpay-token': 'wrong' },
      });
      expect(wrongToken.status).toBe(401);
    } finally {
      await bridge.stop();
    }
  });

  it('delivers a queued request to an authenticated poll', async () => {
    const bridge = createBridge({ token: 'secret', longPollMs: 200 });
    const port = await bridge.start(0);
    try {
      bridge.enqueue('status', { hello: true });
      const response = await fetch(`http://127.0.0.1:${port}/next`, {
        headers: { 'x-veilpay-token': 'secret' },
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { tool: string; args: { hello: boolean } };
      expect(body.tool).toBe('status');
      expect(body.args.hello).toBe(true);
    } finally {
      await bridge.stop();
    }
  });

  it('rejects a malformed result body with 400', async () => {
    const bridge = createBridge({ token: 'secret' });
    const port = await bridge.start(0);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/result`, {
        method: 'POST',
        headers: { 'x-veilpay-token': 'secret' },
        body: 'not json',
      });
      expect(response.status).toBe(400);
    } finally {
      await bridge.stop();
    }
  });
});
