import { Outlet } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'
import { BottomNav, Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppShell() {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {!isSupabaseConfigured && (
          <div className="border-b border-line bg-surface px-4 py-1.5 text-center font-mono text-[11px] text-muted md:px-6">
            PREVIEW MODE · sample data · connect Supabase to sign in and save
          </div>
        )}
        <main className="flex-1 px-4 py-6 pb-24 md:px-6 md:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
