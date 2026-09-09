import { useEffect, useState } from 'react';
import { Icon } from '@/ui/components/Icon';
import { t } from '@/i18n';
import { useWallet } from '@/ui/store/useWallet';
import { Button } from '@/ui/components/Button';
import { Input } from '@/ui/components/Input';

/**
 * Security setup flow — PIN and WebAuthn.
 *
 * Called from onboarding (after wallet creation) or from settings. The user
 * sets a PIN first, then optionally registers a platform passkey for faster
 * unlock.
 */
export function SecuritySetup({
  onComplete,
  onSkip,
}: {
  onComplete: () => void;
  onSkip: () => void;
}) {
  const { loadSecurityStatus, setupSecurityPin, setupSecurityWebAuthn, isLoading } = useWallet();

  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [step, setStep] = useState<'pin' | 'webauthn' | 'done'>('pin');

  useEffect(() => {
    void loadSecurityStatus();
  }, [loadSecurityStatus]);

  const handlePinSubmit = async () => {
    setPinError(null);
    if (pin.length < 4) {
      setPinError('PIN must be at least 4 characters.');
      return;
    }
    if (pin !== pinConfirm) {
      setPinError(t('surfaces.pinsMismatch'));
      return;
    }
    const ok = await setupSecurityPin(pin);
    if (ok) {
      setStep('webauthn');
    } else {
      setPinError(t('surfaces.setPinError'));
    }
  };

  const handleWebAuthn = async () => {
    await setupSecurityWebAuthn();
    setStep('done');
  };

  const handleSkipWebAuthn = () => {
    setStep('done');
  };

  if (step === 'done') {
    return (
      <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
        <header className="flex items-baseline justify-between">
          <h1 className="font-display text-lg font-bold text-content-primary">Veilpay</h1>
          <span className="font-mono text-xs text-content-tertiary">v0.0.1</span>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/20">
            <Icon name="check" className="h-6 w-6" />
          </div>
          <h2 className="font-display text-lg font-semibold text-content-primary">{t('surfaces.setupComplete')}</h2>
          <p className="font-body text-sm text-content-secondary text-center max-w-xs">
            {t('surfaces.setupCompleteHint')}
          </p>
          <Button fullWidth onClick={onComplete}>
            {t('surfaces.continue')}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[600px] w-[400px] flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-lg font-bold text-content-primary">Veilpay</h1>
        <span className="font-mono text-xs text-content-tertiary">v0.0.1</span>
      </header>

      {step === 'pin' && (
        <div className="flex flex-1 flex-col gap-4">
          <h2 className="font-display text-base font-semibold text-content-primary">
            Set a PIN
          </h2>
          <p className="font-body text-xs text-content-secondary">
            A PIN lets you unlock your wallet faster. It is stored as a scrypt hash on this device.
          </p>

          <div className="flex flex-col gap-3">
            <Input
              type="password"
              placeholder="PIN (min. 4 characters)"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setPinError(null); }}
              passwordToggle
              disabled={isLoading}
            />
            <Input
              type="password"
              placeholder="Confirm PIN"
              value={pinConfirm}
              onChange={(e) => { setPinConfirm(e.target.value); setPinError(null); }}
              passwordToggle
              error={pinError ?? null}
              disabled={isLoading}
            />
          </div>

          <div className="flex gap-2 mt-auto">
            <Button variant="secondary" onClick={onSkip} disabled={isLoading}>
              Skip
            </Button>
            <Button
              fullWidth
              onClick={handlePinSubmit}
              disabled={isLoading || pin.length < 4 || pinConfirm.length < 4}
            >
              {isLoading ? 'Setting up…' : 'Set PIN'}
            </Button>
          </div>
        </div>
      )}

      {step === 'webauthn' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <h2 className="font-display text-base font-semibold text-content-primary">
            Faster unlock with a passkey
          </h2>
          <p className="font-body text-sm text-content-secondary text-center max-w-xs">
            Register a platform passkey (fingerprint, face, or Windows Hello) to unlock
            your wallet without typing your PIN.
          </p>
          <Button fullWidth onClick={handleWebAuthn} disabled={isLoading}>
            {isLoading ? 'Registering…' : 'Register passkey'}
          </Button>
          <Button variant="ghost" onClick={handleSkipWebAuthn}>
            Skip for now
          </Button>
        </div>
      )}
    </main>
  );
}