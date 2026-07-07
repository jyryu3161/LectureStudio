import type { Config } from 'tailwindcss';

// Design tokens extracted from ref/design.zip (Lecture Studio mockups).
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'Instrument Sans', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Source Serif 4', 'serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        rail: '#16181c',
        canvas: '#ececea',
        paper: '#fbfbfa',
        ink: '#16181c',
        accent: {
          DEFAULT: '#43507e',
          hover: '#2a3358',
        },
        selection: '#dfe2f0',
        border: {
          DEFAULT: '#e6e6e1',
          subtle: '#e9e9e5',
        },
        muted: {
          DEFAULT: '#5c6069',
          foreground: '#4b4f57',
        },
      },
      borderRadius: {
        sm: '10px',
        md: '12px',
        lg: '18px',
      },
      boxShadow: {
        soft: '0 24px 60px -30px rgba(20, 22, 28, 0.28)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
