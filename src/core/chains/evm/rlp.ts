/**
 * Minimal recursive-length-prefix (RLP) encoder.
 *
 * RLP is the wire format Ethereum uses to serialize a transaction before it is
 * hashed and signed. We only ever *encode* transactions here — decoding a raw
 * transaction from the network is not part of the signing path — so this module
 * is deliberately encode-only and tiny.
 *
 * The spec (yellow paper, appendix B) is a single rule over strings and lists:
 *   - a single byte in [0x00, 0x7f] encodes as itself;
 *   - a short string (≤ 55 bytes) is 0x80 + len followed by the bytes;
 *   - a long string (> 55 bytes) is 0xb7 + byteLen(len) followed by len then bytes;
 *   - a short list (payload ≤ 55 bytes) is 0xc0 + payloadLen then the payload;
 *   - a long list (> 55 bytes) is 0xf7 + byteLen(payloadLen) then the length then payload.
 *
 * Every value in an EIP-1559 transaction is an integer or a byte string; the
 * access-list is the only nested list. All integers are big-endian, zero-trimmed
 * (0 encodes as the empty string). Nothing here depends on any external library.
 */

export type RlpItem = Uint8Array | RlpItem[];

function byteLenOf(len: number): number {
  if (len <= 0xff) return 1;
  if (len <= 0xffff) return 2;
  if (len <= 0xffffff) return 3;
  return 4;
}

function bigEndian(len: number): Uint8Array {
  const bytes = new Uint8Array(byteLenOf(len));
  for (let i = bytes.length - 1; i >= 0; i -= 1) {
    bytes[i] = len & 0xff;
    len >>>= 8;
  }
  return bytes;
}

export function encodeBytes(bytes: Uint8Array): Uint8Array {
  const first = bytes[0];
  if (bytes.length === 1 && first !== undefined && first < 0x80) {
    return bytes;
  }

  if (bytes.length <= 55) {
    const out = new Uint8Array(1 + bytes.length);
    out[0] = 0x80 + bytes.length;
    out.set(bytes, 1);
    return out;
  }

  const lenBytes = bigEndian(bytes.length);
  const out = new Uint8Array(1 + lenBytes.length + bytes.length);
  out[0] = 0xb7 + lenBytes.length;
  out.set(lenBytes, 1);
  out.set(bytes, 1 + lenBytes.length);
  return out;
}

export function encodeList(items: RlpItem[]): Uint8Array {
  const parts: Uint8Array[] = [];
  let payloadLen = 0;
  for (const item of items) {
    const encoded = encode(item);
    parts.push(encoded);
    payloadLen += encoded.length;
  }

  if (payloadLen <= 55) {
    const out = new Uint8Array(1 + payloadLen);
    out[0] = 0xc0 + payloadLen;
    let offset = 1;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  const lenBytes = bigEndian(payloadLen);
  const out = new Uint8Array(1 + lenBytes.length + payloadLen);
  out[0] = 0xf7 + lenBytes.length;
  out.set(lenBytes, 1);
  let offset = 1 + lenBytes.length;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Encode a single item (a byte string or a nested list). */
export function encode(item: RlpItem): Uint8Array {
  return Array.isArray(item) ? encodeList(item) : encodeBytes(item);
}

/**
 * Encode a non-negative integer as its zero-trimmed big-endian byte string,
 * per the RLP rule that the integer 0 encodes as the empty string.
 */
export function encodeInteger(value: bigint): Uint8Array {
  if (value < 0n) {
    throw new RangeError('RLP integers cannot be negative.');
  }
  if (value === 0n) {
    return new Uint8Array(0);
  }

  // Big-endian byte count, then fill from the least-significant byte.
  const length = byteLength(value);
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

function byteLength(value: bigint): number {
  let bits = 0;
  let v = value;
  while (v > 0n) {
    bits += 1;
    v >>= 1n;
  }
  return Math.max(1, Math.ceil(bits / 8));
}
