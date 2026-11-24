import { Link, useLocation } from 'react-router-dom'
import { LogIn, LogOut, Settings } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { useSampleCardOpen } from '../lib/sampleCard'
import { supabase } from '../lib/supabase'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import { SearchBox } from './SearchBox'

const iconButton = 'hit grid size-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-fg'

export function TopBar() {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  // Home's sample card has its own Sign in; one lemon one is enough.
  const cardOpen = useSampleCardOpen()
  const quiet = pathname === '/' && cardOpen
  // The sign-in page keeps only the logo: no search or Settings to pull you away mid-sign-in.
  const bare = pathname === '/login'

  async function signOut() {
    await supabase?.auth.signOut()
    queryClient.clear()
  }

  return (
    <header className="vt-chrome-top sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <Link to="/" className={bare ? 'hit' : 'hit md:hidden'} aria-label="On Deck home">
        <Logo />
      </Link>

      {!bare && <SearchBox />}

      <div className="ml-auto flex items-center gap-1">
        <Link to="/settings" className={`${iconButton} md:hidden`} aria-label="Settings" hidden={bare}>
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
              <span className="mr-1 hidden text-xs text-muted sm:inline">Trying the sample library</span>
              <Link
                to="/login"
                className={
                  quiet
                    ? 'hit flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-medium text-fg hover:border-faint'
                    : 'hit flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-medium text-accent-fg hover:brightness-95'
                }
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
