/**
 * x402 payment payload signing.
 *
 * The `X-PAYMENT` header is a base64-encoded JSON object:
 *   { version: 1, payload, signature }
 *
 * where `signature` is an EIP-191 `personal_sign` over the UTF-8 bytes of the
 * canonical JSON form of `payload`. A provider verifies the header by
 * re-canonicalising `payload` (with `canonicalizePayload`), recovering the
 * signer via `ecrecover`, and cross-checking the recovered address against
 * `payload.signer` — all stateless, with no VeilPay network call (VAP-07).
 */
import { utf8ToBytes } from '@noble/hashes/utils';
import { base64 } from '@scure/base';
import { signPersonalMessage } from '@/core/chains/evm/transaction';
import type { X402Challenge, X402PaymentPayload, X402PaymentHeader } from './types';

/**
 * Deterministic JSON form of a payment payload.
 *
 * Key order is fixed and no whitespace is emitted, so the signing side and the
 * verifying side produce byte-identical strings from the same payload object.
 */
export function canonicalizePayload(payload: X402PaymentPayload): string {
  return JSON.stringify({
    challenge: {
      scheme: payload.challenge.scheme,
      amount: payload.challenge.amount,
      asset: payload.challenge.asset,
      chain: payload.challenge.chain,
      payTo: payload.challenge.payTo,
      nonce: payload.challenge.nonce,
      expiry: payload.challenge.expiry,
      resource: payload.challenge.resource,
      description: payload.challenge.description,
    },
    signer: payload.signer,
    signedAt: payload.signedAt,
  });
}

/**
 * Builds the `X-PAYMENT` header value for a challenge.
 *
 * `signer` is the EIP-55 address the wallet derived for the account signing;
 * the function cross-checks that the signature recovers to that same address.
 * The caller (a background handler inside `vault.withAccount`) guarantees the
 * private key's lifetime is bounded by the call.
 */
export function signPaymentPayload(
  challenge: X402Challenge,
  privateKey: Uint8Array,
  signer: string,
  signedAt: number = Date.now(),
): { header: string } {
  const payload: X402PaymentPayload = { challenge, signer, signedAt };
  const message = utf8ToBytes(canonicalizePayload(payload));
  const { signature, from } = signPersonalMessage(message, privateKey);
  if (from.toLowerCase() !== signer.toLowerCase()) {
    throw new Error('Signer address does not match the derived account.');
  }

  const header: X402PaymentHeader = { version: 1, payload, signature };
  return { header: base64.encode(utf8ToBytes(JSON.stringify(header))) };
}