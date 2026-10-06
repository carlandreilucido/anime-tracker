import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const Icon = theme === 'dark' ? Sun : Moon
  return <button className="icon-btn theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${nextTheme} mode`} aria-pressed={theme === 'light'} title={`Switch to ${nextTheme} mode`}><Icon size={18}/></button>
}
