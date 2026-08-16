/**
 * x402 challenge header parsing.
 *
 * A server signals "402 Payment Required" with an x402 challenge in either the
 * `WWW-Authenticate` response header or a `X-402-Challenge` header. The exact
 * wire form this module accepts:
 *
 *   WWW-Authenticate: x402 <base64url-json>
 *   X-402-Challenge:  <base64url-json>
 *
 * The `<json>` is the compact JSON form of `X402Challenge` (scheme, amount,
 * asset, chain, payTo, nonce, expiry, resource, description) encoded as
 * base64url so it survives header char-set rules safely. The extension parses
 * and validates it with Zod; a malformed challenge is rejected at the boundary
 * and never reaches payment logic or the approval overlay.
 *
 * Spec reference: §4.1 of 4_NATIVE_PAYMENT_LAYER_SPEC.md
 */
import { X402Challenge } from './types';
import type { X402Challenge as X402ChallengeType } from './types';

const HEADER_PREFIX = 'x402 ';

/** base64url-decode a header token into UTF-8 text. */
function decodeToken(token: string): string {
  // base64url uses - and _; restore the standard base64 alphabet for atob.
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Parses a single header value into a validated x402 challenge, or null. */
export function parseX402Header(value: string): X402ChallengeType | null {
  const trimmed = value.trim();
  let token: string;
  if (trimmed.toLowerCase().startsWith(HEADER_PREFIX)) {
    token = trimmed.slice(HEADER_PREFIX.length).trim();
  } else if (trimmed.length > 0) {
    token = trimmed;
  } else {
    return null;
  }

  try {
    const decoded = decodeToken(token);
    const parsed = X402Challenge.safeParse(JSON.parse(decoded) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Extracts a challenge from a `Headers`-like object (Response.headers).
 * Accepts either header; the challenge header takes precedence as it is the
 * extension-specific transport.
 */
export function parseX402FromHeaders(
  headers: Headers | Record<string, string>,
): X402ChallengeType | null {
  const valueOf = (name: string): string | null => {
    // Duck-type: `response.headers` from fetch is a Headers instance, and
    // `instanceof Headers` can fail across realms (jsdom/worker), so prefer
    // the `.get` method when present. Call with the receiver to keep `this`.
    if (typeof headers === 'object' && headers !== null && 'get' in headers) {
      return (headers as { get(name: string): string | null }).get.call(headers, name);
    }
    return (headers as Record<string, string>)[name] ?? null;
  };
  const challenge = valueOf('x-402-challenge');
  if (challenge !== null) {
    const parsed = parseX402Header(challenge);
    if (parsed !== null) return parsed;
  }
  const auth = valueOf('www-authenticate');
  if (auth === null) return null;
  // Multiple challenges can be comma-separated; pick the x402 scheme one.
  for (const part of auth.split(',')) {
    const parsed = parseX402Header(part);
    if (parsed !== null) return parsed;
  }
  return null;
}

/** Encodes a challenge into the base64url token used in headers. */
export function encodeX402Challenge(challenge: X402ChallengeType): string {
  const json = JSON.stringify(challenge);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}