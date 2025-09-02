import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand blues (kept), plus tokenized palette using CSS variables for central control
        brand: {
          50: '#f3f7ff',
          100: '#e6effe',
          200: '#c9ddfd',
          300: '#9ec2fb',
          400: '#6b9ff8',
          500: '#3d7af2',
          600: '#275fe0',
          700: '#214cc0',
          800: '#1e409b',
          900: '#1d387d',
        },
        // Theming tokens using rgb(var(--token) / <alpha>) so utilities are solid and support opacity
        background: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        surface2: 'rgb(var(--color-surface-2) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        foreground: 'rgb(var(--color-fg) / <alpha-value>)',
        muted: 'rgb(var(--color-fg-muted) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        accentFg: 'rgb(var(--color-accent-fg) / <alpha-value>)',
      },
      boxShadow: {
        soft: '0 10px 25px -10px rgba(0,0,0,0.15)',
      },
      borderRadius: {
        xl: '1rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
