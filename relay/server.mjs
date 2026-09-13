/**
 * Veilpay agent relay — remote MCP + OAuth, so connecting an AI client is one
 * click.
 *
 * The problem this solves: an AI host must be able to *reach* an MCP server, and
 * a browser extension can never be that thing. So this server is public, the
 * extension dials *out* to it, and the AI client talks to it over Streamable
 * HTTP.
 *
 * The setup it removes: with the local `mcp/` server the user runs Node and
 * pastes a token. Here the extension registers itself, hands the user a URL, and
 * the MCP client discovers OAuth from the metadata below — so the only thing the
 * user does is approve one page.
 *
 * ASSUME THIS PROCESS IS HOSTILE. It sits in the middle of every payment, so the
 * design treats it as untrusted, which is what makes it acceptable for anyone to
 * operate:
 *   - it holds no key material and cannot sign
 *   - it cannot authorise a payment: caps and the approval prompt are enforced
 *     inside the extension, so the relay can only ever *ask*
 *   - the worst a compromised relay achieves is spamming requests, bounded by the
 *     extension's prompt limiter and the user's own caps
 * It does learn payment metadata (amount, recipient) because it routes it. That
 * is the real cost, and why the local mode still ships.
 *
 * Zero dependencies. `node relay/server.mjs`.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import { createBridge, tokenMatches } from '../mcp/bridge.mjs';
import { handleMcpMessage } from '../mcp/veilpay-mcp.mjs';
import {
  authorizationServerMetadata,
  createOAuth,
  protectedResourceMetadata,
} from './oauth.mjs';

export const DEFAULT_PORT = 8788;

/** A wallet with no activity for this long is reclaimed. */
export const WALLET_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function createRelay({ now = () => Date.now(), baseUrl, longPollMs } = {}) {
  /** walletId → { secret, createdAt, bridge } */
  const wallets = new Map();
  const oauth = createOAuth({ now, wallets });

  function walletFor(id) {
    return typeof id === 'string' ? wallets.get(id) ?? null : null;
  }

  function sweep() {
    const cutoff = now() - WALLET_TTL_MS;
    for (const [id, wallet] of wallets) {
      if (wallet.createdAt < cutoff) {
        wallet.bridge.stop();
        oauth.revokeWallet(id);
        wallets.delete(id);
      }
    }
  }

  /** Registers a wallet for the extension. The secret never leaves that pair. */
  function registerWallet() {
    sweep();
    const walletId = randomUUID();
    const secret = randomBytes(32).toString('hex');
    wallets.set(walletId, {
      secret,
      createdAt: now(),
      bridge: createBridge(
        longPollMs === undefined ? { token: secret, now } : { token: secret, now, longPollMs },
      ),
    });
    return { walletId, secret };
  }

  function authenticateWallet(headers) {
    const walletId = headers['x-veilpay-wallet'];
    const secret = headers['x-veilpay-secret'];
    if (typeof walletId !== 'string' || typeof secret !== 'string') return null;
    const wallet = wallets.get(walletId);
    if (wallet === undefined) return null;
    return tokenMatches(wallet.secret, secret) ? wallet : null;
  }

  function base(request) {
    if (typeof baseUrl === 'string') return baseUrl;
    // Behind a proxy the public origin is what metadata must advertise, so
    // forwarded headers win over the socket's own address.
    const proto = request.headers['x-forwarded-proto'] ?? 'http';
    const host = request.headers['x-forwarded-host'] ?? request.headers.host ?? '127.0.0.1';
    return `${proto}://${host}`;
  }

  async function handle(request, response, body) {
    const url = new URL(request.url ?? '/', 'http://relay');
    const path = url.pathname;
    const origin = base(request);

    if (request.method === 'GET' && path === '/health') {
      json(response, 200, { ok: true, version: '2', wallets: wallets.size });
      return;
    }

    // --- Extension side: registration, then the same long-poll protocol as
    // the local bridge, which is why one poller serves both transports.
    if (request.method === 'POST' && path === '/wallet/register') {
      json(response, 200, registerWallet());
      return;
    }
    if (path === '/next' || path === '/result') {
      const wallet = authenticateWallet(request.headers);
      if (wallet === null) {
        json(response, 401, { ok: false, error: 'Unknown wallet or bad secret.' });
        return;
      }
      if (path === '/next') {
        const next = await wallet.bridge.nextRequest();
        if (next === null) {
          response.writeHead(204).end();
          return;
        }
        json(response, 200, { id: next.id, tool: next.tool, args: next.args });
        return;
      }
      json(response, 200, { ok: true, settled: wallet.bridge.settle(String(body?.id ?? ''), body ?? {}) });
      return;
    }

    // --- OAuth discovery. An MCP client reads these to learn how to authenticate,
    // which is what lets it drive the whole flow without user instruction.
    if (request.method === 'GET' && path === '/.well-known/oauth-authorization-server') {
      json(response, 200, authorizationServerMetadata(origin));
      return;
    }
    if (request.method === 'GET' && path === '/.well-known/oauth-protected-resource') {
      json(response, 200, protectedResourceMetadata(origin));
      return;
    }
    // Some clients probe the resource-scoped path first, per RFC 9728.
    if (
      request.method === 'GET' &&
      path === '/.well-known/oauth-protected-resource/mcp'
    ) {
      json(response, 200, protectedResourceMetadata(origin));
      return;
    }
    if (request.method === 'POST' && path === '/register') {
      json(response, 201, oauth.registerClient(body));
      return;
    }

    // The consent page. Reached in a browser by the MCP client's OAuth flow,
    // and deliberately readable by a human: it says which wallet is being
    // connected and what the agent will be able to do.
    if (request.method === 'GET' && path === '/authorize') {
      const walletId = url.searchParams.get('wallet');
      const known = walletFor(walletId) !== null;
      html(response, 200, consentPage(url, origin, known));
      return;
    }
    if (request.method === 'POST' && path === '/authorize/approve') {
      // The consent form posts as application/x-www-form-urlencoded, so the
      // params ride in the query string rather than a JSON body.
      const params = Object.fromEntries(url.searchParams);
      const result = oauth.authorize(params);
      if (!result.ok) {
        html(response, 400, errorPage(result.error));
        return;
      }
      response.writeHead(302, { location: result.redirectTo }).end();
      return;
    }
    if (request.method === 'POST' && path === '/token') {
      const result = oauth.token(body);
      if (!result.ok) {
        json(response, 400, { error: result.error });
        return;
      }
      json(response, 200, result.body);
      return;
    }

    // --- The MCP endpoint itself. The wallet id is in the path so nothing has to
    // be copied by hand, but the path only *names* the wallet — it must never
    // authorise. Without a valid token the request is refused and pointed at the
    // metadata document, which is what makes the client start OAuth.
    if (path.startsWith('/mcp')) {
      const walletId = path.slice('/mcp'.length).replace(/^\//, '');
      const resolved = oauth.resolveToken(request.headers.authorization);
      const wallet = resolved !== null && resolved === walletId ? walletFor(resolved) : null;
      if (wallet === null) {
        // Advertise where to authenticate; MCP clients use this to start OAuth.
        json(
          response,
          401,
          {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32001, message: 'Unauthorized.' },
          },
          { 'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` },
        );
        return;
      }
      const reply = await handleMcpMessage(body, wallet.bridge);
      // A notification carries no id and must not be answered.
      if (reply === null) {
        response.writeHead(202).end();
        return;
      }
      json(response, 200, reply);
      return;
    }

    json(response, 404, { ok: false, error: 'Unknown endpoint.' });
  }

  function stop() {
    for (const wallet of wallets.values()) wallet.bridge.stop();
    wallets.clear();
  }

  return {
    handle,
    registerWallet,
    authenticateWallet,
    oauth,
    stop,
    walletCount: () => wallets.size,
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...extraHeaders,
  });
  res.end(payload);
}

