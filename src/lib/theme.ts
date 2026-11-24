import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'ondeck.theme'

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // The browser / phone status bar follows the page background.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f2ec' : '#0c0b0a')
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // storage unavailable (private mode) — theme just won't persist
    }
  }, [theme])

  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }
}
