/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1565C0', light: '#42A5F5' },
        success: '#2E7D32',
        warning: '#FB8C00',
        danger: '#D32F2F',
        bgapp: '#F5F7FA',
        bgdark: '#0F172A',
        border: '#E5E7EB',
        textprimary: '#111827',
        textsecondary: '#6B7280',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
        cardhover: '0 4px 12px rgba(0,0,0,0.1)',
      }
    },
  },
  plugins: [],
}
