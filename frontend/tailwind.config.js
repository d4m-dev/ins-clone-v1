/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Instagram palette
        ig: {
          blue: '#0095f6',
          blueHover: '#1877f2',
          red: '#ed4956',
          pink: '#e1306c',
          purple: '#833ab4',
          orange: '#fd9d3c',
          yellow: '#fcaf45',
        },
        ink: {
          DEFAULT: '#262626',
          soft: '#8e8e8e',
          faint: '#c7c7c7',
          line: '#dbdbdb',
          bg: '#fafafa',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      maxWidth: {
        feed: '470px',
        shell: '975px',
      },
      aspectRatio: {
        square: '1 / 1',
      },
      keyframes: {
        'heart-pop': {
          '0%': { transform: 'scale(0.4)', opacity: '0' },
          '50%': { transform: 'scale(1.15)', opacity: '0.9' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'heart-pop': 'heart-pop 320ms ease-out',
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 220ms ease-out',
      },
    },
  },
  plugins: [],
};
