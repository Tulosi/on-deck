// Sidebar order, rearranged by drag and drop (or Alt + ↑/↓). Saved to profiles.nav_layout when signed in,
// kept in this browser otherwise. Three independent sections, so nothing crosses the divider:
//   main: Home · Library (with its types) · Calendar (key 'waitlist')      types: order of Movies / TV / Games / Books
//   collections: your collections, below the divider
//   tabs: the phone tab bar's chosen tabs, in order (the rest go under More)
//   hidden: default collections the user has hidden (Waitlist, Early Access, Deals)
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import { useProfile, useUpdateProfile } from './integrations'

export type Section = 'main' | 'types' | 'collections' | 'tabs' | 'hidden'
export type NavLayout = Partial<Record<Section, string[]>>

export const DEFAULT_MAIN = ['home', 'library', 'waitlist']
export const DEFAULT_TYPES = ['movie', 'tv', 'game', 'book']
const LOCAL_KEY = 'ondeck.navLayout'

/** Saved order first (known keys only), then anything new in its default position. */
export function ordered(keys: string[], saved: string[] | undefined): string[] {
  const known = (saved ?? []).filter((k) => keys.includes(k))
  return [...known, ...keys.filter((k) => !known.includes(k))]
}

/** Moves `key` to sit before `beforeKey` (null = to the end). */
export function moveTo(list: string[], key: string, beforeKey: string | null): string[] {
  const rest = list.filter((k) => k !== key)
  const at = beforeKey == null ? rest.length : rest.indexOf(beforeKey)
  rest.splice(at < 0 ? rest.length : at, 0, key)
  return rest
}

/** Moves `key` one place up (-1) or down (+1). */
export function nudge(list: string[], key: string, by: -1 | 1): string[] {
  const i = list.indexOf(key)
  const j = i + by
  if (i < 0 || j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

function readLocal(): NavLayout {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as NavLayout
  } catch {
    return {}
  }
}

const LOCAL_QUERY = ['nav-layout-local']

/**
 * Current layout + a saver for one section's new order. The layout lives in the React Query cache (the
 * profile when signed in, a local entry when signed out), so the sidebar, tab bar and Settings all update
 * together the moment anything moves.
 */
export function useNavLayout(): [NavLayout, (section: Section, order: string[]) => void] {
  const { user } = useAuth()
  const profile = useProfile()
  const update = useUpdateProfile()
  const queryClient = useQueryClient()
  const local = useQuery({ queryKey: LOCAL_QUERY, queryFn: readLocal, staleTime: Infinity, enabled: !user })

  const layout: NavLayout = user ? ((profile.data?.nav_layout as NavLayout | undefined) ?? {}) : (local.data ?? {})

  const save = (section: Section, order: string[]) => {
    const next = { ...layout, [section]: order }
    if (!user) {
      queryClient.setQueryData(LOCAL_QUERY, next)
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
      } catch {
        // remembering is optional
      }
      return
    }
    // Show it everywhere straight away, then save.
    queryClient.setQueryData(['profile', user.id], (p: Record<string, unknown> | undefined) => (p ? { ...p, nav_layout: next } : p))
    void update({ nav_layout: next })
  }
  return [layout, save]
}
