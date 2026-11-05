/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        page: token('page'),
        surface: token('surface'),
        ink: {
          DEFAULT: token('ink'),
          2: token('ink-2'),
          3: token('ink-3'),
        },
        line: token('line'),
        brand: {
          DEFAULT: token('brand'),
          ink: token('brand-ink'),
        },
        series: {
          1: token('series-1'),
        },
        good: token('good'),
        warning: token('warning'),
        serious: token('serious'),
        critical: {
          DEFAULT: token('critical'),
          text: token('critical-text'),
        },
      },
    },
  },
  plugins: [],
};
