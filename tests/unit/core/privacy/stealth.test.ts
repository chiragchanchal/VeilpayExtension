import { describe, expect, it } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  deriveStealthAddress,
  generateStealthMeta,
  hashToScalar,
  metaAddressFromHex,
  metaAddressToHex,
  recoverStealthSpendKey,
  stealthAddressToEvm,
} from '@/core/privacy/stealth';

/** Scalar 1, for a deterministic payer ephemeral in tests. */
const EPHEMERAL_ONE = Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0));

describe('stealth addresses', () => {
  it('generates a valid meta-address with matching keypairs', () => {
    const meta = generateStealthMeta();
    expect(meta.spendPriv).toHaveLength(32);
    expect(meta.viewPriv).toHaveLength(32);
    expect(meta.spendPub).toHaveLength(33);
    expect(meta.viewPub).toHaveLength(33);
    expect(secp256k1.getPublicKey(meta.spendPriv, true)).toEqual(meta.spendPub);
    expect(secp256k1.getPublicKey(meta.viewPriv, true)).toEqual(meta.viewPub);
  });

  it('derives a deterministic one-time address for a fixed ephemeral', () => {
    const meta = generateStealthMeta();
    const a = deriveStealthAddress(meta.spendPub, meta.viewPub, EPHEMERAL_ONE);
    const b = deriveStealthAddress(meta.spendPub, meta.viewPub, EPHEMERAL_ONE);
    expect(a.address).toEqual(b.address);
  });

  it('produces a distinct address per payment (VAP-09)', () => {
    const meta = generateStealthMeta();
    const first = deriveStealthAddress(meta.spendPub, meta.viewPub);
    const second = deriveStealthAddress(meta.spendPub, meta.viewPub);
    expect(first.address).not.toEqual(second.address);
    expect(first.ephemeralPub).not.toEqual(second.ephemeralPub);
  });

  it('receiver recovers the payer one-time address from the announcement', () => {
    const meta = generateStealthMeta();
    const payment = deriveStealthAddress(meta.spendPub, meta.viewPub, EPHEMERAL_ONE);

    const recoveredKey = recoverStealthSpendKey(
      payment.ephemeralPub,
      meta.viewPriv,
      meta.spendPriv,
    );
    // The recovered spend key's public point must equal the payer's address.
    expect(secp256k1.getPublicKey(recoveredKey, false)).toEqual(payment.address);
  });

  it('maps a stealth address to a valid EVM address', () => {
    const meta = generateStealthMeta();
    const payment = deriveStealthAddress(meta.spendPub, meta.viewPub);
    const evm = stealthAddressToEvm(payment.address);
    expect(evm).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it('round-trips a serialized meta-address', () => {
    const meta = generateStealthMeta();
    const parsed = metaAddressFromHex(metaAddressToHex(meta));
    expect(parsed.spendPub).toEqual(meta.spendPub);
    expect(parsed.viewPub).toEqual(meta.viewPub);
  });

  it('hashToScalar is deterministic and nonzero', () => {
    const input = new Uint8Array([1, 2, 3]);
    expect(hashToScalar(input)).toBe(hashToScalar(input));
    expect(hashToScalar(input)).toBeGreaterThan(0n);
    expect(hashToScalar(input)).toBeLessThan(secp256k1.CURVE.n);
  });
});
