import { colors, fonts, spacing, radii, motion } from './src/ui/theme/tokens.ts';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        accent: colors.accent,
        /**
         * Semantic aliases.
         *
         * Surfaces were written against `accent-primary` / `error` / `surface-base`
         * before those names existed in the theme, so the classes compiled to
         * nothing: the active-tab highlight and every approval icon circle were
         * invisible, and error text rendered in the default colour. Defining the
         * names here repairs every existing usage at once and keeps the semantic
         * layer available for new work.
         */
        'accent-primary': colors.accent[500],
        'accent-secondary': colors.accent[400],
        surface: colors.surface,
        'surface-base': colors.surface[900],
        light: colors.light,
        content: colors.text,
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
        error: colors.danger,
        info: colors.info,
      },
      fontFamily: {
        display: fonts.display,
        body: fonts.body,
        mono: fonts.mono,
      },
      spacing,
      borderRadius: radii,
      transitionDuration: {
        fast: motion.fast,
        base: motion.base,
        slow: motion.slow,
      },
      boxShadow: {
        card: '0 1px 2px rgba(0, 0, 0, 0.3)',
        raised: '0 8px 24px -12px rgba(0, 0, 0, 0.6)',
        accent: '0 8px 24px -10px rgba(245, 158, 11, 0.5)',
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in-up': `fade-in-up ${motion.base} ${motion.ease} both`,
        'fade-in': `fade-in ${motion.base} ${motion.ease} both`,
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
};
