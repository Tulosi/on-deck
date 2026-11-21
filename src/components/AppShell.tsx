import { usePlexBackgroundSync } from '../lib/plexSync'
import { useSmartCollectionSync } from '../lib/collections'
import { useTimezoneSync } from '../lib/notifications'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useAvailabilityRefresh, usePriceRefresh, useRenewalCheck, useScoreBackfill } from '../lib/library'
import { useSteamOwnershipCheck } from '../lib/steam'
import { isSupabaseConfigured } from '../lib/supabase'
import { BottomNav } from './BottomNav'
import { Sidebar } from './Sidebar'
import { Toolbar } from './Toolbar'
import { TopBar } from './TopBar'

/** Browsing pages get the toolbar row (display options now; filters and sorting later). */
const TOOLBAR_PATHS = ['/', '/library', '/collections']

const bannerClass =
  'border-b border-line bg-surface px-4 py-1.5 text-center font-mono text-[11px] text-muted uppercase md:px-6'

export function AppShell() {
  const { user, loading } = useAuth()
  useScoreBackfill()
  useRenewalCheck()
  useAvailabilityRefresh()
  usePriceRefresh()
  useSteamOwnershipCheck()
  useTimezoneSync()
  useSmartCollectionSync()
  usePlexBackgroundSync()
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {TOOLBAR_PATHS.includes(pathname) && <Toolbar />}
        {!isSupabaseConfigured ? (
          <div className={bannerClass}>PREVIEW MODE · sample data · connect Supabase to sign in and save</div>
        ) : (
          !loading &&
          !user && (
            <div className={bannerClass}>
              SAMPLE DATA ·{' '}
              <Link to="/login" className="text-accent-ink hover:underline">
                sign in
              </Link>{' '}
              to build your own library
            </div>
          )
        )}
        <main className="flex-1 px-4 py-6 pb-24 md:px-6 md:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
