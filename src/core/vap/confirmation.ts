/**
 * Grant-creation confirmation gate (VAP-01).
 *
 * A grant cannot be created without PIN or WebAuthn confirmation. Which method
 * applies is decided here, purely, so the gate is unit-testable without any
 * security-storage or browser dependency.
 *
 * - PIN configured  → a PIN must be supplied. The background verifies its value
 *   itself (authoritative), so this path only checks presence here.
 * - WebAuthn only    → the UI must have completed a passkey ceremony (its flag
 *   travels over the privileged resolve kind, so a page cannot forge it).
 * - Neither          → no confirmation method is configured; the grant may be
 *   created after the anti-clickjack hold (the wallet has no PIN/passkey to
 *   require).
 */
export type GrantConfirmation = { ok: true } | { ok: false; reason: string };

export function requireGrantConfirmation(
  status: { pinEnabled: boolean; webauthnEnabled: boolean },
  attempt: { pin?: string; webauthn: boolean },
): GrantConfirmation {
  if (status.pinEnabled) {
    if (attempt.pin === undefined) {
      return { ok: false, reason: 'A PIN is required to create a grant.' };
    }
    return { ok: true };
  }
  if (status.webauthnEnabled) {
    if (!attempt.webauthn) {
      return { ok: false, reason: 'Passkey confirmation is required to create a grant.' };
    }
    return { ok: true };
  }
  return { ok: true };
}