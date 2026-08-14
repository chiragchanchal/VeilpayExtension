import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha2';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import { base32, base58 } from '@scure/base';
import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { ed25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';

/**
 * BIP-39 / BIP-44 / SLIP-0010 key derivation for the three supported chains.
 *
 * Design notes:
 *  - Derivation is pure. Nothing here touches storage, the vault session, or the
 *    message bus. Callers reach it through `vault.withMnemonic`, so a derived
 *    private key's lifetime stays bounded by that call.
 *  - `@scure/bip32` implements BIP-32 over secp256k1 only. Solana and Stellar use
 *    ed25519, whose derivation is SLIP-0010 — a different algorithm, not a
 *    parameter swap — so it is implemented explicitly below rather than faked by
 *    passing a curve name.
 *  - Paths match what each ecosystem's wallets actually use, because a wallet
 *    that derives a *valid but non-standard* address silently strands funds:
 *      EVM      m/44'/60'/0'/0/i     (BIP-44, MetaMask)
 *      Solana   m/44'/501'/i'/0'     (Phantom / Solflare)
 *      Stellar  m/44'/148'/i'        (SEP-0005)
 *  - Addresses are encoded in each chain's canonical form. Hex placeholders were
 *    rejected: an address that cannot be pasted into an explorer is not an
 *    address, and a receive screen showing one would lose funds.
 */

export type Chain = 'evm' | 'solana' | 'stellar';

export interface DerivedAccount {
  chain: Chain;
  /** BIP-44 account index. */
  index: number;
  /** Full derivation path, recorded so a future migration can prove provenance. */
  path: string;
  /** Canonical address for the chain: EIP-55 hex, base58, or strkey. */
  address: string;
  /** Compressed for secp256k1, raw 32 bytes for ed25519. */
  publicKey: Uint8Array;
  /**
   * Raw private key. Zeroize after use; see `vault.withMnemonic` for the
   * intended calling pattern.
   */
  privateKey: Uint8Array;
}

/** Public view of an account. Safe to send over the message bus or render. */
export type AccountAddress = Pick<DerivedAccount, 'chain' | 'index' | 'path' | 'address'>;

const HARDENED = 0x80000000;

const COIN_TYPE: Record<Chain, number> = {
  evm: 60,
  solana: 501,
  stellar: 148,
};

export function pathFor(chain: Chain, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= HARDENED) {
    throw new RangeError('Account index must be a non-negative 31-bit integer.');
  }
  switch (chain) {
    case 'evm':
      return `m/44'/${COIN_TYPE.evm}'/0'/0/${index}`;
    case 'solana':
      return `m/44'/${COIN_TYPE.solana}'/${index}'/0'`;
    case 'stellar':
      return `m/44'/${COIN_TYPE.stellar}'/${index}'`;
  }
}

/**
 * BIP-39 mnemonic to 64-byte seed.
 *
 * The optional BIP-39 passphrase is deliberately not exposed. It would be a
 * second secret that silently changes every derived address, and recovering a
 * wallet without it is indistinguishable from recovering the wrong wallet. The
 * vault passphrase protects the mnemonic at rest instead.
 */
export function mnemonicToSeed(mnemonic: string): Uint8Array {
  return bip39.mnemonicToSeedSync(mnemonic.trim().replace(/\s+/g, ' '));
}

// ---------------------------------------------------------------------------
// SLIP-0010, ed25519
// ---------------------------------------------------------------------------

interface Slip10Node {
  key: Uint8Array;
  chainCode: Uint8Array;
}

