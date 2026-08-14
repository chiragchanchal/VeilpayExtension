import { describe, expect, it } from 'vitest';
import { splitSecret, combineShares } from '@/core/security/shamir';

/**
 * Deep-compares two Uint8Arrays byte-by-byte.
 * vitest's `toEqual` does not reliably deep-compare Uint8Array instances.
 */
function expectEqualUint8(a: Uint8Array, b: Uint8Array): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i += 1) {
    expect(a[i]).toBe(b[i]);
  }
}

describe('Shamir Secret Sharing (2-of-3)', () => {
  it('splits and reconstructs a short secret', () => {
    const secret = new TextEncoder().encode('test-mnemonic');
    const shares = splitSecret(secret, 3, 2);

    expect(shares).toHaveLength(3);
    for (const s of shares) {
      expect(s).toMatch(/^[1-3]:[0-9a-f]+$/);
    }

    const recovered = combineShares([shares[0]!, shares[1]!], 2);
    expectEqualUint8(recovered, secret);
  });

  it('reconstructs from any combination of 2 shares', () => {
    const secret = new TextEncoder().encode('abandon abandon abandon about');
    const shares = splitSecret(secret, 3, 2);

    const pairs: Array<[number, number]> = [
      [0, 1],
      [0, 2],
      [1, 2],
    ];
    for (const [a, b] of pairs) {
      const recovered = combineShares([shares[a]!, shares[b]!], 2);
      expectEqualUint8(recovered, secret);
    }
  });

  it('works with a 24-word mnemonic (256 bytes)', () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
    const secret = new TextEncoder().encode(mnemonic);
    const shares = splitSecret(secret, 3, 2);

    const recovered = combineShares([shares[0]!, shares[2]!], 2);
    expectEqualUint8(recovered, secret);
  });

  it('rejects fewer shares than the threshold', () => {
    const secret = new TextEncoder().encode('test');
    const shares = splitSecret(secret, 3, 2);

    expect(() => combineShares([shares[0]!], 2)).toThrow(
      'Need at least 2 shares',
    );
  });

  it('rejects an empty secret', () => {
    expect(() => splitSecret(new Uint8Array(0), 3, 2)).toThrow(
      'Secret must not be empty',
    );
  });

  it('rejects threshold < 2', () => {
    expect(() => splitSecret(new Uint8Array([1, 2, 3]), 3, 1)).toThrow(
      'Threshold must be at least 2',
    );
  });

  it('rejects threshold > shares', () => {
    expect(() => splitSecret(new Uint8Array([1, 2, 3]), 2, 3)).toThrow(
      'Threshold cannot exceed the number of shares',
    );
  });

  it('rejects an invalid share format', () => {
    expect(() => combineShares(['invalid', '1:0000'], 2)).toThrow('Invalid share format');
  });

  it('produces different shares each time (randomness)', () => {
    const secret = new TextEncoder().encode('test');
    const a = splitSecret(secret, 3, 2);
    const b = splitSecret(secret, 3, 2);

    expect(a[0]).not.toBe(b[0]);
  });

  it('works with 3-of-3 threshold', () => {
    const secret = new TextEncoder().encode('my-shared-secret');
    const shares = splitSecret(secret, 3, 3);

    expect(() => combineShares([shares[0]!, shares[1]!], 3)).toThrow(
      'Need at least 3 shares',
    );

    const recovered = combineShares([shares[0]!, shares[1]!, shares[2]!], 3);
    expectEqualUint8(recovered, secret);
  });
});