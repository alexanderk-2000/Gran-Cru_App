/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './domain/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // Primary accent. Use sparingly: primary actions, active nav, "Überreif".
        burgundy: {
          DEFAULT: '#6D071A',
          dark: '#4A0404',
          light: '#8E1B31',
          mist: 'rgba(109, 7, 26, 0.1)',
          tint: '#F3E6E8',
          wash: '#FCF6F7'
        },
        // Ground and surfaces
        alabaster: {
          DEFAULT: '#F9F7F2',
          dark: '#F0EBE0'
        },
        sand: {
          DEFAULT: '#F2EEE6'
        },
        line: {
          DEFAULT: '#E6E0D4',
          strong: '#D5CDBE',
          soft: '#EFEAE0'
        },
        // Ink
        charcoal: {
          DEFAULT: '#282325',
          soft: '#4A4446'
        },
        // Muted text — passes 4.5:1 on alabaster and white
        stone: {
          gray: '#6B6566'
        },
        // Gold is a fill/marker colour; `gold-dim` is the readable text tone
        gold: {
          DEFAULT: '#C5A065',
          bright: '#D4AF37',
          dim: '#73521A',
          tint: '#F5EEDF',
          bar: '#D9C49C'
        },
        // Maturity: drink now. DEFAULT is readable as text, `bar` is the chart fill
        sage: {
          DEFAULT: '#2F5A3A',
          bar: '#5E8B67',
          light: '#E8EFE9'
        }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'],
        sans: ['Inter', 'sans-serif']
      },
      boxShadow: {
        premium: '0 1px 2px rgba(40, 35, 37, 0.04)',
        'gold-glow': 'none',
        'burgundy-glow': 'none'
      }
    }
  },
  plugins: []
};
