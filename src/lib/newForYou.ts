// Home → "New for you": what changed since your previous visit (docs/HOME.md §2).
// Sources: the alerts the daily job writes (released, premieres, now available, date news; notify-switch
// independent, so it reads them all) plus new episodes, worked out here from each show's last aired episode.
// Price alerts are left out: the Deals row right below shows current sales, and a game sitting at its low
// would otherwise come back after every Clear.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import { useNotifications, type Notification } from './notifications'
import { episodeCode, todayIso } from './release'
import { supabase } from './supabase'
import { toast, undoable } from './toast'
import type { UserItem } from '../types'

export interface NewEntry {
  item: UserItem
  /** Short reason shown under the poster: "S02E08 out", "Now on Plex", "Released" … */
  label: string
  /** Higher = stronger; one card per title, strongest reason wins. */
  rank: number
  at: string
}

// ── "Since" = 7 days ago, or when you last pressed Clear if that's later. Visiting Home doesn't reset it. ──

const WEEK = 7 * 86_400_000

const weekAgo = () => new Date(Date.now() - WEEK).toISOString()
const sinceFrom = (cleared: string | null) => {
  const w = weekAgo()
  return cleared && cleared > w ? cleared : w
}

/** Cards dismissed one at a time: user item id → when (ISO). */
export type Dismissed = Record<string, string>

/** Dismissals still inside the row's window (older ones can't hide anything any more). */
const prune = (d: Dismissed): Dismissed => {
  const w = weekAgo()
  return Object.fromEntries(Object.entries(d).filter(([, at]) => typeof at === 'string' && at > w))
}

interface Seen {
  cleared: string | null
  dismissed: Dismissed
}

/**
 * The moment "New for you" counts from, the cards dismissed one by one, plus `clear()` (Clear all) and `dismiss()`
 * (one card, with Undo), both saved to the profile. Read again whenever the app comes back to the front, so what you
 * cleared on another device (or before the app was reopened) holds here too. Signed out (sample library), they only
 * last for this visit.
 */
export function useNewSince(): { since: string | null; cleared: string | null; dismissed: Dismissed; clear: () => void; dismiss: (item: UserItem) => void } {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = ['new-cleared', user?.id ?? null]
  const q = useQuery({
    queryKey,
    enabled: !!user && !!supabase,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Seen> => {
      // last_seen_home_at now means "row cleared at".
      const { data, error } = await supabase!.from('profiles').select('last_seen_home_at, new_dismissed').eq('user_id', user!.id).maybeSingle()
      if (error) throw error
      return { cleared: (data?.last_seen_home_at as string | null) ?? null, dismissed: (data?.new_dismissed as Dismissed | null) ?? {} }
    },
  })
  const current = () => queryClient.getQueryData<Seen>(queryKey) ?? { cleared: null, dismissed: {} }

  const clear = () => {
    const at = new Date().toISOString()
    const prev = current()
    void (async () => {
      // A read already on its way would put the old time back.
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData<Seen>(queryKey, { ...current(), cleared: at })
      if (!user || !supabase) return
      const { error } = await supabase.from('profiles').update({ last_seen_home_at: at }).eq('user_id', user.id)
      if (error) {
        queryClient.setQueryData<Seen>(queryKey, { ...current(), cleared: prev.cleared })
        toast({ message: 'Couldn’t clear New for you. Try again.', tone: 'error' })
      }
    })()
  }

  const dismiss = (item: UserItem) => {
    const at = new Date().toISOString()
    const set = (fn: (d: Dismissed) => Dismissed) => queryClient.setQueryData<Seen>(queryKey, (s) => ({ ...(s ?? { cleared: null, dismissed: {} }), dismissed: fn(s?.dismissed ?? {}) }))
    undoable({
      message: `${item.title.title} removed from New for you`,
      key: `new:${item.id}`,
      hide: () => {
        void queryClient.cancelQueries({ queryKey })
        set((d) => ({ ...d, [item.id]: at }))
      },
      commit: async () => {
        if (!user || !supabase) return
        // Merge into what's saved now, so a dismissal from another device (or one still waiting on its Undo) isn't lost.
        const { data, error } = await supabase.from('profiles').select('new_dismissed').eq('user_id', user.id).maybeSingle()
        if (error) throw error
        const next = prune({ ...((data?.new_dismissed as Dismissed | null) ?? {}), [item.id]: at })
        const { error: e2 } = await supabase.from('profiles').update({ new_dismissed: next }).eq('user_id', user.id)
        if (e2) throw e2
      },
      restore: () =>
        set((d) => {
          const { [item.id]: _, ...rest } = d
          return rest
        }),
    })
  }

  const loaded = q.data !== undefined || q.isError
  return { since: loaded ? sinceFrom(q.data?.cleared ?? null) : null, cleared: q.data?.cleared ?? null, dismissed: q.data?.dismissed ?? {}, clear, dismiss }
}

// ── Building the row ──

const RANK = { released: 60, premiere: 55, available: 50, episode: 40, announced: 20 }

