export const mockMnemonicValid =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

export const mockPassword = 'test-password-123';

export const mockEncryptionKey = new Uint8Array(32).fill(42);

export const mockIV = new Uint8Array(12).fill(99);

export const mockCiphertext = new Uint8Array(64).fill(128);

export const mockPublicKey = {
  crv: 'P-256',
  kty: 'EC',
  x: 'WKn33rT8ZkZBaKagRSapV_F7GO4Xfu2OsSMScrWrCQc',
  y: '3QNMKVlayer6Z-Z7TCYaaumyJ84aI7ZuqqLKQueVHAI',
};

export const mockPrivateKey = {
  crv: 'P-256',
  d: 'AI0SEK33zePmtw5Y39dT8n_LS4B2C5yf-tLx7Tz2NGI',
  kty: 'EC',
  x: 'WKn33rT8ZkZBaKagRSapV_F7GO4Xfu2OsSMScrWrCQc',
  y: '3QNMKVlayer6Z-Z7TCYaaumyJ84aI7ZuqqLKQueVHAI',
};

export const mockEvmAddress = '0x742d35Cc6634C0532925a3b844Bc0e7595f0bEb';

export const mockSolanaPublicKey =
  '11111111111111111111111111111112';

export const mockStellarPublicKey =
  'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3RH2RXWOOOTLGIE4ZQJJWSTze';

export const mockNonce = new Uint8Array(24).fill(1);
