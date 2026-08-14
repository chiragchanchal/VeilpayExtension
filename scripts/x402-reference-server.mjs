/**
 * Reference x402 402-server for local end-to-end testing.
 *
 * Serves a protected endpoint that answers 402 Payment Required with an x402
 * challenge (in both the `WWW-Authenticate` and `X-402-Challenge` headers).
 * When the caller replays with a valid `X-PAYMENT` header, the server verifies
 * the EIP-191 signature and returns 200.
 *
 * Verification is stateless and self-hostable: it recovers the signer from the
 * header via `ecrecover` and cross-checks against `payload.signer`, with no
 * VeilPay network call — this is the snippet an x402 *provider* would ship
 * (VAP-07). The canonical-payload form here deliberately mirrors the wallet's
 * `src/core/x402/payment.ts`; any drift is caught by the round-trip test in
 * `tests/unit/core/x402-reference-server.test.ts`.
 *
 * Usage:
 *   npm run x402:server        # starts on http://localhost:3402
 *   curl localhost:3402/protected
 *   curl -X POST localhost:3402/protected -H "X-PAYMENT: <header>"
 */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { base64 } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';

export const PORT = 3402;

/** Recipient of test payments. Any EIP-55 address the user controls would do. */
export const PAY_TO = '0x1111111111111111111111111111111111111111';

/** Amount in wei (0.001 ETH) the protected endpoint charges. */
export const AMOUNT_WEI = '1000000000000000';

const issuedChallenges = new Map();
const usedNonces = new Set();

/** Issues a fresh challenge and remembers it so the payload can be cross-checked. */
export function issueChallenge(now = Date.now()) {
  const challenge = {
    scheme: 'x402',
    amount: AMOUNT_WEI,
    asset: 'ETH',
    chain: 'evm',
    payTo: PAY_TO,
    nonce: crypto.randomUUID(),
    expiry: now + 5 * 60_000,
    resource: '/protected',
    description: 'Reference x402 test endpoint',
  };
  issuedChallenges.set(challenge.nonce, challenge);
  if (issuedChallenges.size > 1_000) {
    for (const [nonce, ch] of issuedChallenges) {
      if (ch.expiry < now) issuedChallenges.delete(nonce);
    }
  }
  return challenge;
}

/**
 * Deterministic JSON form of a payment payload — mirrors the wallet's
 * `canonicalizePayload` in src/core/x402/payment.ts.
 */
export function canonicalizePayload(payload) {
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

function eip191Digest(message) {
  const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
  const encoded = utf8ToBytes(prefix);
  const out = new Uint8Array(encoded.length + message.length);
  out.set(encoded, 0);
  out.set(message, encoded.length);
  return keccak_256(out);
}

function bytesToBigInt(bytes) {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function toChecksumAddress(lowercaseHex20) {
  const body = lowercaseHex20.toLowerCase();
  const hash = bytesToHex(keccak_256(utf8ToBytes(body)));
  let out = '0x';
  for (let i = 0; i < body.length; i += 1) {
    const nibble = Number.parseInt(hash.charAt(i), 16);
    out += nibble >= 8 ? body.charAt(i).toUpperCase() : body.charAt(i);
  }
  return out;
}

/** Recovers the EIP-55 address that produced an EIP-191 personal_sign. */
export function recoverAddress(signatureHex, digest) {
  const bytes = hexToBytes(signatureHex.replace(/^0x/, ''));
  if (bytes.length !== 65) throw new Error('Signature must be 65 bytes.');
  const r = bytesToBigInt(bytes.slice(0, 32));
  const s = bytesToBigInt(bytes.slice(32, 64));
  const recovery = bytes[64] - 27;
  // noble-curves only carries the recovery bit when it is attached explicitly;
  // `recoverPublicKey` rejects a signature without it.
  const signature = new secp256k1.Signature(r, s).addRecoveryBit(recovery);
  const point = signature.recoverPublicKey(digest);
  // noble-curves 1.9 names this `toRawBytes` (returns 0x04 || x || y when
  // uncompressed); `toBytes` does not exist on the recovered point.
  const uncompressed = point.toRawBytes(false);
  const hashed = keccak_256(uncompressed.slice(1));
  return toChecksumAddress(bytesToHex(hashed.slice(-20)));
}

/**
 * Verifies an `X-PAYMENT` header against the challenge the server issued.
 *
 * Returns null on success, or a human-readable rejection reason.
 */
export function verifyHeader(header, now = Date.now()) {
  let decoded;
  try {
    decoded = JSON.parse(bytesToUtf8(base64.decode(header)));
  } catch {
    return 'X-PAYMENT header is not valid base64 JSON.';
  }

  const { payload, signature } = decoded ?? {};
  const challenge = payload?.challenge;
  if (!payload || !signature || !challenge || typeof payload.signer !== 'string') {
    return 'Payload is missing required fields.';
  }

  const issued = issuedChallenges.get(challenge.nonce);
  if (issued === undefined) return 'Unknown challenge nonce.';
  if (now >= issued.expiry) return 'Challenge has expired.';
  if (usedNonces.has(challenge.nonce)) return 'Nonce already used.';

  for (const field of ['amount', 'asset', 'chain', 'payTo', 'nonce', 'expiry', 'resource']) {
    if (String(challenge[field]) !== String(issued[field])) {
      return `Payload field "${field}" does not match the issued challenge.`;
    }
  }

  try {
    const digest = eip191Digest(utf8ToBytes(canonicalizePayload(payload)));
    const recovered = recoverAddress(signature, digest);
    if (recovered.toLowerCase() !== payload.signer.toLowerCase()) {
      return 'Signature does not match the declared signer.';
    }
  } catch {
    return 'Signature could not be verified.';
  }

  usedNonces.add(challenge.nonce);
  return null;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'X-402-Challenge, X-PAYMENT',
  'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(res, status, body, extra = {}) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json', ...extra });
  res.end(JSON.stringify(body));
}

function main() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    if (url.pathname === '/challenge' && req.method === 'GET') {
      json(res, 200, { challenge: issueChallenge() });
      return;
    }

    if (url.pathname === '/protected') {
      if (req.method === 'GET') {
        const challenge = issueChallenge();
        json(
          res,
          402,
          { error: 'Payment required.', challenge },
          {
            'WWW-Authenticate': 'x402',
            'X-402-Challenge': base64.encode(utf8ToBytes(JSON.stringify(challenge))),
          },
        );
        return;
      }

      if (req.method === 'POST') {
        const header = req.headers['x-payment'];
        if (typeof header !== 'string' || header.length === 0) {
          json(res, 402, { error: 'Missing X-PAYMENT header.' });
          return;
        }
        const error = verifyHeader(header);
        if (error !== null) {
          json(res, 402, { error });
          return;
        }
        json(res, 200, { ok: true, message: 'Payment verified. Here is the resource.' });
        return;
      }
    }

    json(res, 404, { error: 'Not found.' });
  });

  server.listen(PORT, () => {
    console.log(`[x402] reference server on http://localhost:${PORT}`);
    console.log(`[x402]   GET  /protected  -> 402 + challenge`);
    console.log(`[x402]   GET  /challenge  -> challenge JSON`);
    console.log(`[x402]   POST /protected  -> 200 with X-PAYMENT header`);
  });
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
