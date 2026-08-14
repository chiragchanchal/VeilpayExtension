import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from '@/core/security';

describe('PIN hashing (scrypt)', () => {
  it('hashes a PIN and verifies it correctly', async () => {
    const { hash, salt } = await hashPin('1234');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);

    const valid = await verifyPin('1234', hash, salt);
    expect(valid).toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    const { hash, salt } = await hashPin('1234');
    const invalid = await verifyPin('wrong', hash, salt);
    expect(invalid).toBe(false);
  });

  it('produces different hashes for different salts', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a.hash).not.toBe(b.hash);
  });

  it('produces the same hash for the same salt and PIN', async () => {
    const first = await hashPin('1234');
    const second = await hashPin('1234', first.salt);
    expect(second.hash).toBe(first.hash);
  });

  it('handles a longer numeric PIN', async () => {
    const { hash, salt } = await hashPin('8675309');
    const valid = await verifyPin('8675309', hash, salt);
    expect(valid).toBe(true);
  });
});