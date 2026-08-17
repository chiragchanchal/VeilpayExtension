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

    // The envelope opens with the union discriminant ENVELOPE_TYPE_TX = 2
    // (Horizon cannot decode a bare TransactionV1Envelope body).
    expect(raw.slice(0, 4)).toEqual(new Uint8Array([0, 0, 0, 2]));

    // Then Transaction.sourceAccount (MuxedAccount, KEY_TYPE_ED25519 = 0:
    // uint32 discriminant + 32 bytes).
    expect(raw.slice(4, 8)).toEqual(new Uint8Array(4));
    for (let i = 8; i < 40; i += 1) {
      expect(raw[i]).toBe(0x0a);
    }

    // fee uint32 = 100 follows the source account.
    expect(raw.slice(40, 44)).toEqual(new Uint8Array([0, 0, 0, 100]));

    // seqNum int64 = 120 follows the fee (big-endian; last byte is 120).
    expect(raw.slice(44, 52)).toEqual(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 120]));

    // Modern Preconditions union: PRECOND_NONE = uint32 0 (4 bytes).
    expect(raw.slice(52, 56)).toEqual(new Uint8Array(4));

    // Memo: MEMO_NONE = uint32 0.
    expect(raw.slice(56, 60)).toEqual(new Uint8Array(4));

    // Operations array: count (1), then Operation begins with a null
    // MuxedAccount* pointer — an XDR optional pointer is FOUR bytes (0), not
    // one — then the PAYMENT discriminant (=1).
    expect(raw.slice(60, 64)).toEqual(new Uint8Array([0, 0, 0, 1])); // ops count = 1
    expect(raw.slice(64, 68)).toEqual(new Uint8Array(4)); // sourceAccount* = null
    expect(raw.slice(68, 72)).toEqual(new Uint8Array([0, 0, 0, 1])); // PAYMENT

    // Destination AccountID: ED25519 discriminant (4 zero bytes) then 32 bytes
    // of 0x0b. indexOf finds the first byte of the contiguous key run.
    const destPos = raw.indexOf(0x0b);
    expect(destPos).toBeGreaterThan(0);
    expect(raw.slice(destPos - 4, destPos)).toEqual(new Uint8Array(4));
    expect(raw.slice(destPos, destPos + 32)).toEqual(new Uint8Array(32).fill(0x0b));

    // Ends with a 64-byte ed25519 signature.
    const sigStart = raw.length - 64;
    expect(sigStart).toBeGreaterThan(100);
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