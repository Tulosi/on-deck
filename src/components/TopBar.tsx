import { Link } from 'react-router-dom'
import { LogIn, LogOut, Moon, Settings, Sun } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import { Logo } from './Logo'
import { SearchBox } from './SearchBox'

const iconButton = 'grid size-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-fg'

export function TopBar() {
  const { theme, toggle } = useTheme()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  async function signOut() {
    await supabase?.auth.signOut()
    queryClient.clear()
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <Link to="/" className="md:hidden" aria-label="On Deck home">
        <Logo />
      </Link>

      <SearchBox />

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          className={iconButton}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>
        <Link to="/settings" className={`${iconButton} md:hidden`} aria-label="Settings">
          <Settings className="size-[18px]" />
        </Link>

        {user ? (
          <>
            <span
              title={user.email}
              className="ml-1 hidden size-8 place-items-center rounded-full bg-raised font-mono text-xs font-semibold text-accent-ink uppercase sm:grid"
            >
              {user.email?.[0] ?? '?'}
            </span>
            <button type="button" onClick={signOut} className={iconButton} aria-label="Sign out" title="Sign out">
              <LogOut className="size-[18px]" />
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="ml-1 flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:brightness-95"
            aria-label="Sign in"
          >
            <LogIn className="size-4" />
            <span className="hidden sm:inline">Sign in</span>
          </Link>
        )}
      </div>
    </header>
  )
}
