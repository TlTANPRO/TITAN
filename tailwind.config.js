/** @type {import('tailwindcss').Config} */
// V36: Single source of truth — colors read CSS vars from tokens.css (OKLCH).
// No hardcoded hex. Light/dark both work via tokens.css :root / html:not(.dark).
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // V36: <alpha-value> placeholder so Tailwind opacity modifiers
        // (bg-accent-primary/30 etc.) work with CSS var colors.
        bg: {
          primary: 'rgb(var(--bg-canvas-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--bg-surface-rgb) / <alpha-value>)',
          tertiary: 'rgb(var(--bg-surface-raised-rgb) / <alpha-value>)',
          elevated: 'rgb(var(--bg-surface-overlay-rgb) / <alpha-value>)',
          hover: 'rgb(var(--bg-hover-rgb) / <alpha-value>)'
        },
        text: {
          primary: 'rgb(var(--text-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
          muted: 'rgb(var(--text-muted-rgb) / <alpha-value>)',
          disabled: 'rgb(var(--text-disabled-rgb) / <alpha-value>)'
        },
        accent: {
          primary: 'rgb(var(--accent-primary-rgb) / <alpha-value>)',
          'primary-hover': 'rgb(var(--accent-primary-hover-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--accent-secondary-rgb) / <alpha-value>)',
          brand: 'rgb(var(--accent-brand-rgb) / <alpha-value>)',
          success: 'rgb(var(--status-success-rgb) / <alpha-value>)',
          warning: 'rgb(var(--status-warning-rgb) / <alpha-value>)',
          danger: 'rgb(var(--status-danger-rgb) / <alpha-value>)',
          info: 'rgb(var(--status-info-rgb) / <alpha-value>)',
          instagram: 'rgb(var(--platform-instagram-rgb) / <alpha-value>)',
          tiktok: 'rgb(var(--platform-tiktok-rgb) / <alpha-value>)'
        },
        border: {
          subtle: 'rgb(var(--border-subtle-rgb) / <alpha-value>)',
          default: 'rgb(var(--border-default-rgb) / <alpha-value>)',
          strong: 'rgb(var(--border-strong-rgb) / <alpha-value>)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace']
      },
      fontSize: {
        'display-2xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'display-xl': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.025em' }],
        'display-lg': ['2.75rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }]
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite'
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' }
        }
      }
    }
  },
  plugins: []
};
