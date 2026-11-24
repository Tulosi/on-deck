import { Link, useLocation } from 'react-router-dom'
import { LogIn, LogOut, Settings } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import { SearchBox } from './SearchBox'

const iconButton = 'hit grid size-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-fg'

export function TopBar() {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()

  async function signOut() {
    await supabase?.auth.signOut()
    queryClient.clear()
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <Link to="/" className="hit md:hidden" aria-label="On Deck home">
        <Logo />
      </Link>

      <SearchBox />

      <div className="ml-auto flex items-center gap-1">
        <Link to="/settings" className={`${iconButton} md:hidden`} aria-label="Settings">
          <Settings className="size-[18px]" />
        </Link>

        {user ? (
          <>
            <NotificationBell />
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
          // Signed out: the sample-data note lives here instead of in a banner under the bar (it took a row of
          // its own on every page). Not on the Sign in page itself.
          !loading &&
          pathname !== '/login' && (
            <>
              <span className="mr-1 hidden text-xs text-muted sm:inline">Viewing sample data</span>
              <Link
                to="/login"
                className="hit flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-medium text-accent-fg hover:brightness-95"
              >
                <LogIn className="size-4" />
                Sign in
              </Link>
            </>
          )
        )}
      </div>
    </header>
  )
}
