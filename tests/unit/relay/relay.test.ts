import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { startRelay, createRelay } from '../../../relay/server.mjs';
import { verifyPkce } from '../../../relay/oauth.mjs';

/**
 * These drive the real OAuth handshake against a live server on an ephemeral
 * port, because the parts most likely to break only exist over HTTP: discovery
 * metadata, redirect validation, and the PKCE exchange.
 */

const servers: { close: (cb?: () => void) => void }[] = [];

async function bootRelay() {
  // A short long-poll keeps the suite fast; production holds the socket open.
  const { server, relay, port } = await startRelay(
    0,
    createRelay({ longPollMs: 50 }),
  );
  servers.push(server);
  return { base: `http://127.0.0.1:${port}`, relay };
}

afterAll(async () => {
  await Promise.all(
    servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

/** A fixed PKCE pair; the verifier only has to be long enough to be valid. */
function pkce() {
  const verifier = 'a'.repeat(43);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

interface Registered {
  client_id: string;
}

async function registerClient(base: string): Promise<Registered> {
  const response = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: ['https://client.example/callback'] }),
  });
  return (await response.json()) as Registered;
}

function authorizeParams(clientId: string, walletId: string, challenge: string): URLSearchParams {
  return new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'https://client.example/callback',
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    wallet: walletId,
    state: 'xyz',
  });
}

describe('PKCE', () => {
  it('accepts the matching verifier and rejects any other', () => {
    const { verifier, challenge } = pkce();
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce('b'.repeat(43), challenge)).toBe(false);
    expect(verifyPkce(undefined, challenge)).toBe(false);
    expect(verifyPkce(verifier, undefined)).toBe(false);
  });
});

