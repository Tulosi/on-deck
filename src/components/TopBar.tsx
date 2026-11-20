import { Link } from 'react-router-dom'
import { LogIn, Moon, Search, Settings, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { Logo } from './Logo'

export function TopBar() {
  const { theme, toggle } = useTheme()

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <Link to="/" className="md:hidden" aria-label="On Deck home">
        <Logo />
      </Link>

      {/* Search is a placeholder: it will query TMDB / IGDB / Hardcover via Edge Functions. */}
      <label className="flex h-9 max-w-md flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm text-muted focus-within:border-accent">
        <Search className="size-4 shrink-0" />
        <input
          type="search"
          placeholder="Add a movie, show, game or book…"
          className="w-full bg-transparent text-fg outline-none placeholder:text-faint"
        />
      </label>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          className="grid size-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-fg"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>
        <Link
          to="/settings"
          className="grid size-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-fg md:hidden"
          aria-label="Settings"
        >
          <Settings className="size-[18px]" />
        </Link>
        <Link
          to="/login"
          className="hidden items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-fg hover:brightness-95 sm:flex"
        >
          <LogIn className="size-4" />
          Sign in
        </Link>
      </div>
    </header>
  )
}
