import type { JSX } from 'react';
import checkIcon from '@/ui/assets/icons/check.svg';
import lockIcon from '@/ui/assets/icons/lock.svg';
import wandIcon from '@/ui/assets/icons/wand.svg';
import linkIcon from '@/ui/assets/icons/link.svg';
import keyIcon from '@/ui/assets/icons/key.svg';
import cardIcon from '@/ui/assets/icons/card.svg';
import sendIcon from '@/ui/assets/icons/send.svg';
import warningIcon from '@/ui/assets/icons/warning.svg';
import emptyIcon from '@/ui/assets/icons/empty.svg';
import eyeIcon from '@/ui/assets/icons/eye.svg';
import spinnerIcon from '@/ui/assets/icons/spinner.svg';
import errorIcon from '@/ui/assets/icons/error.svg';

/**
 * Brand icon set. Each entry is the URL of an SVG asset from `src/ui/assets/icons/`
 * (the gold-gradient icons generated for Veilpay). Rendered as an <img> so the
 * SVG keeps its own gradients. Sizing is controlled by the caller via className.
 */
const ASSETS: Record<string, string> = {
  shield: checkIcon, // fallback-brand mark (not currently used by default)
  check: checkIcon,
  lock: lockIcon,
  wand: wandIcon,
  link: linkIcon,
  key: keyIcon,
  card: cardIcon,
  send: sendIcon,
  sign: keyIcon,
  warning: warningIcon,
  empty: emptyIcon,
  error: errorIcon,
  'eye-off': eyeIcon,
  eye: eyeIcon,
  spinner: spinnerIcon,
};

export type IconName = keyof typeof ASSETS;

export interface IconProps {
  /** Which SVG icon to render. */
  name: IconName;
  /** Tailwind size/color classes, e.g. `h-5 w-5`. Defaults to `h-5 w-5`. */
  className?: string;
  /** Accessible label. */
  label?: string;
}

export function Icon({ name, className = 'h-5 w-5', label }: IconProps): JSX.Element {
  return (
    <img
      src={ASSETS[name]}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      className={className}
    />
  );
}
