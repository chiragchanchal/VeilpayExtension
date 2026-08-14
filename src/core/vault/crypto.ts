/**
 * Vault primitives. Pure functions over WebCrypto — no storage, no globals.
 *
 * Design notes:
 *  - Key derivation is PBKDF2-SHA512 via WebCrypto rather than Argon2id. WebCrypto
 *    runs natively and needs no WASM, which keeps the unlock path clear of the MV3
 *    CSP question that D3 tracks. The tradeoff is weaker GPU resistance per unit
 *    time, compensated with a high iteration count. Revisit if the D3 spike shows
 *    WASM is dependable in the service worker.
 *  - AES-256-GCM provides confidentiality and integrity together, so a wrong
 *    passphrase fails as an authentication error instead of yielding garbage.
 *  - Nothing here logs, throws with, or returns the passphrase or derived key
 *    material in an error message.
 */

/** OWASP 2023 floor for PBKDF2-SHA512 is 210k; we set a deliberate margin. */
export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 32;
export const IV_BYTES = 12;
export const KEY_BITS = 256;

export interface EncryptedBlob {
  /** Format version, so a future migration can re-wrap without guessing. */
  v: 1;
  kdf: 'PBKDF2-SHA512';
  iterations: number;
  salt: Uint8Array;
  iv: Uint8Array;
  /** AES-GCM output; the 16-byte tag is appended by WebCrypto. */
  ciphertext: Uint8Array;
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Stretches a passphrase into an AES-GCM key.
 *
 * The returned key is non-extractable: even with a scripting foothold in the
 * service worker, the raw bytes cannot be read back out of the CryptoKey.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(passphrase.normalize('NFKD'));

  const baseKey = await crypto.subtle.importKey('raw', encoded, 'PBKDF2', false, [
    'deriveKey',
  ]);

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-512' },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<EncryptedBlob> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );

  return {
    v: 1,
    kdf: 'PBKDF2-SHA512',
    iterations,
    salt,
    iv,
    ciphertext: new Uint8Array(ciphertext),
  };
}

export class DecryptionFailed extends Error {
  constructor() {
    // Intentionally uniform: never distinguish "wrong passphrase" from
    // "tampered ciphertext" to a caller that might be an attacker.
    super('Could not decrypt the vault.');
    this.name = 'DecryptionFailed';
  }
}

export async function decrypt(
  key: CryptoKey,
  blob: EncryptedBlob,
): Promise<Uint8Array> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: blob.iv as BufferSource },
      key,
      blob.ciphertext as BufferSource,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new DecryptionFailed();
  }
}

/** Convenience wrapper: derive from a passphrase and encrypt in one step. */
export async function seal(
  passphrase: string,
  plaintext: Uint8Array,
): Promise<EncryptedBlob> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(passphrase, salt);
  return encrypt(key, plaintext, salt);
}

/** Convenience wrapper: derive using the blob's own parameters and decrypt. */
export async function open(
  passphrase: string,
  blob: EncryptedBlob,
): Promise<Uint8Array> {
  const key = await deriveKey(passphrase, blob.salt, blob.iterations);
  return decrypt(key, blob);
}

/**
 * Best-effort overwrite of a secret buffer.
 *
 * JS gives no guarantee the allocation is not already copied elsewhere, so treat
 * this as hygiene that shortens a window, not as a security boundary.
 */
export function wipe(buffer: Uint8Array): void {
  crypto.getRandomValues(buffer);
  buffer.fill(0);
}
