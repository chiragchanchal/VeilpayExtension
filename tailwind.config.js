import { colors, fonts, spacing, radii, motion } from './src/ui/theme/tokens.ts';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        accent: colors.accent,
        surface: colors.surface,
        light: colors.light,
        content: colors.text,
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
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
    },
  },
  plugins: [],
};
