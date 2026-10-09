/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        surface: 'var(--surface)',
        'surface-raised': 'var(--surface-raised)',
        'surface-hover': 'var(--surface-hover)',
        border: 'var(--border)',
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        'primary-foreground': 'var(--primary-foreground)',
        'secondary-foreground': 'var(--secondary-foreground)',
        success: 'var(--success)',
        'success-background': 'var(--success-background)',
        'status-watching': 'var(--status-watching)',
        'status-completed': 'var(--status-completed)',
        'status-planned': 'var(--status-planned)',
        focus: 'var(--focus-ring)',
        ink: 'var(--background)',
        panel: 'var(--surface)',
        muted: 'var(--secondary-foreground)',
        accent: 'var(--primary)',
        accentSecondary: 'var(--primary-hover)',
      },
      fontFamily: { sans: ['DM Sans', 'ui-sans-serif', 'system-ui'] },
    },
  },
  plugins: [],
}
