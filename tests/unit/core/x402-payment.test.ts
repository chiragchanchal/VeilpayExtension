import { describe, expect, it } from 'vitest';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToUtf8, utf8ToBytes } from '@noble/hashes/utils';
import { base64 } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { deriveAccount } from '@/core/vault/key-derivation';
import { canonicalizePayload, signPaymentPayload } from '@/core/x402/payment';
import { X402PaymentHeader, type X402Challenge } from '@/core/x402/types';

// A well-known test mnemonic (the Truffle default). Deriving through
// `deriveAccount` exercises the same key-derivation path the wallet uses, so
// the signer address in the header is a real EIP-55 checksummed address.
const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';

const account = deriveAccount(TEST_MNEMONIC, 'evm', 0);

const CHALLENGE: X402Challenge = {
  scheme: 'x402',
  amount: '1000000000000000',
  asset: 'ETH',
  chain: 'evm',
  payTo: '0x1111111111111111111111111111111111111111',
  nonce: 'nonce-1',
  expiry: 1_700_000_060_000,
  resource: '/protected',
  description: 'Access the protected endpoint',
};

/** EIP-191 personal_sign digest (matches `signPersonalMessage`). */
function eip191Digest(message: Uint8Array): Uint8Array {
  const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
  const encoded = new TextEncoder().encode(prefix);
  const out = new Uint8Array(encoded.length + message.length);
  out.set(encoded, 0);
  out.set(message, encoded.length);
  return keccak_256(out);
}

describe('canonicalizePayload', () => {
  it('produces a deterministic key-ordered JSON string', () => {
    const payload = {
      challenge: CHALLENGE,
      signer: account.address,
      signedAt: 1_700_000_000_000,
    };
    const first = canonicalizePayload(payload);
    const second = canonicalizePayload({ ...payload });
    expect(first).toBe(second);
    // Keys are ordered: challenge first, then signer, then signedAt.
    expect(first.startsWith('{"challenge":{')).toBe(true);
    expect(first).not.toContain('\n');
  });
});

describe('signPaymentPayload', () => {
  it('returns a base64 header whose payload matches the challenge', () => {
    const { header } = signPaymentPayload(CHALLENGE, account.privateKey, account.address, 1_700_000_000_000);
    const decoded = JSON.parse(bytesToUtf8(base64.decode(header))) as X402PaymentHeader;

    expect(decoded.version).toBe(1);
    expect(decoded.payload.challenge).toEqual(CHALLENGE);
    expect(decoded.payload.signer).toBe(account.address);
    expect(decoded.payload.signedAt).toBe(1_700_000_000_000);
    expect(decoded.signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
  });

  it('produces a signature that verifies against the payer public key', () => {
    const { header } = signPaymentPayload(CHALLENGE, account.privateKey, account.address, 1_700_000_000_000);
    const decoded = JSON.parse(bytesToUtf8(base64.decode(header))) as X402PaymentHeader;

    const message = utf8ToBytes(canonicalizePayload(decoded.payload));
    const digest = eip191Digest(message);
    const publicKey = secp256k1.getPublicKey(account.privateKey, true);
    // Drop the 0x prefix and the trailing `v` byte: noble's `verify` only
    // parses the bare 64-byte compact form, while the wire signature is the
    // 65-byte Ethereum convention.
    expect(secp256k1.verify(decoded.signature.slice(2, -2), digest, publicKey)).toBe(true);
  });

  it('throws when the signer address does not match the signing key', () => {
    expect(() =>
      signPaymentPayload(
        CHALLENGE,
        account.privateKey,
        '0x2222222222222222222222222222222222222222',
        1_700_000_000_000,
      ),
    ).toThrow(/does not match/i);
  });

  it('rejects a private key that is not 32 bytes', () => {
    const badKey = new Uint8Array(31);
    expect(() => signPaymentPayload(CHALLENGE, badKey, account.address)).toThrow(
      /32 bytes/,
    );
  });
});

describe('header round-trip independence', () => {
  it('round-trips through base64 without losing the payload', () => {
    const { header } = signPaymentPayload(CHALLENGE, account.privateKey, account.address, 1_700_000_000_000);
    const decoded = JSON.parse(bytesToUtf8(base64.decode(header))) as X402PaymentHeader;
    expect(decoded.payload.challenge.nonce).toBe(CHALLENGE.nonce);
    expect(decoded.signature.startsWith('0x')).toBe(true);
  });
});
