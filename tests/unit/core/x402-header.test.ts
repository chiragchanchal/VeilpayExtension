import { describe, expect, it } from 'vitest';
import {
  encodeX402Challenge,
  parseX402FromHeaders,
  parseX402Header,
} from '@/core/x402/header';

const CHALLENGE = {
  scheme: 'x402' as const,
  amount: '100000000000000000',
  asset: 'ETH',
  chain: 'evm' as const,
  payTo: '0x1111111111111111111111111111111111111111',
  nonce: 'nonce-123',
  expiry: 1_775_000_000_000,
  resource: '/api/data',
  description: 'Pay for API access',
};

describe('x402 challenge header parsing', () => {
  it('parses a WWW-Authenticate header with the x402 scheme', () => {
    const token = encodeX402Challenge(CHALLENGE);
    const value = `x402 ${token}`;
    expect(parseX402Header(value)).toEqual(CHALLENGE);
  });

  it('parses a bare X-402-Challenge header token', () => {
    const token = encodeX402Challenge(CHALLENGE);
    expect(parseX402Header(token)).toEqual(CHALLENGE);
  });

  it('extracts from Headers with challenge precedence over www-authenticate', () => {
    const headers = new Headers({
      'WWW-Authenticate': 'Basic realm="test"',
      'X-402-Challenge': encodeX402Challenge(CHALLENGE),
    });
    expect(parseX402FromHeaders(headers)).toEqual(CHALLENGE);
  });

  it('falls back to www-authenticate when no challenge header exists', () => {
    const headers = new Headers({
      'WWW-Authenticate': `x402 ${encodeX402Challenge(CHALLENGE)}`,
    });
    expect(parseX402FromHeaders(headers)).toEqual(CHALLENGE);
  });

  it('picks the x402 scheme among multiple comma-separated challenges', () => {
    const headers = new Headers({
      'WWW-Authenticate': `Basic realm="x", x402 ${encodeX402Challenge(CHALLENGE)}`,
    });
    expect(parseX402FromHeaders(headers)).toEqual(CHALLENGE);
  });

  it('returns null for a malformed token', () => {
    expect(parseX402Header('x402 not-base64url-!!{}')).toBeNull();
    expect(parseX402Header('x402 aGVsbG8=')).toBeNull(); // decodes but fails Zod
    expect(parseX402Header('')).toBeNull();
    expect(parseX402Header('  ')).toBeNull();
  });

  it('is case-insensitive about the x402 scheme prefix', () => {
    expect(parseX402Header(`X402 ${encodeX402Challenge(CHALLENGE)}`)).toEqual(CHALLENGE);
  });

  it('round-trips encode then decode through a real Headers object', () => {
    const headers = new Headers();
    headers.set('X-402-Challenge', encodeX402Challenge(CHALLENGE));
    expect(parseX402FromHeaders(headers)).toEqual(CHALLENGE);
  });
});