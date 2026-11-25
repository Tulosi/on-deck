import { usePlexBackgroundSync } from '../lib/plexSync'
import { useSmartCollectionSync } from '../lib/collections'
import { useTimezoneSync } from '../lib/notifications'
import { Suspense, ViewTransition } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAvailabilityRefresh, usePriceRefresh, useRenewalCheck, useScoreBackfill } from '../lib/library'
import { useSteamOwnershipCheck } from '../lib/steam'
import { isSupabaseConfigured } from '../lib/supabase'
import { BottomNav } from './BottomNav'
import { PageSkeleton } from './LazyPage'
import { Toaster } from './Toaster'
import { ShortcutsSheet } from './ShortcutsSheet'
import { PickForMe } from './PickForMe'
import { useScrollMemory } from '../lib/useScrollMemory'
import { useRouteFocus } from '../lib/useRouteFocus'
import { useLibraryCache } from '../lib/libraryCache'
import { Sidebar } from './Sidebar'
import { Toolbar } from './Toolbar'
import { TopBar } from './TopBar'

/** Browsing pages get the toolbar row (display options now; filters and sorting later). */
// (Not Collections: its list doesn't filter by type, so the pills there did nothing.)
const TOOLBAR_PATHS = ['/', '/library']

const bannerClass =
  'border-b border-line bg-surface px-4 py-1.5 text-center text-xs text-muted md:px-6'

export function AppShell() {
  useScoreBackfill()
  useRenewalCheck()
  useAvailabilityRefresh()
  usePriceRefresh()
  useSteamOwnershipCheck()
  useTimezoneSync()
  useSmartCollectionSync()
  usePlexBackgroundSync()
  useScrollMemory()
  useRouteFocus()
  useLibraryCache()
  const { pathname } = useLocation()
  // The sign-in page stands alone: no sidebar or tab bar to pull you away mid-sign-in.
  const bare = pathname === '/login'
  return (
    <div className="flex min-h-dvh">
      {/* First stop for Tab: past the sidebar and search, to the page's heading (or the page itself). */}
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          const target = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main')
          if (!target) return
          if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
          target.focus()
        }}
        className="sr-only rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      {!bare && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {TOOLBAR_PATHS.includes(pathname) && <Toolbar />}
        {/* Signed out, the top bar says it's sample data; this note is only for a build without Supabase. */}
        {!isSupabaseConfigured && (
          <div className={bannerClass}>Preview with sample data. Connect Supabase to sign in and save.</div>
        )}
        <main id="main" className="flex-1 px-4 py-6 pb-24 md:px-6 md:pb-10">
          {/* Keyed by path so a slow page never leaves the previous one's placeholder up. */}
          {/* A quick fade as each page arrives (and when a page's code finishes loading); the skeleton just goes. */}
          <Suspense key={pathname} fallback={<ViewTransition default="none"><PageSkeleton /></ViewTransition>}>
            <ViewTransition enter="page-in" exit="none" default="none">
              <Outlet />
            </ViewTransition>
          </Suspense>
        </main>
      </div>
      {!bare && <BottomNav />}
      <Toaster />
      <ShortcutsSheet />
      <PickForMe />
    </div>
  )
}