describe('OAuth discovery', () => {
  it('advertises the endpoints an MCP client needs', async () => {
    const { base } = await bootRelay();

    const as = (await (
      await fetch(`${base}/.well-known/oauth-authorization-server`)
    ).json()) as {
      authorization_endpoint: string;
      token_endpoint: string;
      code_challenge_methods_supported: string[];
    };
    expect(as.authorization_endpoint).toContain('/authorize');
    expect(as.token_endpoint).toContain('/token');
    // Without S256 advertised the client cannot satisfy the PKCE requirement.
    expect(as.code_challenge_methods_supported).toContain('S256');

    const pr = (await (
      await fetch(`${base}/.well-known/oauth-protected-resource`)
    ).json()) as { resource: string; authorization_servers: string[] };
    expect(pr.resource).toContain('/mcp');
    expect(pr.authorization_servers).toHaveLength(1);
  });

  it('points an unauthenticated MCP call at the metadata document', async () => {
    const { base, relay } = await bootRelay();
    const { walletId } = relay.registerWallet();

    const response = await fetch(`${base}/mcp/${walletId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect(response.status).toBe(401);
    // This header is what makes the client start OAuth instead of giving up.
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata');
  });
});

describe('OAuth authorization code flow', () => {
  it('issues a token through the full handshake', async () => {
    const { base, relay } = await bootRelay();
    const { walletId } = relay.registerWallet();
    const { verifier, challenge } = pkce();
    const client = await registerClient(base);
    const params = authorizeParams(client.client_id, walletId, challenge);

    // The consent page is what the user sees, so it must be a real page.
    const consent = await fetch(`${base}/authorize?${params}`);
    expect(consent.status).toBe(200);
    expect(consent.headers.get('content-type')).toContain('text/html');
    expect(await consent.text()).toContain('Connect your Veilpay wallet');

    const approval = await fetch(`${base}/authorize/approve?${params}`, {
      method: 'POST',
      redirect: 'manual',
    });
    expect(approval.status).toBe(302);
    const location = new URL(approval.headers.get('location') ?? '');
    expect(location.searchParams.get('state')).toBe('xyz');
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();

    const tokenResponse = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: client.client_id,
        redirect_uri: 'https://client.example/callback',
        code_verifier: verifier,
      }),
    });
    expect(tokenResponse.status).toBe(200);
    const token = (await tokenResponse.json()) as { access_token: string; token_type: string };
    expect(token.token_type).toBe('Bearer');

    // The token must actually work against the MCP endpoint, or the whole
    // handshake was theatre.
    const mcp = await fetch(`${base}/mcp/${walletId}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(mcp.status).toBe(200);
    const listed = (await mcp.json()) as { result: { tools: unknown[] } };
    expect(listed.result.tools).toHaveLength(6);
  });

  it('refuses a redirect_uri that was never registered', async () => {
    const { base, relay } = await bootRelay();
    const { walletId } = relay.registerWallet();
    const { challenge } = pkce();
    const client = await registerClient(base);

    const params = authorizeParams(client.client_id, walletId, challenge);
    // An attacker's URL: honouring it would deliver the code straight to them.
    params.set('redirect_uri', 'https://evil.example/steal');

    const approval = await fetch(`${base}/authorize/approve?${params}`, {
      method: 'POST',
      redirect: 'manual',
    });
    expect(approval.status).toBe(400);
  });

  it('burns an authorization code after one use', async () => {
    const { base, relay } = await bootRelay();
    const { walletId } = relay.registerWallet();
    const { verifier, challenge } = pkce();
    const client = await registerClient(base);
    const params = authorizeParams(client.client_id, walletId, challenge);

    const approval = await fetch(`${base}/authorize/approve?${params}`, {
      method: 'POST',
      redirect: 'manual',
    });
    const code = new URL(approval.headers.get('location') ?? '').searchParams.get('code');

    const exchange = () =>
      fetch(`${base}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          client_id: client.client_id,
          redirect_uri: 'https://client.example/callback',
          code_verifier: verifier,
        }),
      });

    expect((await exchange()).status).toBe(200);
    // A replay must fail, or an intercepted code is a usable credential.
    expect((await exchange()).status).toBe(400);
  });

  it('rejects an exchange with the wrong PKCE verifier', async () => {
    const { base, relay } = await bootRelay();
    const { walletId } = relay.registerWallet();
    const { challenge } = pkce();
    const client = await registerClient(base);
    const params = authorizeParams(client.client_id, walletId, challenge);

    const approval = await fetch(`${base}/authorize/approve?${params}`, {
      method: 'POST',
      redirect: 'manual',
    });
    const code = new URL(approval.headers.get('location') ?? '').searchParams.get('code');

    const response = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: client.client_id,
        redirect_uri: 'https://client.example/callback',
        code_verifier: 'wrong'.padEnd(43, 'z'),
      }),
    });
    expect(response.status).toBe(400);
  });

  it('shows an expired link rather than a consent form for an unknown wallet', async () => {
    const { base } = await bootRelay();
    const response = await fetch(`${base}/authorize?wallet=does-not-exist`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Wallet not connected');
  });

  it('escapes the wallet id so the consent page cannot be injected into', async () => {
    const { base } = await bootRelay();
    const response = await fetch(
      `${base}/authorize?wallet=${encodeURIComponent('<img src=x onerror=alert(1)>')}`,
    );
    const page = await response.text();
    // An unknown wallet renders the error page, which must still be escaped.
    expect(page).not.toContain('<img src=x');
  });
});

describe('relay wallet transport', () => {
  it('refuses a poll with no credentials at all', async () => {
    const { base } = await bootRelay();
    expect((await fetch(`${base}/next`)).status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const { base, relay } = await bootRelay();
    const { walletId } = relay.registerWallet();

    const response = await fetch(`${base}/next`, {
      headers: { 'x-veilpay-wallet': walletId, 'x-veilpay-secret': 'nope' },
    });
    expect(response.status).toBe(401);
  });

  it('answers an authenticated poll with 204 once its long-poll elapses', async () => {
    const { base, relay } = await bootRelay();
    const { walletId, secret } = relay.registerWallet();

    const polled = await fetch(`${base}/next`, {
      headers: { 'x-veilpay-wallet': walletId, 'x-veilpay-secret': secret },
    });
    expect(polled.status).toBe(204);
  });
});
