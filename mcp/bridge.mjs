/**
 * Localhost bridge between the MCP server and the wallet extension.
 *
 * Why this exists: a browser extension cannot be reached inbound, so the
 * extension initiates every connection and this server holds requests until it
 * does. The transport is a loopback socket, so the OS keeps it off the network.
 *
 * Security properties, all load-bearing:
 *   - binds 127.0.0.1 only, never 0.0.0.0
 *   - every non-health endpoint requires a shared token, compared in constant
 *     time, so a local process cannot drive the wallet without pairing
 *   - queued work older than STALE_REQUEST_MS is dropped rather than executed
 *     later, so a delayed poll cannot trigger a stale payment
 *
 * No dependencies: node:http plus the global fetch on the extension side.
 */

import { randomUUID, timingSafeEqual } from 'node:crypto';
import http from 'node:http';

/** How long a /next long-poll is held open before answering 204. */
export const LONG_POLL_MS = 25_000;

/** A payment can wait on a human approving it in the extension. */
export const SEND_TIMEOUT_MS = 180_000;

/** Everything else is a fast local read. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Requests nobody collected within this window are discarded. */
export const STALE_REQUEST_MS = 5 * 60_000;

/** The extension is considered connected if it polled within this window. */
export const CONNECTED_WINDOW_MS = 60_000;

/**
 * Constant-time token comparison.
 *
 * `timingSafeEqual` throws on a length mismatch, so lengths are compared first —
 * which leaks only the length, and the token is a fixed-size hex string anyway.
 */
export function tokenMatches(expected, provided) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function readBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

/**
 * Creates the bridge. Returns an object rather than starting a server, so tests
 * can drive the queue and the HTTP handler without binding a port.
 */
export function createBridge({
  token,
  longPollMs = LONG_POLL_MS,
  sendTimeoutMs = SEND_TIMEOUT_MS,
  defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
  staleRequestMs = STALE_REQUEST_MS,
  now = () => Date.now(),
} = {}) {
  /** Requests waiting to be collected by the extension, oldest first. */
  const queue = [];
  /** Long-poll continuations, each called with the next request or null. */
  const waiters = new Set();
  /** In-flight tool calls, keyed by request id. */
  const pending = new Map();
  let lastPollAt = null;
  /** The listening socket, owned by the bridge so `stop()` needs no argument. */
  let server = null;

  function dropStale() {
    const cutoff = now() - staleRequestMs;
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i].enqueuedAt < cutoff) queue.splice(i, 1);
    }
  }

  /** Hands the oldest request to a waiter, or returns null when none is queued. */
  function take() {
    dropStale();
    return queue.shift() ?? null;
  }

  /** Resolves an open long-poll with whatever is available now. */
  function wakeWaiters() {
    const request = take();
    if (request === null) return;
    const waiter = waiters.values().next().value;
    if (waiter === undefined) {
      // Nobody is polling; put it back so a later poll can collect it.
      queue.unshift(request);
      return;
    }
    waiters.delete(waiter);
    waiter(request);
  }

  function enqueue(tool, args) {
    const request = { id: randomUUID(), tool, args, enqueuedAt: now() };
    queue.push(request);
    wakeWaiters();
    return request;
  }

  /**
   * Registers a tool call and waits for the extension to settle it. Rejects on
   * timeout so a disconnected extension surfaces as a clear error instead of an
   * agent hanging forever.
   */
  function dispatch(tool, args) {
    const request = enqueue(tool, args);
    const timeoutMs = tool === 'send' ? sendTimeoutMs : defaultTimeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(request.id);
        reject(new Error(`Veilpay did not respond to "${tool}" in time.`));
      }, timeoutMs);
      pending.set(request.id, { resolve, reject, timer, tool });
    });
  }

  /** Called by POST /result. Returns whether a waiter was settled. */
  function settle(id, payload) {
    const waiter = pending.get(id);
    if (waiter === undefined) return false;
    clearTimeout(waiter.timer);
    pending.delete(id);
    if (payload.ok === true) {
      waiter.resolve(payload.data);
    } else {
      const message =
        payload.error !== null && typeof payload.error === 'object'
          ? payload.error.message
          : payload.error;
      waiter.reject(new Error(String(message ?? 'The wallet rejected the request.')));
    }
    return true;
  }

  /** A /next long-poll. Resolves with a request, or null after the timeout. */
  function nextRequest() {
    lastPollAt = now();
    const immediate = take();
    if (immediate !== null) return Promise.resolve(immediate);
    return new Promise((resolve) => {
      const waiter = (request) => {
        clearTimeout(timer);
        resolve(request);
      };
      const timer = setTimeout(() => {
        waiters.delete(waiter);
        resolve(null);
      }, longPollMs);
      waiters.add(waiter);
    });
  }

  function extensionConnected() {
    return lastPollAt !== null && now() - lastPollAt < CONNECTED_WINDOW_MS;
  }

  /** Pure request handler, so it can be tested without a socket. */
  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    // Unauthenticated: lets the user and the MCP client check the bridge is up
    // without holding the pairing token.
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        version: '1',
        extensionConnected: extensionConnected(),
        queued: queue.length,
      });
      return;
    }

    if (!tokenMatches(token, req.headers['x-veilpay-token'])) {
      sendJson(res, 401, { ok: false, error: 'Invalid or missing bridge token.' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/next') {
      const request = await nextRequest();
      if (request === null) {
        res.writeHead(204).end();
        return;
      }
      sendJson(res, 200, { id: request.id, tool: request.tool, args: request.args });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/result') {
      let parsed;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { ok: false, error: 'Body must be JSON.' });
        return;
      }
      if (typeof parsed !== 'object' || parsed === null || typeof parsed.id !== 'string') {
        sendJson(res, 400, { ok: false, error: 'Body must include a string "id".' });
        return;
      }
      const settled = settle(parsed.id, parsed);
      sendJson(res, 200, { ok: true, settled });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Unknown endpoint.' });
  }

  function start(port = 8765) {
    const created = http.createServer((req, res) => {
      handle(req, res).catch(() => sendJson(res, 500, { ok: false, error: 'Bridge error.' }));
    });
    server = created;
    return new Promise((resolve, reject) => {
      created.once('error', reject);
      // `0` asks the OS for a free port, which is what tests use.
      created.listen(port, '127.0.0.1', () => {
        created.removeListener('error', reject);
        resolve(created.address().port);
      });
    });
  }

  /** Closes the listening socket and rejects any in-flight tool call. */
  function stop() {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('The bridge shut down.'));
    }
    pending.clear();
    for (const wake of waiters) wake(null);
    waiters.clear();
    return new Promise((resolve) => {
      const open = server;
      server = null;
      if (open === null) {
        resolve();
        return;
      }
      open.close(() => resolve());
    });
  }

  return {
    handle,
    start,
    stop,
    dispatch,
    settle,
    enqueue,
    nextRequest,
    extensionConnected,
    pendingCount: () => pending.size,
    queuedCount: () => queue.length,
  };
}
