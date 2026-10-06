import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const THEME_STORAGE_KEY = 'kitsu-theme'

function getInitialTheme() {
  try { return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark' }
  catch { return 'dark' }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f4f7' : '#101014')
    try { localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* Storage may be disabled; keep the in-memory preference. */ }
  }, [theme])
  const toggleTheme = () => setTheme(current => current === 'dark' ? 'light' : 'dark')
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
