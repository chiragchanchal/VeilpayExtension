import { describe, expect, it } from 'vitest';
import {
  EIP1193,
  SUPPORTED_EVM_CHAIN_ID,
  eip1193CodeFor,
  eip1193Error,
} from '@/core/chains/evm/eip1193';

describe('eip1193 helpers', () => {
  it('declares Sepolia as the only supported EVM chain', () => {
    expect(SUPPORTED_EVM_CHAIN_ID).toBe('0xaa36a7'); // 11155111 in hex
  });

  it('maps the protocol CHAIN_UNSUPPORTED code to EIP-1193 4902', () => {
    expect(eip1193CodeFor('CHAIN_UNSUPPORTED')).toBe(4902);
  });

  it('maps unknown protocol kinds to EIP-1193 4200 (unsupported method)', () => {
    expect(eip1193CodeFor('UNKNOWN_KIND')).toBe(4200);
  });

  it('returns undefined for codes with no EIP-1193 mapping', () => {
    expect(eip1193CodeFor('USER_REJECTED')).toBeUndefined();
    expect(eip1193CodeFor('VAULT_LOCKED')).toBeUndefined();
  });

  it('builds an error with a numeric EIP-1193 code', () => {
    const err = eip1193Error(EIP1193.UNRECOGNIZED_CHAIN, 'Unrecognized chain.');
    expect(err.code).toBe(4902);
    expect(err.message).toBe('Unrecognized chain.');
    expect(err).toBeInstanceOf(Error);
  });
});
