import { type InputHTMLAttributes, useId, useState } from 'react';
import { Icon } from '@/ui/components/Icon';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  error?: string | null;
  passwordToggle?: boolean;
  /** Visible label for the field (WCAG 3.3.2). Falls back to `aria-label` from
   *  the placeholder so placeholder-only fields still have an accessible name. */
  label?: string;
}

export function Input({ error, passwordToggle, className = '', type, label, ...rest }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const labelId = useId();

  const resolvedType =
    type === 'password' && passwordToggle && showPassword ? 'text' : type;

  // A placeholder is not a label (it disappears on focus and is not exposed to
  // assistive tech), so a field without an explicit label or aria-* name must
  // not rely on one. `aria-label` from the placeholder keeps existing callers
  // accessible until they pass a real label. Precedence: an explicit
  // aria-label/aria-labelledby (passed through rest) or a visible <label> beats
  // the placeholder fallback; the spread below lets a caller override.
  const ariaLabel =
    rest['aria-label'] ??
    rest['aria-labelledby'] ??
    (label !== undefined ? undefined : rest.placeholder ?? undefined);

  return (
    <div className="w-full">
      {label !== undefined && (
        <label
          htmlFor={labelId}
          className="mb-1 block font-body text-xs font-medium text-content-secondary"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={labelId}
          type={resolvedType}
          aria-label={ariaLabel}
          className={[
            'w-full rounded-xl border bg-surface-700/80 px-3 py-2',
            'font-body text-sm text-content-primary placeholder:text-content-tertiary',
            'transition-colors duration-base',
            error
              ? 'border-danger focus:border-danger focus:ring-1 focus:ring-danger'
              : 'border-surface-600 focus:border-accent-500 focus:ring-1 focus:ring-accent-500',
            'outline-none',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        />
        {type === 'password' && passwordToggle && (
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-content-tertiary hover:text-content-secondary"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <Icon name={showPassword ? 'eye-off' : 'eye'} className="h-5 w-5" />
          </button>
        )}
      </div>
      {error != null && (
        <p className="mt-1 font-body text-xs text-danger">{error}</p>
      )}
    </div>
  );
}