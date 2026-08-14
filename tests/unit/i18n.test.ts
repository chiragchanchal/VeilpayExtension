import { beforeEach, describe, expect, it } from 'vitest';
import {
  getLocale,
  loadLocale,
  persistLocale,
  setLocale,
  t,
} from '@/i18n';

describe('i18n scaffold', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('translates shared semantic keys', () => {
    expect(t('brand')).toBe('Veilpay');
    expect(t('common.approve')).toBe('Approve');
    expect(t('wallet.locked')).toBe('Wallet is locked');
  });

  it('interpolates named parameters', () => {
    expect(t('approval.requestAccess', { origin: 'https://example.test' })).toBe(
      'A dapp at https://example.test is requesting access to your wallet.',
    );
  });

  it('leaves unknown interpolation values visible', () => {
    expect(t('approval.requestAction', { origin: 'https://example.test' })).toContain('{action}');
  });

  it('supports the typed locale seam', async () => {
    await persistLocale('en');
    expect(getLocale()).toBe('en');
    expect(await loadLocale()).toBe('en');
  });
});
