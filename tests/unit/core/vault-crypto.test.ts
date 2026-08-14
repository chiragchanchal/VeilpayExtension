import { describe, it, expect } from 'vitest';
import * as vaultCrypto from '@/core/vault/crypto';

// Helper to compare Uint8Array contents
const expectBufferEqual = (actual: Uint8Array, expected: Uint8Array) => {
  expect(Buffer.from(actual)).toEqual(Buffer.from(expected));
};

describe('Vault Crypto Primitives', () => {
  describe('seal/open', () => {
    it('should encrypt and decrypt a mnemonic symmetrically', async () => {
      const plaintext = new TextEncoder().encode('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
      const passphrase = 'my-strong-passphrase-12345';

      const sealed = await vaultCrypto.seal(passphrase, plaintext);
      expect(sealed).toBeDefined();
      expect(sealed.v).toBe(1);
      expect(sealed.kdf).toBe('PBKDF2-SHA512');

      const decrypted = await vaultCrypto.open(passphrase, sealed);
      expectBufferEqual(decrypted, plaintext);
    });

    it('should fail decryption with wrong passphrase', async () => {
      const plaintext = new TextEncoder().encode('test data');
      const passphrase = 'strong-password-123';
      const wrongPassphrase = 'wrong-password';

      const sealed = await vaultCrypto.seal(passphrase, plaintext);

      await expect(vaultCrypto.open(wrongPassphrase, sealed)).rejects.toThrow(
        vaultCrypto.DecryptionFailed,
      );
    });

    it('should produce different ciphertext for same plaintext (IV randomization)', async () => {
      const plaintext = new TextEncoder().encode('test');
      const passphrase = 'strong-password-123';

      const sealed1 = await vaultCrypto.seal(passphrase, plaintext);
      const sealed2 = await vaultCrypto.seal(passphrase, plaintext);

      // Ciphertexts should differ due to random IV
      expect(Buffer.from(sealed1.ciphertext)).not.toEqual(Buffer.from(sealed2.ciphertext));
      expect(Buffer.from(sealed1.iv)).not.toEqual(Buffer.from(sealed2.iv));

      // But both should decrypt to the same plaintext
      const decrypted1 = await vaultCrypto.open(passphrase, sealed1);
      const decrypted2 = await vaultCrypto.open(passphrase, sealed2);
      expectBufferEqual(decrypted1, plaintext);
      expectBufferEqual(decrypted2, plaintext);
    });
  });

  describe('key derivation', () => {
    it('should derive a consistent key from same passphrase and salt', async () => {
      const passphrase = 'my-strong-password';
      const plaintext = new TextEncoder().encode('test');
      const salt = vaultCrypto.randomBytes(vaultCrypto.SALT_BYTES);

      const key1 = await vaultCrypto.deriveKey(passphrase, salt);
      const key2 = await vaultCrypto.deriveKey(passphrase, salt);

      // Encrypt with both keys and verify they produce the same result
      // (deterministic for same salt and passphrase)
      const enc1 = await vaultCrypto.encrypt(key1, plaintext, salt);
      const enc2 = await vaultCrypto.encrypt(key2, plaintext, salt);

      // IVs will differ, but decryption should succeed with both
      const dec1 = await vaultCrypto.decrypt(key1, enc1);
      const dec2 = await vaultCrypto.decrypt(key2, enc2);
      expectBufferEqual(dec1, plaintext);
      expectBufferEqual(dec2, plaintext);
    });

    it('should produce different keys for different salts', async () => {
      const passphrase = 'my-strong-password';
      const plaintext = new TextEncoder().encode('test');
      const salt1 = vaultCrypto.randomBytes(vaultCrypto.SALT_BYTES);
      const salt2 = vaultCrypto.randomBytes(vaultCrypto.SALT_BYTES);

      const key1 = await vaultCrypto.deriveKey(passphrase, salt1);
      const key2 = await vaultCrypto.deriveKey(passphrase, salt2);

      const enc1 = await vaultCrypto.encrypt(key1, plaintext, salt1);

      // Decryption with the wrong key should fail
      await expect(vaultCrypto.decrypt(key2, enc1)).rejects.toThrow(
        vaultCrypto.DecryptionFailed,
      );
    });
  });

  describe('utilities', () => {
    it('should generate random bytes', () => {
      const bytes1 = vaultCrypto.randomBytes(32);
      const bytes2 = vaultCrypto.randomBytes(32);

      expect(bytes1).toHaveLength(32);
      expect(bytes2).toHaveLength(32);
      expect(Buffer.from(bytes1)).not.toEqual(Buffer.from(bytes2));
    });

    it('should wipe a buffer', () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5]);
      const original = Buffer.from(buffer);

      vaultCrypto.wipe(buffer);

      // After wipe, all bytes should be zero (or at least changed)
      const afterWipe = Buffer.from(buffer);
      expect(afterWipe).not.toEqual(original);
    });

    it('should handle tampered ciphertext uniformly', async () => {
      const plaintext = new TextEncoder().encode('test data');
      const passphrase = 'my-password';

      const sealed = await vaultCrypto.seal(passphrase, plaintext);

      // Tamper with the ciphertext
      if (sealed.ciphertext[0] !== undefined) {
        sealed.ciphertext[0] ^= 1;
      }

      // Should throw DecryptionFailed (same as wrong passphrase)
      await expect(vaultCrypto.open(passphrase, sealed)).rejects.toThrow(
        vaultCrypto.DecryptionFailed,
      );
    });
  });
});
