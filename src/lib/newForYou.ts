// Home → "New for you": what changed since your previous visit (docs/HOME.md §2).
// Sources: the alerts the daily job writes (released, premieres, now available, price drops; notify-switch
// independent, so it reads them all) plus new episodes, worked out here from each show's last aired episode.
import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { useNotifications, type Notification } from './notifications'
import { todayIso } from './release'
import { supabase } from './supabase'
import type { UserItem } from '../types'

export interface NewEntry {
  item: UserItem
  /** Short reason shown under the poster: "S2 · E8 out", "Now on Plex", "Released" … */
  label: string
  /** Higher = stronger; one card per title, strongest reason wins. */
  rank: number
  at: string
}

// ── "Since" = the previous visit to Home. Read once per app session, then the stored value moves to now. ──

let sessionSince: string | null = null
let sessionLoaded = false
const listeners = new Set<(s: string) => void>()

/** The moment "New for you" counts from, plus `clear()` to empty the row for this session. */
export function useNewSince(): { since: string | null; clear: () => void } {
  const { user } = useAuth()
  const [since, setSince] = useState<string | null>(sessionSince)

  useEffect(() => {
    listeners.add(setSince)
    return () => {
      listeners.delete(setSince)
    }
  }, [])

  useEffect(() => {
    if (!user || !supabase || sessionLoaded) return
    sessionLoaded = true
    void (async () => {
      const { data } = await supabase!.from('profiles').select('last_seen_home_at').eq('user_id', user.id).maybeSingle()
      // First visit ever: show the last 7 days.
      const prev = (data?.last_seen_home_at as string | null) ?? new Date(Date.now() - 7 * 86_400_000).toISOString()
      sessionSince = prev
      listeners.forEach((l) => l(prev))
      await supabase!.from('profiles').update({ last_seen_home_at: new Date().toISOString() }).eq('user_id', user.id)
    })()
  }, [user])

  const clear = () => {
    sessionSince = new Date().toISOString()
    listeners.forEach((l) => l(sessionSince!))
  }
  return { since, clear }
}

// ── Building the row ──

const RANK = { released: 60, premiere: 55, available: 50, episode: 40, price_low: 30, price_deal: 25, announced: 20 }

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
    case 'price_low':
      return { label: 'Lowest price ever', rank: RANK.price_low }
    case 'price_deal': {
      const pct = msg.match(/^(\d+)% off/)?.[1]
      return { label: pct ? `${pct}% off` : 'On sale', rank: RANK.price_deal }
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

/**
 * Entries for "New for you", strongest first. `since` = previous visit (ISO). Dropped titles are left out.
 * New episodes: shows In Progress, or Wanted and caught up, whose last aired episode is after `since`.
 */
export function newForYou(items: UserItem[], notifications: Notification[], since: string): NewEntry[] {
  const byTitle = new Map(items.filter((i) => i.progress !== 'dropped').map((i) => [i.title.id, i]))
  const best = new Map<string, NewEntry>()
  const offer = (e: NewEntry) => {
    const cur = best.get(e.item.id)
    if (!cur || e.rank > cur.rank || (e.rank === cur.rank && e.at > cur.at)) best.set(e.item.id, e)
  }

  for (const n of notifications) {
    if (!n.titleId || n.createdAt <= since) continue
    const item = byTitle.get(n.titleId)
    const r = fromNotification(n)
    if (item && r) offer({ item, ...r, at: n.createdAt })
  }

  // New episodes (episodes never create alerts).
  const sinceDay = since.slice(0, 10)
  const today = todayIso()
  for (const item of byTitle.values()) {
    if (item.title.mediaType !== 'tv') continue
    if (item.progress !== 'in_progress' && item.progress !== 'wanted') continue
    const d = item.title.details ?? {}
    const last = d.last_episode_to_air as { air_date?: string; season_number?: number; episode_number?: number } | null | undefined
    const aired = last?.air_date ?? (typeof d.last_air_date === 'string' ? d.last_air_date : undefined)
    if (!aired || aired <= sinceDay || aired > today) continue
    // Wanted shows only count once you've started them (caught up, waiting for more).
    if (item.progress === 'wanted' && !item.tvProgress) continue
    const premiere = last?.episode_number === 1
    const label =
      last?.season_number != null && last.episode_number != null
        ? premiere
          ? `Season ${last.season_number} premiered`
          : `S${last.season_number} · E${last.episode_number} out`
        : 'New episode'
    offer({ item, label, rank: premiere ? RANK.premiere : RANK.episode, at: `${aired}T12:00:00Z` })
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
