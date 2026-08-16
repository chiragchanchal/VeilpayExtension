import { describe, expect, it, vi } from 'vitest';
import { encodeX402Challenge } from '@/core/x402/header';
import { createX402Interceptor, x402ChallengeFromResponse } from '@/core/x402/interceptor';
import type { X402Challenge } from '@/core/x402/types';

const CHALLENGE: X402Challenge = {
  scheme: 'x402',
  amount: '100000000000000000',
  asset: 'ETH',
  chain: 'evm',
  payTo: '0x1111111111111111111111111111111111111111',
  nonce: 'nonce-1',
  expiry: 1_775_000_000_000,
  resource: '/api/data',
  description: 'Pay for API access',
};

function headersWith(): Headers {
  const h = new Headers();
  h.set('X-402-Challenge', encodeX402Challenge(CHALLENGE));
  return h;
}

describe('x402ChallengeFromResponse', () => {
  it('parses a challenge from a 402 response', () => {
    const res = new Response('', { status: 402, headers: headersWith() });
    expect(x402ChallengeFromResponse(res)).toEqual(CHALLENGE);
  });

  it('returns undefined for a non-402 status even with the header', () => {
    const res = new Response('', { status: 200, headers: headersWith() });
    expect(x402ChallengeFromResponse(res)).toBeUndefined();
  });

  it('returns undefined for a 402 without an x402 header', () => {
    const res = new Response('', { status: 402 });
    expect(x402ChallengeFromResponse(res)).toBeUndefined();
  });

  it('returns undefined for a malformed challenge header', () => {
    const h = new Headers();
    h.set('X-402-Challenge', 'not-a-valid-token!!');
    const res = new Response('', { status: 402, headers: h });
    expect(x402ChallengeFromResponse(res)).toBeUndefined();
  });
});

describe('createX402Interceptor', () => {
  it('annotates a 402 response with its parsed challenge', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 402, headers: headersWith() }));
    const intercepted = createX402Interceptor(fetchImpl as typeof fetch);

    const res = (await intercepted('https://example.test/api')) as Response & {
      x402Challenge?: X402Challenge;
    };

    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/api', undefined);
    expect(res.status).toBe(402);
    expect(res.x402Challenge).toEqual(CHALLENGE);
  });

  it('leaves non-402 responses untouched (no x402Challenge)', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>ok</html>', { status: 200 }));
    const intercepted = createX402Interceptor(fetchImpl as typeof fetch);

    const res = (await intercepted('https://example.test/api')) as Response & {
      x402Challenge?: X402Challenge;
    };

    expect(res.status).toBe(200);
    expect(res.x402Challenge).toBeUndefined();
  });

  it('uses global fetch when no implementation is passed', async () => {
    const impl = vi.fn(async () => new Response('', { status: 402, headers: headersWith() }));
    vi.stubGlobal('fetch', impl);
    const intercepted = createX402Interceptor();

    const res = await intercepted('https://example.test/api');

    expect(res.status).toBe(402);
    expect((res as Response & { x402Challenge?: X402Challenge }).x402Challenge).toEqual(CHALLENGE);
    vi.unstubAllGlobals();
  });
});