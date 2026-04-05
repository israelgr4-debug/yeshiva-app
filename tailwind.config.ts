import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        sidebar: '#1e293b',
        accent: {
          green: '#16a34a',
          red: '#dc2626',
        },
      },
      fontFamily: {
        hebrew: ['Arial', 'David', 'Miriam', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
  i18n: {
    defaultLocale: 'he',
    locales: ['he'],
  },
};
export default config;
