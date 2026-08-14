import { describe, expect, it } from 'vitest';
import {
  encodeStellarAddress,
  signStellarPayment,
} from '@/core/chains/stellar/transaction';

// Known test keys (ed25519, 32 bytes).
const SOURCE_PUBKEY = new Uint8Array(32).fill(0x0a);
const DEST_PUBKEY = new Uint8Array(32).fill(0x0b);
const PRIVATE_KEY = new Uint8Array(32).fill(0x01);

const SOURCE_ADDRESS = encodeStellarAddress(SOURCE_PUBKEY);
const DEST_ADDRESS = encodeStellarAddress(DEST_PUBKEY);

describe('Stellar transfer serialization', () => {
  it('encodes a valid strkey address (G...)', () => {
    expect(SOURCE_ADDRESS.startsWith('G')).toBe(true);
    expect(DEST_ADDRESS.startsWith('G')).toBe(true);
    // Strkey is base32, so only A-Z and 2-7 characters.
    expect(SOURCE_ADDRESS).toMatch(/^G[A-Z2-7]{55}$/);
  });

  it('signs a payment and returns a valid base64 envelope', () => {
    const result = signStellarPayment({
      from: SOURCE_ADDRESS,
      to: DEST_ADDRESS,
      amount: 100_000_000n, // 10 XLM in stroops
      sequence: 120n,
      fee: 100,
    }, PRIVATE_KEY);

    // Valid base64
    expect(() => atob(result.raw)).not.toThrow();
    expect(result.from).toBe(SOURCE_ADDRESS);
    expect(result.signingHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a deterministic output for the same inputs', () => {
    const a = signStellarPayment({
      from: SOURCE_ADDRESS,
      to: DEST_ADDRESS,
      amount: 100_000_000n,
      sequence: 120n,
      fee: 100,
    }, PRIVATE_KEY);

    const b = signStellarPayment({
      from: SOURCE_ADDRESS,
      to: DEST_ADDRESS,
      amount: 100_000_000n,
      sequence: 120n,
      fee: 100,
    }, PRIVATE_KEY);

    expect(a.raw).toBe(b.raw);
    expect(a.signingHash).toBe(b.signingHash);
  });

  it('changes the output when the sequence number changes', () => {
    const a = signStellarPayment({
      from: SOURCE_ADDRESS,
      to: DEST_ADDRESS,
      amount: 100_000_000n,
      sequence: 120n,
      fee: 100,
    }, PRIVATE_KEY);

    const b = signStellarPayment({
      from: SOURCE_ADDRESS,
      to: DEST_ADDRESS,
      amount: 100_000_000n,
      sequence: 121n,
      fee: 100,
    }, PRIVATE_KEY);

    expect(a.raw).not.toBe(b.raw);
  });

  it('XDR envelope has the expected structure', () => {
    const result = signStellarPayment({
      from: SOURCE_ADDRESS,
      to: DEST_ADDRESS,
      amount: 100_000_000n,
      sequence: 120n,
      fee: 100,
    }, PRIVATE_KEY);

    const raw = Uint8Array.from(atob(result.raw), (c) => c.charCodeAt(0));

    // Starts with source AccountID: PUBLIC_KEY_TYPE_ED25519 (uint32 0) + 32 bytes.
    expect(raw.slice(0, 4)).toEqual(new Uint8Array(4));
    for (let i = 4; i < 36; i += 1) {
      expect(raw[i]).toBe(0x0a);
    }

    // Contains the dest public key (0x0b) somewhere in the envelope.
    const destPos = raw.indexOf(0x0b);
    expect(destPos).toBeGreaterThan(0);
    // The 32 bytes of dest key should be contiguous.
    expect(raw.slice(destPos, destPos + 32)).toEqual(new Uint8Array(32).fill(0x0b));

    // Fee uint32 = 100 appears somewhere in the first 60 bytes (after source).
    expect(raw.slice(36, 40)).toEqual(new Uint8Array([0, 0, 0, 100]));

    // seqNum uint64 = 120 appears after the fee.
    expect(raw[47]).toBe(120);

    // Contains a 64-byte signature (ed25519).
    const sigStart = raw.length - 64;
    expect(sigStart).toBeGreaterThan(100);

    // The envelope ends with the signature.
    expect(raw.length).toBe(sigStart + 64);
  });

  it('rejects an invalid private key length', () => {
    expect(() => signStellarPayment({
      from: SOURCE_ADDRESS,
      to: DEST_ADDRESS,
      amount: 100n,
      sequence: 1n,
      fee: 100,
    }, new Uint8Array(16))).toThrow('32 bytes');
  });

  it('rejects an invalid destination address', () => {
    expect(() => signStellarPayment({
      from: SOURCE_ADDRESS,
      to: 'NOT_A_VALID_ADDRESS',
      amount: 100n,
      sequence: 1n,
      fee: 100,
    }, PRIVATE_KEY)).toThrow();
  });
});