import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useScoreBackfill } from '../lib/library'
import { isSupabaseConfigured } from '../lib/supabase'
import { BottomNav, Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const bannerClass =
  'border-b border-line bg-surface px-4 py-1.5 text-center font-mono text-[11px] text-muted uppercase md:px-6'

export function AppShell() {
  const { user, loading } = useAuth()
  useScoreBackfill()
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
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
              to build your own deck
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
