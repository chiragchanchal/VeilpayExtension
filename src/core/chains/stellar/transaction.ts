/**
 * Stellar payment operation — build, sign, and serialize without
 * @stellar/stellar-sdk.
 *
 * Uses raw XDR encoding for a native (XLM) payment with MEMO_NONE and no
 * time bounds. The caller provides the account sequence number from Horizon
 * and the raw private key from the vault.
 */

import { base32 } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';

/** An unsigned Stellar native payment. */
export interface UnsignedStellarPayment {
  /** Stellar address (G...) of the sender. */
  from: string;
  /** Stellar address (G...) of the recipient. */
  to: string;
  /** Amount in stroops (10^-7 XLM). */
  amount: bigint;
  /** Account sequence number from Horizon. */
  sequence: bigint;
  /** Base fee in stroops (typically 100). */
  fee: number;
}

/** A fully signed, broadcast-ready Stellar transaction. */
export interface SignedStellarTransaction {
  /** Base64-encoded TransactionEnvelope XDR for Horizon's /transactions. */
  raw: string;
  /** SHA-256 hash of the Transaction XDR (the network transaction hash). */
  signingHash: string;
  /** Recovered sender address. */
  from: string;
}

/**
 * Decodes a Stellar strkey (G... address) to its raw 32-byte ed25519 public key.
 *
 * Format: base32(version byte + payload + CRC16-XModem LE checksum)
 * Version 6 << 3 = 0x30 yields the G... account ID prefix.
 */
function decodeStellarAddress(address: string): Uint8Array {
  // @scure/base's base32 is uppercase-only (RFC 4648); Stellar strkeys are
  // canonical uppercase, so normalize defensively before decoding.
  const normalized = address.toUpperCase();
  const decoded = base32.decode(normalized);
  if (decoded.length !== 35) {
    // 1 version byte + 32 payload bytes + 2 checksum bytes
    throw new Error(`Invalid Stellar address length: ${decoded.length} bytes.`);
  }
  const version = decoded[0];
  if (version !== 6 << 3) {
    throw new Error(`Unexpected Stellar address version byte: ${version}.`);
  }
  // Return the raw 32-byte public key (skip version, skip 2-byte checksum).
  return decoded.subarray(1, 33);
}

/**
 * Encodes the raw 32-byte ed25519 public key as a Stellar strkey (G... address).
 * Matches the implementation in vault/key-derivation.ts.
 */
export function encodeStellarAddress(publicKey: Uint8Array): string {
  const payload = new Uint8Array(1 + publicKey.length);
  payload[0] = 6 << 3;
  payload.set(publicKey, 1);

  const checksum = crc16Xmodem(payload);
  const framed = new Uint8Array(payload.length + 2);
  framed.set(payload);
  framed[payload.length] = checksum & 0xff;
  framed[payload.length + 1] = (checksum >> 8) & 0xff;

  return base32.encode(framed);
}

// ---------------------------------------------------------------------------
// XDR encoding helpers
// ---------------------------------------------------------------------------

function xdrUint32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function xdrUint64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  for (let i = 7; i >= 0; i -= 1) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

function xdrInt64(value: bigint): Uint8Array {
  // For non-negative amounts, int64 and uint64 encoding are identical.
  return xdrUint64(value);
}

/** Encode an opaque<max> = uint32 length + bytes. */
function xdrOpaque(bytes: Uint8Array): Uint8Array {
  return concat([xdrUint32(bytes.length), bytes]);
}

/** Encode a variable-length array = uint32 count + elements. */
function xdrArray(elements: Uint8Array[]): Uint8Array {
  return concat([xdrUint32(elements.length), ...elements]);
}

/**
 * Encode the modern `Preconditions` union with nothing set (PRECOND_NONE = 0).
 *
 * Protocol 19+ restructured the transaction header: the legacy `TimeBounds*`
 * optional pointer became a `Preconditions` union whose discriminant is a
 * uint32. Horizon's decoder reads `operations` as an array whose length field
 * follows preconditions — encoding the old 1-byte pointer shifts every
 * subsequent field and the envelope fails with "could not decode". "No
 * constraints" is a single uint32 discriminant 0 (no body).
 */
function xdrPreconditionsNone(): Uint8Array {
  return xdrUint32(0); // PRECOND_NONE = 0
}

// ---------------------------------------------------------------------------
// XDR encoding for Stellar native payment
// ---------------------------------------------------------------------------

/**
 * Encodes a PublicKey union (PUBLIC_KEY_TYPE_ED25519).
 * XDR: uint32 discriminant (0) + uint256 (32 bytes).
 */
function xdrPublicKey(raw: Uint8Array): Uint8Array {
  return concat([xdrUint32(0), raw]); // PUBLIC_KEY_TYPE_ED25519 = 0
}

/**
 * Encodes a PaymentOp struct.
 * XDR: AccountID destination + Asset asset + int64 amount.
 */
