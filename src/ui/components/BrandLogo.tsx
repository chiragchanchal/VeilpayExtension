import type { JSX } from 'react';
import logoIcon from '@/ui/assets/icons/logo.svg';

/**
 * Brand logo for in-app headers. Renders the bundled Veilpay logo SVG
 * (`mainlogo.svg` from the brand kit), sized for the header (`md`) or the
 * welcome screen (`lg`).
 */
export function BrandLogo({
  size = 'md',
  className = '',
}: {
  /** `md` for headers, `lg` for the welcome screen. */
  size?: 'md' | 'lg';
  className?: string;
}): JSX.Element {
  const dims = size === 'lg' ? 'h-16 w-16' : 'h-7 w-7';
  return (
    <img
      src={logoIcon}
      alt="Veilpay"
      className={`${dims} object-contain ${className}`}
    />
  );
}