function ed25519Master(seed: Uint8Array): Slip10Node {
  const I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

/**
 * ed25519 supports hardened derivation only, so every index is forced hardened.
 * This is a property of the curve's use in SLIP-0010, not a policy choice.
 */
function ed25519Child(node: Slip10Node, index: number): Slip10Node {
  const data = new Uint8Array(37);
  data[0] = 0x00;
  data.set(node.key, 1);
  new DataView(data.buffer).setUint32(33, index | HARDENED, false);

  const I = hmac(sha512, node.chainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

/** Parses `m/44'/501'/0'/0'` into hardened-flagged indices. */
function parsePath(path: string): number[] {
  const parts = path.split('/');
  if (parts[0] !== 'm') {
    throw new Error('Derivation path must start with "m".');
  }
  return parts.slice(1).map((part) => {
    const hardened = part.endsWith("'");
    const n = Number.parseInt(hardened ? part.slice(0, -1) : part, 10);
    if (!Number.isInteger(n) || n < 0 || n >= HARDENED) {
      throw new Error(`Invalid path segment: ${part}`);
    }
    return hardened ? n | HARDENED : n;
  });
}

function deriveEd25519(seed: Uint8Array, path: string): Uint8Array {
  let node = ed25519Master(seed);
  for (const index of parsePath(path)) {
    node = ed25519Child(node, index);
  }
  return node.key;
}

// ---------------------------------------------------------------------------
// Address encoding
// ---------------------------------------------------------------------------

/**
 * EIP-55 mixed-case checksum. Lowercase hex is valid on-chain, but most tooling
 * and every explorer displays the checksummed form, and some UIs reject the
 * lowercase one outright.
 */
export function toChecksumAddress(lowercaseHex20: string): string {
  const body = lowercaseHex20.replace(/^0x/, '').toLowerCase();
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(body)));
  let out = '0x';
  for (let i = 0; i < body.length; i += 1) {
    const nibble = Number.parseInt(hash.charAt(i), 16);
    const char = body.charAt(i);
    out += nibble >= 8 ? char.toUpperCase() : char;
  }
  return out;
}

function evmAddressFrom(privateKey: Uint8Array): string {
  // Uncompressed SEC1 point is 65 bytes; the leading 0x04 tag is not hashed.
  const uncompressed = secp256k1.getPublicKey(privateKey, false);
  const hashed = keccak_256(uncompressed.slice(1));
  return toChecksumAddress(bytesToHex(hashed.slice(-20)));
}

/** CRC16-XModem, as required by Stellar's strkey checksum. */
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

/**
 * Stellar strkey (SEP-0023): version byte, payload, CRC16 little-endian, base32.
 * Version 6 << 3 = 0x30 yields the familiar `G...` account ID.
 */
export function encodeStellarPublicKey(publicKey: Uint8Array): string {
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
// Public API
// ---------------------------------------------------------------------------

export function deriveAccount(
  mnemonic: string,
  chain: Chain,
  index = 0,
): DerivedAccount {
  const seed = mnemonicToSeed(mnemonic);
  const path = pathFor(chain, index);

  try {
    if (chain === 'evm') {
      const node = HDKey.fromMasterSeed(seed).derive(path);
      if (node.privateKey === null) {
        throw new Error('Derivation produced no private key.');
      }
      const privateKey = Uint8Array.from(node.privateKey);
      return {
        chain,
        index,
        path,
        address: evmAddressFrom(privateKey),
        publicKey: secp256k1.getPublicKey(privateKey, true),
        privateKey,
      };
    }

    const privateKey = deriveEd25519(seed, path);
    const publicKey = ed25519.getPublicKey(privateKey);
    return {
      chain,
      index,
      path,
      address:
        chain === 'solana' ? base58.encode(publicKey) : encodeStellarPublicKey(publicKey),
      publicKey,
      privateKey,
    };
  } finally {
    seed.fill(0);
  }
}

/** Derives one account per chain at the same index. */
export function deriveAllChains(mnemonic: string, index = 0): DerivedAccount[] {
  return (['evm', 'solana', 'stellar'] as const).map((chain) =>
    deriveAccount(mnemonic, chain, index),
  );
}

/** Strips key material, leaving a record safe to persist or message. */
export function toAccountAddress(account: DerivedAccount): AccountAddress {
  return {
    chain: account.chain,
    index: account.index,
    path: account.path,
    address: account.address,
  };
}
