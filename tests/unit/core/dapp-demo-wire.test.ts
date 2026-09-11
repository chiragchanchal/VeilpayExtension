import { describe, expect, it } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import {
  base58Decode,
  base58Encode,
  buildDemoSolanaTransfer,
  hexToBytes,
} from '@/dapp-demo/wire';
import { parseSolanaTransaction, signSolanaTransaction } from '@/core/chains/solana/transaction';

const PRIVATE_KEY = new Uint8Array(32).fill(0x07);
const FEE_PAYER = base58.encode(ed25519.getPublicKey(PRIVATE_KEY));
const TO = '11111111111111111111111111111111'; // SystemProgram id, valid 32-byte base58
const BLOCKHASH = '0000000000000000000000000000000000000000000000000000000000000000';

describe('dapp-demo wire helpers', () => {
  it('round-trips base58 encode/decode', () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128, 7]);
    expect(base58Decode(base58Encode(bytes))).toEqual(bytes);
  });

  it('decodes hex to bytes and strips an optional 0x prefix', () => {
    expect(hexToBytes('0x00ff10')).toEqual(new Uint8Array([0, 255, 16]));
    expect(hexToBytes('00ff10')).toEqual(new Uint8Array([0, 255, 16]));
  });

  it('rejects malformed hex', () => {
    expect(() => hexToBytes('xyz')).toThrow(/Invalid hex/);
    expect(() => hexToBytes('0')).toThrow(/Invalid hex/);
  });
});

describe('dapp-demo Solana transfer ↔ wallet signer integration', () => {
  it('builds a transaction the wallet can parse and sign', () => {
    const serialized = buildDemoSolanaTransfer(FEE_PAYER, TO, 1_000_000n, BLOCKHASH);

    // The wallet's own parser must accept what the demo page produced.
    const parsed = parseSolanaTransaction(serialized);
    expect(parsed.feePayerIndex).toBe(0);
    expect(parsed.accountKeys[0]).toBe(FEE_PAYER);
    expect(parsed.accountKeys[1]).toBe(TO);
    expect(parsed.accountKeys[2]).toBe(base58.encode(new Uint8Array(32))); // SystemProgram

    // And the wallet must be able to sign it as the fee payer. The network
    // verifies a plain Ed25519 signature over the serialized message.
    const signed = signSolanaTransaction(serialized, PRIVATE_KEY, FEE_PAYER);
    const sigBytes = base58.decode(signed.signature);
    expect(ed25519.verify(sigBytes, parsed.message, ed25519.getPublicKey(PRIVATE_KEY))).toBe(true);
  });

  it('the demo transaction starts unsigned (zero signature slot)', () => {
    const serialized = buildDemoSolanaTransfer(FEE_PAYER, TO, 1_000_000n, BLOCKHASH);
    const bytes = base58Decode(serialized);
    // Wire format: [compact-u16 count=1][64-byte signature][message]
    expect(bytes[0]).toBe(1);
    const sigSlot = bytes.subarray(1, 65);
    expect(Array.from(sigSlot).every((b) => b === 0)).toBe(true);
  });
});