function fromNotification(n: Notification): { label: string; rank: number } | null {
  const msg = n.message
  switch (n.kind) {
    case 'release_day': {
      if (/^Season \d+ premieres today/.test(msg)) return { label: msg.match(/^Season \d+/)![0] + ' premiered', rank: RANK.premiere }
      if (msg.startsWith('Premieres today')) return { label: 'Premiered', rank: RANK.premiere }
      if (msg.startsWith('Early Access')) return { label: 'Early Access is out', rank: RANK.released }
      if (msg.startsWith('1.0')) return { label: '1.0 is out', rank: RANK.released }
      if (msg.startsWith('Published')) return { label: 'Published', rank: RANK.released }
      return { label: 'Released', rank: RANK.released }
    }
    case 'available': {
      const where = msg.match(/^Now available on (.+?):/)?.[1]
      return { label: where ? `Now on ${where}` : 'Now available', rank: RANK.available }
    }
    case 'announced':
    case 'date_changed': {
      const m = msg.match(/: (Season \d+ premiere|Release|Full release \(1\.0\)|Early Access launch|Series premiere) (announced|date set|moved)/)
      if (!m) return null
      return { label: m[2] === 'moved' ? 'Date moved' : m[1].startsWith('Season') ? 'New season dated' : 'Date announced', rank: RANK.announced }
    }
    default:
      return null
  }
}

/** Has this show been marked watched up to (at least) this episode? */
function reached(item: UserItem, season: number, episode: number): boolean {
  const p = item.tvProgress
  return !!p && (p.season > season || (p.season === season && p.episode >= episode))
}

/**
 * Entries for "New for you", strongest first. `since` = 7 days ago or the last Clear (ISO). Dropped titles are left out,
 * and so are cards dismissed one by one (`dismissed`) until there's news dated after the dismissal.
 * New episodes: shows In Progress, or Wanted and caught up, whose last aired episode is after `since`.
 * Shows: a card goes only once that episode is marked watched (a season premiere alert: that season's first
 * episode). Other titles: once you've acted on them after the news (status change, Steam play: last activity).
 */
export function newForYou(items: UserItem[], notifications: Notification[], since: string, dismissed: Dismissed = {}): NewEntry[] {
  const byTitle = new Map(items.filter((i) => i.progress !== 'dropped').map((i) => [i.title.id, i]))
  const best = new Map<string, NewEntry>()
  const offer = (e: NewEntry) => {
    // Dismissed on its own: only news dated after that brings it back.
    const gone = dismissed[e.item.id]
    if (gone && e.at <= gone) return
    // Shows leave only when that episode is marked (checked where the entry is made); other titles on any activity.
    if (e.item.title.mediaType !== 'tv' && e.item.lastActivityAt && e.item.lastActivityAt > e.at) return
    const cur = best.get(e.item.id)
    if (!cur || e.rank > cur.rank || (e.rank === cur.rank && e.at > cur.at)) best.set(e.item.id, e)
  }

  for (const n of notifications) {
    if (!n.titleId || n.createdAt <= since) continue
    const item = byTitle.get(n.titleId)
    const r = fromNotification(n)
    if (!item || !r) continue
    // A premiere alert goes once that season's first episode is marked (a series premiere: S1 E1).
    const season = n.kind === 'release_day' ? (n.message.startsWith('Premieres today') ? 1 : Number(n.message.match(/^Season (\d+) premieres today/)?.[1])) : 0
    if (season && reached(item, season, 1)) continue
    offer({ item, ...r, at: n.createdAt })
  }

  // New episodes (episodes never create alerts).
  const sinceDay = since.slice(0, 10)
  const today = todayIso()
  for (const item of byTitle.values()) {
    if (item.title.mediaType !== 'tv') continue
    if (item.progress !== 'in_progress' && item.progress !== 'caught_up' && item.progress !== 'wanted') continue
    const d = item.title.details ?? {}
    const last = d.last_episode_to_air as { air_date?: string; season_number?: number; episode_number?: number } | null | undefined
    const aired = last?.air_date ?? (typeof d.last_air_date === 'string' ? d.last_air_date : undefined)
    if (!aired || aired <= sinceDay || aired > today) continue
    // Wanted shows only count once you've started them (caught up, waiting for more).
    if (item.progress === 'wanted' && !item.tvProgress) continue
    if (last?.season_number != null && last.episode_number != null && reached(item, last.season_number, last.episode_number)) continue
    const premiere = last?.episode_number === 1
    const label =
      last?.season_number != null && last.episode_number != null
        ? premiere
          ? `Season ${last.season_number} premiered`
          : `${episodeCode({ season: last.season_number, episode: last.episode_number })} out`
        : 'New episode'
    offer({ item, label, rank: premiere ? RANK.premiere : RANK.episode, at: `${aired}T00:00:00Z` })
  }

  return [...best.values()].sort((a, b) => b.rank - a.rank || b.at.localeCompare(a.at))
}

/** Hook for Home: entries for the given (type-filtered) items. */
export function useNewForYou(items: UserItem[], sample = false) {
  const { since, cleared, dismissed, clear, dismiss } = useNewSince()
  const { data: notifications = [] } = useNotifications()
  // The sample library has no notifications, so it shows a fixed pair until Clear all.
  const entries = sample
    ? cleared
      ? []
      : sampleNewForYou(items).filter((e) => !dismissed[e.item.id])
    : since
      ? newForYou(items, notifications, since, dismissed)
      : []
  return { entries, clear, dismiss, since }
}

/** Two believable "new for you" reasons from the sample titles, so the sandbox shows the row. */
const SAMPLE_NEW: [title: string, label: string, rank: number][] = [
  ['Saltmarsh Keepers', 'Early Access is out', RANK.released],
  ['Low Orbit', 'New season dated', RANK.announced],
]
function sampleNewForYou(items: UserItem[]): NewEntry[] {
  const at = new Date().toISOString()
  return SAMPLE_NEW.flatMap(([t, label, rank]) => {
    const item = items.find((i) => i.title.title === t)
    return item ? [{ item, label, rank, at }] : []
  })
}
