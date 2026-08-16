/**
 * x402 fetch interceptor (roadmap 3.7).
 *
 * Wraps `fetch` so a caller can detect a 402 Payment Required response that
 * carries an x402 challenge and pay it via the wallet. The wrapper is pure and
 * dependency-light: it only inspects response status + headers. Payment
 * signing, approval overlays, and request replay happen upstream in the
 * background/x402 modules; this module owns detection only.
 *
 * Usage:
 *   const intercepted = createX402Interceptor(fetch);
 *   let res = await intercepted(url);
 *   if (res.status === 402) {
 *     const challenge = res.x402Challenge; // typed challenge or undefined
 *     if (challenge) {
 *       const paid = await payChallenge(challenge); // extension orchestration
 *       res = await intercepted(url, { headers: { 'X-PAYMENT': paid } });
 *     }
 *   }
 */

import { parseX402FromHeaders } from './header';
import type { X402Challenge } from './types';

export interface X402FetchResponse extends Response {
  /** Parsed x402 challenge, present only on a 402 carrying a valid header. */
  x402Challenge: X402Challenge | undefined;
}

export type FetchLike = typeof fetch;

/**
 * Extracts a validated x402 challenge from a response, or undefined.
 * Returns undefined for non-402 responses and for malformed headers.
 */
export function x402ChallengeFromResponse(response: Response): X402Challenge | undefined {
  if (response.status !== 402) return undefined;
  return parseX402FromHeaders(response.headers) ?? undefined;
}

/**
 * Wraps a fetch-like function; every resolved response is annotated with a
 * parsed `x402Challenge` (for 402 responses that carry one). Any other
 * response is passed through unchanged.
 */
export function createX402Interceptor(fetchImpl: FetchLike = fetch): FetchLike {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await fetchImpl(input, init);
    const annotated = response as X402FetchResponse;
    annotated.x402Challenge = x402ChallengeFromResponse(response);
    return annotated;
  };
}