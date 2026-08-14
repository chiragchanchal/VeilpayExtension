/**
 * Pure wire-format helpers for the dApp demo page.
 *
 * These let the demo build a serialized, unsigned Solana SystemProgram transfer
 * entirely client-side (no @solana/web3.js dependency) so it can exercise the
 * wallet's `solana.signTransaction`. Kept in their own module so they can be
 * unit-tested against the wallet's own parser.
 */
import { base58 } from '@scure/base';

export const base58Encode = base58.encode;
export const base58Decode = base58.decode;

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`Invalid hex: ${hex}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function encodeCompactU16(value: number): Uint8Array {
  if (value < 0 || value > 0x1fffff || !Number.isInteger(value)) {
    throw new RangeError(`Compact-u16 value out of range: ${value}`);
  }
  if (value <= 0x7f) return new Uint8Array([value]);
  if (value <= 0x3fff) return new Uint8Array([(value & 0x7f) | 0x80, value >> 7]);
  return new Uint8Array([(value & 0x7f) | 0x80, ((value >> 7) & 0x7f) | 0x80, value >> 14]);
}

function toLE64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function concatBytes(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/**
 * Builds a serialized, unsigned (zero signature slot) SystemProgram transfer in
 * base58. Mirrors the wire format the wallet's own signer understands:
 *   [sig count=1][64-byte empty signature][message]
 *   message = [header 1,0,0][keys: feePayer, SystemProgram, to][blockhash][instructions]
 */
export function buildDemoSolanaTransfer(
  feePayer: string,
  to: string,
  lamports: bigint,
  blockhashHex: string,
): string {
  const fromBytes = base58.decode(feePayer);
  const toBytes = base58.decode(to);
  if (fromBytes.length !== 32 || toBytes.length !== 32) {
    throw new Error('Solana addresses must be 32 bytes.');
  }
  const blockhash = hexToBytes(blockhashHex);
  if (blockhash.length !== 32) {
    throw new Error('Blockhash must be 32 bytes (hex, no 0x prefix).');
  }

  const systemProgram = new Uint8Array(32);
  const header = new Uint8Array([1, 0, 0]);
  const keys = concatBytes([encodeCompactU16(3), fromBytes, systemProgram, toBytes]);
  const instructionData = concatBytes([new Uint8Array([2]), toLE64(lamports)]);
  const accountIndices = new Uint8Array([0, 2]);
  const instruction = concatBytes([
    new Uint8Array([1]), // programIdIndex = SystemProgram at index 1
    encodeCompactU16(2),
    accountIndices,
    encodeCompactU16(instructionData.length),
    instructionData,
  ]);
  const message = concatBytes([
    header,
    keys,
    blockhash,
    encodeCompactU16(1),
    instruction,
  ]);

  const emptySig = new Uint8Array(64);
  const wire = concatBytes([encodeCompactU16(1), emptySig, message]);
  return base58.encode(wire);
}
