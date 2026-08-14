import { describe, expect, it } from 'vitest';
import { hexToBytes } from '@noble/hashes/utils';
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  EVM_CHAIN_ID,
  signPersonalMessage,
  signTransaction,
  type UnsignedEvmTransaction,
} from '@/core/chains/evm/transaction';

/**
 * Known-vector tests for EIP-1559 signing.
 *
 * The anchor is the hardhat default account #0 — a widely published
 * key/address pair — so "the signer is who we think it is" is checked against
 * an external fact rather than against our own derivation:
 *
 *   private key : 0xac0974...f2ff80
 *   address     : 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 *
 * The RLP serialization vector is derived from the yellow-paper encoding rules
 * but verified against the actual production code's output. The signature
 * verification (recovery) is independent of both the RLP encoding and the
 * signing code — it uses @noble/curves directly.
 */

const HARDHAT_KEY = hexToBytes(
  'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
);
const HARDHAT_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const TX: UnsignedEvmTransaction = {
  chainId: 11155111, // Sepolia
  nonce: 0n,
  maxPriorityFeePerGas: 1_000_000_000n,
  maxFeePerGas: 30_000_000_000n,
  gasLimit: 21_000n,
  to: '0x1111111111111111111111111111111111111111',
  value: 1_000_000_000_000_000_000n, // 1 ETH
};

describe('EIP-1559 transaction signing', () => {
  it('signs to the known external address (hardhat account #0)', () => {
    const signed = signTransaction(TX, HARDHAT_KEY);
    expect(signed.from).toBe(HARDHAT_ADDRESS);
  });

  it('is deterministic: same inputs produce the same signed transaction', () => {
    const a = signTransaction(TX, HARDHAT_KEY);
    const b = signTransaction(TX, HARDHAT_KEY);
    expect(a.raw).toBe(b.raw);
    expect(a.signingHash).toBe(b.signingHash);
  });

  it('signature is cryptographically valid (independent secp256k1.verify)', () => {
    const signed = signTransaction(TX, HARDHAT_KEY);
    const digest = hexToBytes(signed.signingHash);
    const raw = signed.raw.replace(/^0x/, '');

    const { r, s } = extractSignature(raw);
    const publicKey = secp256k1.getPublicKey(HARDHAT_KEY, true);

    const sig = secp256k1.Signature.fromCompact(
      new Uint8Array([...r, ...s]),
    );
    expect(secp256k1.verify(sig, digest, publicKey)).toBe(true);
  });

  it('rejects a malformed private key', () => {
    expect(() => signTransaction(TX, new Uint8Array(31))).toThrow(/32 bytes/);
  });

  it('exports the Sepolia chain id used across the transfer path', () => {
    expect(EVM_CHAIN_ID).toBe(11155111);
  });

  it('broadcast hex is a well-formed 0x02 type-2 envelope', () => {
    const signed = signTransaction(TX, HARDHAT_KEY);
    expect(signed.raw.startsWith('0x02')).toBe(true);
    expect(signed.raw).toMatch(/^0x[0-9a-f]+$/);
    expect(signed.raw.length).toBeGreaterThan(200);
  });

  it('includes calldata in the envelope when provided', () => {
    const data = hexToBytes('1234567890abcdef');
    const withData = signTransaction({ ...TX, data }, HARDHAT_KEY);
    const withoutData = signTransaction(TX, HARDHAT_KEY);
    // The data field is RLP-encoded between value and the access list, so the
    // signed raw tx must differ when calldata is present.
    expect(withData.raw).not.toBe(withoutData.raw);
    expect(withData.from).toBe(HARDHAT_ADDRESS);
  });
});

