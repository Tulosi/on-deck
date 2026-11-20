import { BookOpen, Film, Gamepad2, House, Layers, Tv, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const primaryNav: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/tv', label: 'TV Shows', icon: Tv },
  { to: '/games', label: 'Games', icon: Gamepad2 },
  { to: '/books', label: 'Books', icon: BookOpen },
  { to: '/collections', label: 'Collections', icon: Layers },
]
