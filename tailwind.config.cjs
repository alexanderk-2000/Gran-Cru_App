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
        burgundy: {
          DEFAULT: '#6D071A',
          dark: '#4A0404',
          light: '#8E1B31',
          mist: 'rgba(109, 7, 26, 0.1)'
        },
        alabaster: {
          DEFAULT: '#F9F7F2',
          dark: '#F0EBE0'
        },
        charcoal: {
          DEFAULT: '#282325',
          soft: '#454042'
        },
        stone: {
          gray: '#888585'
        },
        gold: {
          DEFAULT: '#C5A065',
          bright: '#D4AF37',
          dim: '#996515'
        },
        sage: {
          DEFAULT: '#758E78',
          light: '#E8EFE9'
        }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'],
        sans: ['Inter', 'sans-serif']
      },
      boxShadow: {
        premium: '0 10px 30px -10px rgba(40, 35, 37, 0.08)',
        'gold-glow': '0 0 15px rgba(197, 160, 101, 0.3)',
        'burgundy-glow': '0 0 20px rgba(109, 7, 26, 0.15)'
      }
    }
  },
  plugins: []
};
