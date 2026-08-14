import { describe, expect, it } from 'vitest';
import { requireGrantConfirmation } from '@/core/vap/confirmation';

const PIN_ONLY = { pinEnabled: true, webauthnEnabled: false };
const WEBAUTHN_ONLY = { pinEnabled: false, webauthnEnabled: true };
const BOTH = { pinEnabled: true, webauthnEnabled: true };
const NONE = { pinEnabled: false, webauthnEnabled: false };

describe('requireGrantConfirmation', () => {
  it('requires a PIN when a PIN is configured (PIN takes precedence over WebAuthn)', () => {
    expect(requireGrantConfirmation(PIN_ONLY, { webauthn: false })).toEqual({
      ok: false,
      reason: expect.stringContaining('PIN'),
    });
    // A completed passkey ceremony does not satisfy the PIN requirement.
    expect(requireGrantConfirmation(PIN_ONLY, { webauthn: true })).toEqual({
      ok: false,
      reason: expect.stringContaining('PIN'),
    });
    expect(requireGrantConfirmation(BOTH, { webauthn: true })).toEqual({
      ok: false,
      reason: expect.stringContaining('PIN'),
    });
  });

  it('accepts a supplied PIN for the PIN path (value verified by the caller)', () => {
    expect(requireGrantConfirmation(PIN_ONLY, { pin: '1234', webauthn: false })).toEqual({
      ok: true,
    });
  });

  it('requires a passkey ceremony when only WebAuthn is configured', () => {
    expect(requireGrantConfirmation(WEBAUTHN_ONLY, { webauthn: false })).toEqual({
      ok: false,
      reason: expect.stringContaining('Passkey'),
    });
    expect(requireGrantConfirmation(WEBAUTHN_ONLY, { webauthn: true })).toEqual({ ok: true });
  });

  it('requires no confirmation when no method is configured', () => {
    expect(requireGrantConfirmation(NONE, { webauthn: false })).toEqual({ ok: true });
  });
});