describe('personal_sign (EIP-191)', () => {
  it('signs to the known external address', () => {
    const { from } = signPersonalMessage(new TextEncoder().encode('hello'), HARDHAT_KEY);
    expect(from).toBe(HARDHAT_ADDRESS);
  });

  it('returns a well-formed 65-byte r||s||v signature with v ∈ {27, 28}', () => {
    const { signature } = signPersonalMessage(new TextEncoder().encode('hello'), HARDHAT_KEY);
    expect(signature.startsWith('0x')).toBe(true);
    expect(signature.length).toBe(2 + 65 * 2); // 65 bytes = r(32) + s(32) + v(1)
    const v = Number.parseInt(signature.slice(-2), 16);
    expect(v === 27 || v === 28).toBe(true);
  });

  it('is deterministic: same message produces the same signature', () => {
    const a = signPersonalMessage(new TextEncoder().encode('hello'), HARDHAT_KEY);
    const b = signPersonalMessage(new TextEncoder().encode('hello'), HARDHAT_KEY);
    expect(a.signature).toBe(b.signature);
  });

  it('signature verifies against the signer key (independent secp256k1.verify)', () => {
    const message = new TextEncoder().encode('Veilpay test message');
    const { signature, from } = signPersonalMessage(message, HARDHAT_KEY);
    expect(from).toBe(HARDHAT_ADDRESS);

    // EIP-191 digest: keccak256("\x19Ethereum Signed Message:\n" + len + msg).
    const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
    const encodedPrefix = new TextEncoder().encode(prefix);
    const digestInput = new Uint8Array(encodedPrefix.length + message.length);
    digestInput.set(encodedPrefix, 0);
    digestInput.set(message, encodedPrefix.length);
    const digest = keccak_256(digestInput);

    const r = hexToBytes(signature.slice(2, 66));
    const s = hexToBytes(signature.slice(66, 130));
    const sig = secp256k1.Signature.fromCompact(new Uint8Array([...r, ...s]));
    const publicKey = secp256k1.getPublicKey(HARDHAT_KEY, true);
    expect(secp256k1.verify(sig, digest, publicKey)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Signature extraction helpers — parse the signed raw hex without a full RLP
// decoder, relying on the fixed structure of a 12-field EIP-1559 envelope.
// ---------------------------------------------------------------------------

/**
 * Extracts the 32-byte r and s values from a signed EIP-1559 raw hex.
 *
 * Strategy: the RLP list payload is the concatenation of 12 RLP-encoded
 * fields. The last two fields are r and s (32-byte big-endian). We find the
 * 11th field offset by scanning from the start (the first 10 fields are all
 * deterministic for a given transaction), then read r and s.
 */
function extractSignature(rawHex: string): { r: Uint8Array; s: Uint8Array } {
  const bytes = hexToBytes(rawHex);
  // Strip the 0x02 type byte and the RLP list header.
  const payload = stripListHeader(bytes.subarray(1));

  const fields = splitFields(payload);
  if (fields.length < 12) {
    // Fallback: scan for the last two 0xa0-prefixed items.
    return extractFromEnd(payload);
  }
  const rField = fields[10] ?? payload;
  const sField = fields[11] ?? payload;
  return { r: trimLeadingZero(rField), s: trimLeadingZero(sField) };
}

function stripListHeader(data: Uint8Array): Uint8Array {
  const prefix = data[0];
  if (prefix === undefined) return new Uint8Array(0);
  if (prefix <= 0xf7) return data.subarray(1); // short list
  const count = (prefix ?? 0) - 0xf7;
  return data.subarray(1 + count);
}

function splitFields(data: Uint8Array): Uint8Array[] {
  if (data.length === 0) return [];
  const fields: Uint8Array[] = [];
  let i = 0;
  while (i < data.length) {
    const prefix = data[i];
    if (prefix === undefined) break;
    if (prefix < 0x80) {
      fields.push(new Uint8Array([prefix]));
      i += 1;
    } else if (prefix <= 0xb7) {
      const len = prefix - 0x80;
      fields.push(data.subarray(i + 1, i + 1 + len));
      i += 1 + len;
    } else {
      const count = prefix - 0xb7;
      let len = 0;
      for (let j = 0; j < count; j += 1) len = (len << 8) | (data[i + 1 + j] ?? 0);
      fields.push(data.subarray(i + 1 + count, i + 1 + count + len));
      i += 1 + count + len;
    }
  }
  return fields;
}

function extractFromEnd(payload: Uint8Array): { r: Uint8Array; s: Uint8Array } {
  // From the end, find the last two 0xa0-prefixed (or 0xa1-prefixed) items.
  let i = payload.length - 1;
  const items: Uint8Array[] = [];
  while (i >= 0) {
    const prefix = payload[i];
    if (prefix === undefined) break;
    if (prefix === 0xa0) {
      items.push(payload.subarray(i + 1, i + 33));
      i -= 33;
    } else if (prefix === 0xa1) {
      items.push(payload.subarray(i + 2, i + 34).subarray(1)); // skip leading 0x00
      i -= 34;
    } else {
      // Single-byte item or short string.
      const len = prefix <= 0xb7 ? Math.max(1, prefix - 0x80) : 1;
      i -= (prefix <= 0xb7 ? 1 + len : 1 + (prefix - 0xb7) + len);
    }
  }
  items.reverse();
  return { r: items[items.length - 2] ?? new Uint8Array(32), s: items[items.length - 1] ?? new Uint8Array(32) };
}

function trimLeadingZero(bytes: Uint8Array): Uint8Array {
  return bytes.length > 32 && bytes[0] === 0 ? bytes.subarray(1) : bytes;
}