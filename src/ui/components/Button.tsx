import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-accent-400 to-accent-500 text-surface-900 hover:from-accent-300 hover:to-accent-400 active:from-accent-500 active:to-accent-600 shadow-[0_4px_14px_-4px_rgba(245,158,11,0.5)]',
  secondary:
    'border border-surface-600 bg-surface-700 text-content-primary hover:bg-surface-600 active:bg-surface-500',
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-80',
  ghost:
    'bg-transparent text-content-secondary hover:bg-surface-700 hover:text-content-primary',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  children,
  className = '',
  ...rest
}: Props) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2',
        'font-body font-semibold',
        'transition-colors duration-base',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