function html(res, status, markup) {
  const payload = Buffer.from(markup, 'utf8');
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': payload.length,
    'cache-control': 'no-store',
    // The consent page is a payment-adjacent surface: no framing, no inline
    // scripts, and no third-party requests.
    'x-frame-options': 'DENY',
    'content-security-policy':
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
  });
  res.end(payload);
}

function readBody(req, limitBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    // Both encodings arrive here: MCP clients post JSON, the consent form posts
    // urlencoded.
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
      const type = String(req.headers['content-type'] ?? '');
      if (type.includes('application/x-www-form-urlencoded')) {
        resolve(Object.fromEntries(new URLSearchParams(raw)));
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

// ---------------------------------------------------------------------------
// Consent page
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

const PAGE_STYLE = `
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#0A0A0A; color:#FAFAFA;
         font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif; }
  main { width:min(440px,92vw); padding:28px; border:1px solid #2A2A2A;
         border-radius:18px; background:#141414; }
  h1 { margin:0 0 4px; font-size:20px; }
  p { margin:0 0 16px; color:#A1A1AA; }
  ul { margin:0 0 20px; padding-left:20px; color:#A1A1AA; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px;
         color:#FAFAFA; word-break:break-all; }
  button { width:100%; padding:12px; border:0; border-radius:12px; cursor:pointer;
           background:#F59E0B; color:#0A0A0A; font-size:15px; font-weight:600; }
  .muted { margin-top:14px; font-size:12px; color:#71717A; }
`;

function shell(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Veilpay</title><style>${PAGE_STYLE}</style></head><body><main>${body}</main></body></html>`;
}

/**
 * The one page a user ever sees.
 *
 * It states plainly what is being granted and that the extension still enforces
 * caps, because "approve" on a payments surface should never be ambiguous.
 */
function consentPage(url, origin, walletKnown) {
  const params = url.searchParams;
  const walletId = escapeHtml(params.get('wallet'));
  const hidden = [...params.entries()]
    .filter(([key]) => ['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'response_type', 'state', 'wallet'].includes(key))
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`,
    )
    .join('');

  if (!walletKnown) {
    return shell(`<h1>Wallet not connected</h1>
      <p>Open the Veilpay extension, go to Settings &rarr; Agent, and start the
      connection again. This link has expired or belongs to another wallet.</p>`);
  }

  return shell(`<h1>Connect your Veilpay wallet</h1>
    <p>An AI client is requesting access to your wallet.</p>
    <ul>
      <li>It will be able to <strong>ask</strong> for testnet payments.</li>
      <li>Your spending caps and approval prompts still apply — it cannot move
          funds on its own.</li>
      <li>You can disconnect at any time in the extension.</li>
    </ul>
    <p class="muted">Wallet <code>${walletId}</code></p>
    <form method="post" action="/authorize/approve?${escapeHtml(url.searchParams.toString())}">
      ${hidden}
      <button type="submit">Approve and connect</button>
    </form>`);
}

function errorPage(message) {
  return shell(`<h1>Could not connect</h1><p>${escapeHtml(message)}</p>
    <p class="muted">Start the connection again from the extension.</p>`);
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
  const publicUrl = process.env.VEILPAY_RELAY_PUBLIC_URL;
  startRelay(port, createRelay(publicUrl === undefined ? {} : { baseUrl: publicUrl }))
    .then(({ port: actual }) => {
      process.stderr.write(
        `[veilpay-relay] listening on ${process.env.VEILPAY_RELAY_HOST ?? '127.0.0.1'}:${actual}\n`,
      );
      process.stderr.write(
        publicUrl === undefined
          ? '[veilpay-relay] set VEILPAY_RELAY_PUBLIC_URL so OAuth metadata advertises the public origin.\n'
          : `[veilpay-relay] public origin: ${publicUrl}\n`,
      );
    })
    .catch((cause) => {
      process.stderr.write(`[veilpay-relay] failed to start: ${String(cause)}\n`);
      process.exit(1);
    });
}
