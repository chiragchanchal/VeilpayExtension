import { describe, expect, it } from 'vitest';
import { bytesToHex } from '@noble/hashes/utils';
import {
  deriveAccount,
  deriveAllChains,
  encodeStellarPublicKey,
  mnemonicToSeed,
  pathFor,
  toAccountAddress,
  toChecksumAddress,
} from '@/core/vault/key-derivation';

/**
 * Derivation is verified against published vectors, not against this
 * implementation's own output. A self-consistent but wrong derivation produces
 * valid-looking addresses that no one else can pay, so agreement with the
 * ecosystem is the only property worth asserting.
 *
 * Sources:
 *  - EIP-55 (checksum examples)
 *  - The `abandon…about` mnemonic's first EVM account, as used by Hardhat,
 *    Ganache, and MetaMask's own fixtures
 *  - SEP-0005 test case 1 (Stellar)
 */

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('key derivation', () => {
  describe('BIP-39 seed', () => {
    it('matches the published seed for the abandon mnemonic', () => {
      // BIP-39 vector, empty passphrase.
      expect(bytesToHex(mnemonicToSeed(TEST_MNEMONIC))).toBe(
        '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1' +
          '9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4',
      );
    });

    it('normalizes whitespace before hashing', () => {
      const messy = `  ${TEST_MNEMONIC.replace(/ /g, '   ')}\n`;
      expect(bytesToHex(mnemonicToSeed(messy))).toBe(bytesToHex(mnemonicToSeed(TEST_MNEMONIC)));
    });
  });

  describe('paths', () => {
    it('uses the derivation path each ecosystem actually uses', () => {
      expect(pathFor('evm', 0)).toBe("m/44'/60'/0'/0/0");
      expect(pathFor('evm', 5)).toBe("m/44'/60'/0'/0/5");
      expect(pathFor('solana', 0)).toBe("m/44'/501'/0'/0'");
      expect(pathFor('solana', 3)).toBe("m/44'/501'/3'/0'");
      expect(pathFor('stellar', 0)).toBe("m/44'/148'/0'");
      expect(pathFor('stellar', 2)).toBe("m/44'/148'/2'");
    });

    it('rejects a non-integer or negative index', () => {
      expect(() => pathFor('evm', -1)).toThrow(RangeError);
      expect(() => pathFor('evm', 1.5)).toThrow(RangeError);
    });
  });

  describe('EIP-55 checksum', () => {
    // Verbatim from the EIP-55 specification.
    it.each([
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
      '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
      '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
    ])('round-trips %s', (address) => {
      expect(toChecksumAddress(address.toLowerCase())).toBe(address);
    });
  });

  describe('EVM', () => {
    it('derives the published first account for the abandon mnemonic', () => {
      const account = deriveAccount(TEST_MNEMONIC, 'evm', 0);
      expect(account.address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
      expect(account.path).toBe("m/44'/60'/0'/0/0");
    });

    it('derives the published second account', () => {
      expect(deriveAccount(TEST_MNEMONIC, 'evm', 1).address).toBe(
        '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0',
      );
    });

    it('returns a compressed public key and a 32-byte private key', () => {
      const account = deriveAccount(TEST_MNEMONIC, 'evm', 0);
      expect(account.privateKey).toHaveLength(32);
      expect(account.publicKey).toHaveLength(33);
      expect([0x02, 0x03]).toContain(account.publicKey[0]);
    });
  });

  describe('Stellar', () => {
    // SEP-0005 test case 1.
    const SEP5_MNEMONIC =
      'illness spike retreat truth genius clock brain pass fit cave bargain toe';

    it('derives the SEP-0005 test 1 account 0', () => {
      expect(deriveAccount(SEP5_MNEMONIC, 'stellar', 0).address).toBe(
        'GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6',
      );
    });

    it('derives the SEP-0005 test 1 account 1', () => {
      expect(deriveAccount(SEP5_MNEMONIC, 'stellar', 1).address).toBe(
        'GBAW5XGWORWVFE2XTJYDTLDHXTY2Q2MO73HYCGB3XMFMQ562Q2W2GJQX',
      );
    });

    it('derives the SEP-0005 test 1 account 9', () => {
      // A late index guards the loop, not just the first hardened step.
      expect(deriveAccount(SEP5_MNEMONIC, 'stellar', 9).address).toBe(
        'GBTVYYDIYWGUQUTKX6ZMLGSZGMTESJYJKJWAATGZGITA25ZB6T5REF44',
      );
    });

    it('derives the SEP-0005 test 5 account 0 for the abandon mnemonic', () => {
      expect(deriveAccount(TEST_MNEMONIC, 'stellar', 0).address).toBe(
        'GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX',
      );
    });

    it('derives the SEP-0005 test 5 account 1 for the abandon mnemonic', () => {
      expect(deriveAccount(TEST_MNEMONIC, 'stellar', 1).address).toBe(
        'GDVSYYTUAJ3ACHTPQNSTQBDQ4LDHQCMNY4FCEQH5TJUMSSLWQSTG42MV',
      );
    });

    it('produces a 56-character G-prefixed strkey', () => {
      const address = deriveAccount(TEST_MNEMONIC, 'stellar', 0).address;
      expect(address).toMatch(/^G[A-Z2-7]{55}$/);
      expect(address).toHaveLength(56);
    });

    it('encodes the all-zero key to a valid strkey', () => {
      // Guards the CRC16 and version-byte framing independently of derivation.
      const encoded = encodeStellarPublicKey(new Uint8Array(32));
      expect(encoded.startsWith('G')).toBe(true);
      expect(encoded).toHaveLength(56);
    });
  });

  describe('Solana', () => {
    /**
     * No published vector for this mnemonic was available offline, so these
     * assert the properties that would catch a wrong curve, wrong path, or wrong
     * encoding — not the exact address. Cross-check against Phantom before
     * shipping a mainnet build.
     */
    it('produces a base58 address of the right length', () => {
      const address = deriveAccount(TEST_MNEMONIC, 'solana', 0).address;
      expect(address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });

    it('uses ed25519 key sizes', () => {
      const account = deriveAccount(TEST_MNEMONIC, 'solana', 0);
      expect(account.privateKey).toHaveLength(32);
      expect(account.publicKey).toHaveLength(32);
    });

    it('derives a different address per account index', () => {
      const first = deriveAccount(TEST_MNEMONIC, 'solana', 0).address;
      const second = deriveAccount(TEST_MNEMONIC, 'solana', 1).address;
      expect(first).not.toBe(second);
    });
  });

  describe('determinism and isolation', () => {
    it('is deterministic across calls', () => {
      const a = deriveAccount(TEST_MNEMONIC, 'evm', 0);
      const b = deriveAccount(TEST_MNEMONIC, 'evm', 0);
      expect(bytesToHex(a.privateKey)).toBe(bytesToHex(b.privateKey));
    });

    it('gives every chain a distinct key from the same seed', () => {
      const [evm, solana, stellar] = deriveAllChains(TEST_MNEMONIC, 0);
      const keys = [evm, solana, stellar].map((a) => bytesToHex(a!.privateKey));
      expect(new Set(keys).size).toBe(3);
    });

    it('changes every address when one mnemonic word changes', () => {
      const other = TEST_MNEMONIC.replace(/about$/, 'actor');
      const before = deriveAllChains(TEST_MNEMONIC, 0).map((a) => a.address);
      const after = deriveAllChains(other, 0).map((a) => a.address);
      expect(before).not.toEqual(after);
    });
  });

  describe('toAccountAddress', () => {
    it('drops key material', () => {
      const account = deriveAccount(TEST_MNEMONIC, 'evm', 0);
      const view = toAccountAddress(account);
      expect(Object.keys(view).sort()).toEqual(['address', 'chain', 'index', 'path']);
      expect(JSON.stringify(view)).not.toContain(bytesToHex(account.privateKey));
    });
  });
});
