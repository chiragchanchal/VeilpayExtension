import { describe, expect, it } from 'vitest';
import { deriveAccount } from '@/core/vault/key-derivation';
import { signPaymentPayload } from '@/core/x402/payment';
import {
  issueChallenge,
  verifyHeader,
} from '../../../scripts/x402-reference-server.mjs';

// Types come from the sibling `x402-reference-server.d.mts` declaration.

// Well-known test mnemonic (the Truffle default). The wallet signs with the
// derived EVM account; the reference server must accept that signature as-is —
// this test is what prevents the wallet and the provider-side verifier from
// drifting apart on the canonical payload or the signature format.
const TEST_MNEMONIC = 'test test test test test test test test test test test junk';
const account = deriveAccount(TEST_MNEMONIC, 'evm', 0);

describe('x402 reference server round-trip', () => {
  it('accepts a header produced by the wallet for a freshly issued challenge', () => {
    const challenge = issueChallenge(1_700_000_000_000);
    const { header } = signPaymentPayload(challenge, account.privateKey, account.address, 1_700_000_000_001);

    expect(verifyHeader(header, 1_700_000_000_001)).toBeNull();
  });

  it('rejects a header for an unknown nonce', () => {
    const challenge = issueChallenge(1_700_000_000_000);
    challenge.nonce = 'unknown-nonce';
    const { header } = signPaymentPayload(challenge, account.privateKey, account.address, 1_700_000_000_001);

    expect(verifyHeader(header, 1_700_000_000_001)).toMatch(/Unknown challenge nonce/i);
  });

  it('rejects a replayed nonce', () => {
    const challenge = issueChallenge(1_700_000_000_000);
    const { header } = signPaymentPayload(challenge, account.privateKey, account.address, 1_700_000_000_001);

    expect(verifyHeader(header, 1_700_000_000_001)).toBeNull();
    expect(verifyHeader(header, 1_700_000_000_002)).toMatch(/already used/i);
  });

  it('rejects a tampered amount', () => {
    const challenge = issueChallenge(1_700_000_000_000);
    const { header } = signPaymentPayload(challenge, account.privateKey, account.address, 1_700_000_000_001);

    // Tamper with the amount in the encoded header — the signature was over the
    // original payload, so verification must fail even though nonce matches.
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    decoded.payload.challenge.amount = '9999999999999999';
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64');

    expect(verifyHeader(tampered, 1_700_000_000_001)).toMatch(/does not match/i);
  });

  it('rejects a signature that does not recover to the declared signer', () => {
    const challenge = issueChallenge(1_700_000_000_000);
    const { header } = signPaymentPayload(challenge, account.privateKey, account.address, 1_700_000_000_001);

    // Swap the declared signer to a different address.
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    decoded.payload.signer = '0x2222222222222222222222222222222222222222';
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64');

    expect(verifyHeader(tampered, 1_700_000_000_001)).toMatch(/does not match the declared signer/i);
  });
});