function xdrPaymentOp(destPubkey: Uint8Array, amount: bigint): Uint8Array {
  // AccountID = PublicKey = PUBLIC_KEY_TYPE_ED25519 (0) + 32 bytes
  const destination = xdrPublicKey(destPubkey);
  // Asset = ASSET_TYPE_NATIVE = 0
  const asset = xdrUint32(0);
  // Amount = int64
  const amountXdr = xdrInt64(amount);
  return concat([destination, asset, amountXdr]);
}

/**
 * Encodes an Operation struct (PAYMENT).
 *
 * XDR:
 *   struct Operation {
 *     MuxedAccount* sourceAccount;  // optional pointer, u32; 0 = null
 *     union switch (OperationType) { case PAYMENT: PaymentOp paymentOp; ... } body;
 *   }
 *
 * XDR optional pointers are FOUR bytes, not one: the discriminant 0 (null) /
 * 1 (present) is a uint32. Using a single byte shifts the whole operation and
 * Horizon rejects the envelope as undecodable.
 */
function xdrPaymentOperation(destPubkey: Uint8Array, amount: bigint): Uint8Array {
  const nullSourcePointer = xdrUint32(0); // MuxedAccount* = null
  const body = concat([xdrUint32(1), xdrPaymentOp(destPubkey, amount)]); // PAYMENT = 1
  return concat([nullSourcePointer, body]);
}

/**
 * Encodes a Transaction XDR struct for a native payment.
 */
function xdrTransaction(
  sourcePubkey: Uint8Array,
  fee: number,
  seqNum: bigint,
  destPubkey: Uint8Array,
  amount: bigint,
): Uint8Array {
  // sourceAccount: AccountID = PUBLIC_KEY_TYPE_ED25519 + 32 bytes
  const sourceAccount = xdrPublicKey(sourcePubkey);
  // fee: uint32
  const feeXdr = xdrUint32(fee);
  // seqNum: uint64
  const seqNumXdr = xdrUint64(seqNum);
  // preconditions: modern `Preconditions` union, PRECOND_NONE (no constraints).
  const preconditions = xdrPreconditionsNone();
  // memo: MEMO_NONE = 0
  const memo = xdrUint32(0);
  // operations: Operation[] = [payment operation]
  const operations = xdrArray([xdrPaymentOperation(destPubkey, amount)]);
  // ext: v=0
  const ext = xdrUint32(0);

  return concat([
    sourceAccount,
    feeXdr,
    seqNumXdr,
    preconditions,
    memo,
    operations,
    ext,
  ]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds, signs, and serializes a Stellar native (XLM) payment transaction.
 *
 * @param tx - The unsigned payment parameters.
 * @param privateKey - 32-byte ed25519 private key (from vault).
 * @returns The signed transaction envelope as base64 XDR.
 */
export function signStellarPayment(
  tx: UnsignedStellarPayment,
  privateKey: Uint8Array,
): SignedStellarTransaction {
  if (privateKey.length !== 32) {
    throw new Error(
      `Stellar private key must be 32 bytes, got ${privateKey.length}.`,
    );
  }

  const sourcePubkey = decodeStellarAddress(tx.from);
  const destPubkey = decodeStellarAddress(tx.to);

  // Build the Transaction XDR
  const txXdr = xdrTransaction(
    sourcePubkey,
    tx.fee,
    tx.sequence,
    destPubkey,
    tx.amount,
  );

  // The transaction hash is SHA-256 of the Transaction XDR
  const txHash = sha256(txXdr);

  // Sign the hash
  const signature = ed25519.sign(txHash, privateKey);

  // Build the DecoratedSignature:
  // hint = last 4 bytes of the public key
  const hint = sourcePubkey.subarray(28, 32);
  // signature = opaque<64> = uint32 length + 64 bytes
  const sigXdr = xdrOpaque(signature);
  const decoratedSignature = concat([hint, sigXdr]);

  // Build the TransactionEnvelope:
  //   union TransactionEnvelope switch (EnvelopeType type) {
  //     case ENVELOPE_TYPE_TX_V0: TransactionV0Envelope v0;
  //     case ENVELOPE_TYPE_TX: TransactionV1Envelope v1;
  //     case ENVELOPE_TYPE_TX_FEE_BUMP: FeeBumpTransactionEnvelope feeBump;
  //   };
  // The envelope body is preceded by the union discriminant (2 = TX v1).
  // Omitting it misaligns the whole struct and Horizon cannot decode it.
  const ENVELOPE_TYPE_TX = 2;
  const envelope = concat([xdrUint32(ENVELOPE_TYPE_TX), txXdr, xdrArray([decoratedSignature])]);

  // Compute the from address
  const from = encodeStellarAddress(sourcePubkey);

  return {
    raw: btoa(String.fromCharCode(...envelope)),
    signingHash: bytesToHex(txHash),
    from,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0x0000;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}