/**
 * Veilpay agent relay — the zero-setup transport.
 *
 * Why a relay exists at all: an AI host must be able to *reach* an MCP server,
 * and a browser extension can never be that thing. So this server is public, the
 * extension dials *out* to it, and the user's only action is entering a pairing
 * code once. That is the whole difference from `mcp/`, which the user runs
 * locally.
 *
 * ASSUME THIS PROCESS IS HOSTILE. It sits in the middle of every payment
 * request, so the design treats it as untrusted, and that is what makes it
 * acceptable for anyone to operate:
 *   - it holds no key material and cannot sign
 *   - it cannot authorise a payment: caps and the approval prompt are enforced
 *     inside the extension, so the relay can only ever *ask*
 *   - the worst a compromised relay achieves is spamming requests, which the
 *     extension's prompt limiter and the user's caps bound
 *
 * What it does learn is payment metadata (amount, recipient), because it routes
 * it. That is the real cost, and the reason the local `mcp/` mode still exists.
 *
 * Reuses the local bridge wholesale: one bridge instance per wallet gives each
 * one an isolated queue, token check, long-poll, and staleness rule.
 *
 * Zero dependencies. Run with `node relay/server.mjs`.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import { createBridge, tokenMatches } from '../mcp/bridge.mjs';
import { handleMcpMessage } from '../mcp/veilpay-mcp.mjs';

export const DEFAULT_PORT = 8788;

/** Unclaimed registrations are reclaimed; a stale socket must not linger. */
export const WALLET_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Pairing codes are short and human-typed, so keep the window tight. */
export const CODE_TTL_MS = 15 * 60 * 1000;

/** No I, O, 0, or 1: they are the characters people misread when typing. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A short, unambiguous code the user can read and type. */
export function makePairingCode() {
  const bytes = randomBytes(8);
  let out = '';
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/**
 * Creates relay state. Returns an object so tests can drive it directly, with
 * no socket and no real clock.
 */
export function createRelay({ now = () => Date.now() } = {}) {
  /** walletId → { secret, code, codeExpiresAt, createdAt, bridge } */
  const wallets = new Map();

  function sweep() {
    const cutoff = now() - WALLET_TTL_MS;
    for (const [id, wallet] of wallets) {
      if (wallet.createdAt < cutoff) {
        wallet.bridge.stop();
        wallets.delete(id);
      }
    }
  }

  function register() {
    sweep();
    const walletId = randomUUID();
    const secret = randomBytes(32).toString('hex');
    const code = makePairingCode();
    wallets.set(walletId, {
      secret,
      code,
      codeExpiresAt: now() + CODE_TTL_MS,
      createdAt: now(),
      bridge: createBridge({ token: secret, now }),
    });
    // The secret goes to the extension only; the code is what the user types.
    return { walletId, secret, code, expiresAt: now() + CODE_TTL_MS };
  }

  /** Resolves the wallet a request is acting for, or null. */
  function authenticate(headers) {
    const walletId = headers['x-veilpay-wallet'];
    const secret = headers['x-veilpay-secret'];
    if (typeof walletId !== 'string' || typeof secret !== 'string') return null;
    const wallet = wallets.get(walletId);
    if (wallet === undefined) return null;
    return tokenMatches(wallet.secret, secret) ? wallet : null;
  }

  /**
   * Resolves the wallet an MCP call is acting for.
   *
   * The pairing code doubles as the MCP bearer token: it is what the user pastes
   * into their AI client, so it must live at least as long as that setup takes.
   * A future iteration replaces this with OAuth discovery so nothing is copied
   * by hand at all.
   */
  function authenticateMcp(headers) {
    const raw = headers.authorization ?? headers['x-veilpay-code'];
    if (typeof raw !== 'string' || raw.length === 0) return null;
    const code = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
    for (const wallet of wallets.values()) {
      if (tokenMatches(wallet.code, code)) return wallet;
    }
    return null;
  }

  async function handle(req, res, body) {
    const url = new URL(req.url ?? '/', 'http://relay');

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true, version: '1', wallets: wallets.size });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/register') {
      json(res, 200, register());
      return;
    }

    // The extension's endpoints. Byte-identical protocol to the local bridge,
    // which is why the extension's poller needs no relay-specific code.
    if (url.pathname === '/next' || url.pathname === '/result') {
      const wallet = authenticate(req.headers);
      if (wallet === null) {
        json(res, 401, { ok: false, error: 'Unknown wallet or bad secret.' });
        return;
      }
      if (url.pathname === '/next') {
        const request = await wallet.bridge.nextRequest();
        if (request === null) {
          res.writeHead(204).end();
          return;
        }
        json(res, 200, { id: request.id, tool: request.tool, args: request.args });
        return;
      }
      const settled = wallet.bridge.settle(String(body?.id ?? ''), body ?? {});
      json(res, 200, { ok: true, settled });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/mcp') {
      const wallet = authenticateMcp(req.headers);
      if (wallet === null) {
        json(res, 401, {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32001, message: 'Unauthorized.' },
        });
        return;
      }
      const response = await handleMcpMessage(body, wallet.bridge);
      // A notification carries no id and must not be answered.
      if (response === null) {
        res.writeHead(202).end();
        return;
      }
      json(res, 200, response);
      return;
    }

    json(res, 404, { ok: false, error: 'Unknown endpoint.' });
  }

  function stop() {
    for (const wallet of wallets.values()) wallet.bridge.stop();
    wallets.clear();
  }

  return {
    handle,
    register,
    authenticate,
    authenticateMcp,
    stop,
    walletCount: () => wallets.size,
  };
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function readBody(req, limitBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('body must be JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function createRelayServer(relay = createRelay()) {
  return http.createServer((req, res) => {
    void readBody(req)
      .then((body) => relay.handle(req, res, body))
      .catch(() => json(res, 400, { ok: false, error: 'Malformed request body.' }));
  });
}

export function startRelay(port = DEFAULT_PORT, relay = createRelay()) {
  const server = createRelayServer(relay);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // Loopback is the safe default for local testing. A deployment must bind a
    // public interface behind TLS, because an AI host cannot reach 127.0.0.1.
    const host = process.env.VEILPAY_RELAY_HOST ?? '127.0.0.1';
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve({ server, relay, port: server.address().port });
    });
  });
}

const isMain = process.argv[1] !== undefined && process.argv[1].endsWith('server.mjs');
if (isMain) {
  const port = Number(process.env.PORT ?? process.env.VEILPAY_RELAY_PORT ?? DEFAULT_PORT);
  startRelay(port)
    .then(({ port: actual }) => {
      process.stderr.write(
        `[veilpay-relay] listening on ${process.env.VEILPAY_RELAY_HOST ?? '127.0.0.1'}:${actual}\n`,
      );
      process.stderr.write(
        '[veilpay-relay] deploy behind TLS before use: an AI host needs https.\n',
      );
    })
    .catch((cause) => {
      process.stderr.write(`[veilpay-relay] failed to start: ${String(cause)}\n`);
      process.exit(1);
    });
}
