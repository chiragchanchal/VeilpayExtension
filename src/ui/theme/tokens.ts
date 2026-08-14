/**
 * Design tokens ported from the Veilpay mobile app.
 *
 * Source of truth for both the Tailwind config and any inline styles.
 * Colors here are the exact values recorded in the plan docs; the rest of the
 * amber ramp is derived so the accent stays consistent across surfaces.
 */

export const colors = {
  // Accent — amber. `500` is the verified brand accent.
  accent: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },

  // Dark surfaces — `900` is the verified base.
  surface: {
    900: '#0A0A0A',
    800: '#141414',
    700: '#1F1F1F',
    600: '#2A2A2A',
    500: '#3A3A3A',
  },

  // Light-mode surfaces
  light: {
    900: '#FFFFFF',
    800: '#FAFAFA',
    700: '#F4F4F5',
    600: '#E4E4E7',
    500: '#D4D4D8',
  },

  text: {
    primary: '#FAFAFA',
    secondary: '#A1A1AA',
    tertiary: '#71717A',
    inverse: '#0A0A0A',
  },

  // Semantic states
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
} as const;

export const fonts = {
  display: ['Manrope', 'system-ui', 'sans-serif'],
  body: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
} as const;

/** 4px base scale. Keys are the multiplier, values are rem. */
export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
} as const;

export const radii = {
  none: '0',
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.5rem',
  full: '9999px',
} as const;

/** Chrome caps popup width at 800px and height at 600px. */
export const popup = {
  width: 400,
  height: 600,
} as const;

export const motion = {
  fast: '120ms',
  base: '200ms',
  slow: '320ms',
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;
