// Home → "New for you": what changed since your previous visit (docs/HOME.md §2).
// Sources: the alerts the daily job writes (released, premieres, now available, date news; notify-switch
// independent, so it reads them all) plus new episodes, worked out here from each show's last aired episode.
// Price alerts are left out: the Deals row right below shows current sales, and a game sitting at its low
// would otherwise come back after every Clear.
import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { useNotifications, type Notification } from './notifications'
import { episodeCode, todayIso } from './release'
import { supabase } from './supabase'
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
let clearedAt: string | null = null
let clearedLoaded = false
const listeners = new Set<(s: string | null) => void>()

const weekAgo = () => new Date(Date.now() - WEEK).toISOString()
const sinceFrom = (cleared: string | null) => {
  const w = weekAgo()
  return cleared && cleared > w ? cleared : w
}

/** The moment "New for you" counts from, plus `clear()` to empty the row (saved to the profile). */
export function useNewSince(): { since: string | null; clear: () => void } {
  const { user } = useAuth()
  const [cleared, setCleared] = useState<string | null>(clearedAt)
  const [loaded, setLoaded] = useState(clearedLoaded)

  useEffect(() => {
    const l = (c: string | null) => {
      setCleared(c)
      setLoaded(true)
    }
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  useEffect(() => {
    if (!user || !supabase || clearedLoaded) return
    clearedLoaded = true
    void (async () => {
      // last_seen_home_at now means "row cleared at".
      const { data } = await supabase!.from('profiles').select('last_seen_home_at').eq('user_id', user.id).maybeSingle()
      clearedAt = (data?.last_seen_home_at as string | null) ?? null
      listeners.forEach((l) => l(clearedAt))
    })()
  }, [user])

  const clear = () => {
    clearedAt = new Date().toISOString()
    listeners.forEach((l) => l(clearedAt))
    if (user && supabase) void supabase.from('profiles').update({ last_seen_home_at: clearedAt }).eq('user_id', user.id)
  }
  return { since: loaded ? sinceFrom(cleared) : null, clear }
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
 * Entries for "New for you", strongest first. `since` = 7 days ago or the last Clear (ISO). Dropped titles are left out.
 * New episodes: shows In Progress, or Wanted and caught up, whose last aired episode is after `since`.
 * Shows: a card goes only once that episode is marked watched (a season premiere alert: that season's first
 * episode). Other titles: once you've acted on them after the news (status change, Steam play: last activity).
 */
export function newForYou(items: UserItem[], notifications: Notification[], since: string): NewEntry[] {
  const byTitle = new Map(items.filter((i) => i.progress !== 'dropped').map((i) => [i.title.id, i]))
  const best = new Map<string, NewEntry>()
  const offer = (e: NewEntry) => {
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
    // A season premiere alert goes once that season's first episode is marked.
    const season = Number(n.message.match(/^Season (\d+) premieres today/)?.[1])
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
export function useNewForYou(items: UserItem[]) {
  const { since, clear } = useNewSince()
  const { data: notifications = [] } = useNotifications()
  const entries = since ? newForYou(items, notifications, since) : []
  return { entries, clear, since }
}
