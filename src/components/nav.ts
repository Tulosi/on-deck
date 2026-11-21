import { BookOpen, CalendarClock, Film, Gamepad2, House, Layers, LibraryBig, Tv, type LucideIcon } from 'lucide-react'
import type { MediaType } from '../types'

export interface NavItem {
  label: string
  icon: LucideIcon
  /** Plain route… */
  to?: string
  /** …or a Library shortcut: the Library with this type selected (null = all types). */
  libraryType?: MediaType | null
  /** Shorter label for the phone tab bar. */
  short?: string
}

export const primaryNav: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { libraryType: null, label: 'Library', icon: LibraryBig },
  { libraryType: 'movie', label: 'Movies', icon: Film },
  { libraryType: 'tv', label: 'TV Shows', short: 'TV', icon: Tv },
  { libraryType: 'game', label: 'Games', icon: Gamepad2 },
  { libraryType: 'book', label: 'Books', icon: BookOpen },
  { to: '/calendar', label: 'Calendar', icon: CalendarClock },
  { to: '/collections', label: 'Collections', icon: Layers },
]

// ─── Phone tab bar ─────────────────────────────────────────────────────────

/** Everything that can be a phone tab, by key (also used by the sidebar layout). */
export const NAV_KEYS = ['home', 'library', 'movie', 'tv', 'game', 'book', 'waitlist', 'collections'] as const
export type NavKey = (typeof NAV_KEYS)[number]

export function navItem(key: NavKey): NavItem {
  switch (key) {
    case 'home':
      return primaryNav[0]
    case 'library':
      return primaryNav[1]
    case 'waitlist':
      return primaryNav.find((i) => i.to === '/calendar')!
    case 'collections':
      return primaryNav.find((i) => i.to === '/collections')!
    default:
      return primaryNav.find((i) => i.libraryType === key)!
  }
}

/** The phone bar shows up to this many chosen tabs, plus More. */
export const MAX_TABS = 5
/** Home on the left, then the four media types; Library, Calendar and Collections live under More. */
export const DEFAULT_TABS: NavKey[] = ['home', 'movie', 'tv', 'game', 'book']

/** The chosen tabs (saved order, known keys, at most MAX_TABS), or the default. */
export function tabsFrom(saved: string[] | undefined): NavKey[] {
  const valid = (saved ?? []).filter((k): k is NavKey => (NAV_KEYS as readonly string[]).includes(k))
  return saved && valid.length ? valid.slice(0, MAX_TABS) : DEFAULT_TABS
}
