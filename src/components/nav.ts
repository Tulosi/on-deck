import { BookOpen, Film, Gamepad2, House, Layers, LibraryBig, Tv, type LucideIcon } from 'lucide-react'
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
  { to: '/collections', label: 'Collections', icon: Layers },
]
