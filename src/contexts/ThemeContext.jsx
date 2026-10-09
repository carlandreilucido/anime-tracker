import { createContext, useContext, useEffect, useRef, useState } from 'react'

const ThemeContext = createContext(null)
const THEME_STORAGE_KEY = 'kitsu-theme'

function getSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch { return null }
}

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function getInitialTheme() {
  return getSavedTheme() || systemTheme()
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)
  const hasUserPreference = useRef(Boolean(getSavedTheme()))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#F8FAFC' : '#0B0D14')
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: light)')
    const updateFromSystem = event => {
      if (!hasUserPreference.current) setTheme(event.matches ? 'light' : 'dark')
    }
    const handleStorage = event => {
      if (event.key !== THEME_STORAGE_KEY) return
      hasUserPreference.current = event.newValue === 'light' || event.newValue === 'dark'
      setTheme(hasUserPreference.current ? event.newValue : systemTheme())
    }
    if (media?.addEventListener) media.addEventListener('change', updateFromSystem)
    else media?.addListener?.(updateFromSystem)
    window.addEventListener('storage', handleStorage)
    return () => {
      if (media?.removeEventListener) media.removeEventListener('change', updateFromSystem)
      else media?.removeListener?.(updateFromSystem)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    hasUserPreference.current = true
    setTheme(next)
    try { localStorage.setItem(THEME_STORAGE_KEY, next) } catch { /* Keep the choice in memory if storage is disabled. */ }
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
