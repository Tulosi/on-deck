// Home rows — "what's next, and what's changed" (docs/HOME.md). Step 1: Continue, This week, Ready to start,
// computed from data the app already has. "New for you", stored availability and Deals come later.
import { isAvailable } from './filters'
import { releaseInfo, tvSchedule } from './release'
import type { UserItem } from '../types'

const DAY = 86_400_000
const todayIso = () => new Date().toISOString().slice(0, 10)
const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
const monthDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

interface SeasonMeta {
  season_number: number
  episode_count: number
}

const seasonsOf = (item: UserItem): SeasonMeta[] =>
  Array.isArray(item.title.details?.seasons)
    ? (item.title.details!.seasons as SeasonMeta[]).filter((s) => s.season_number > 0 && s.episode_count > 0)
    : []

/** TV: the episode after "Progress", or the first episode if nothing is watched yet. */
function nextEpisode(item: UserItem): { season: number; episode: number } | null {
  const seasons = seasonsOf(item)
  if (seasons.length === 0) return null
  const at = item.tvProgress
  if (!at) return { season: seasons[0].season_number, episode: 1 }
  const cur = seasons.find((s) => s.season_number === at.season)
  if (cur && at.episode < cur.episode_count) return { season: at.season, episode: at.episode + 1 }
  const later = seasons.find((s) => s.season_number > at.season)
  return later ? { season: later.season_number, episode: 1 } : null
}

/**
 * Has this episode aired? It's out if it comes before TMDB's next announced episode; it's the announced one →
 * its air date; after it → not out. With no announced episode, everything listed has aired.
 */
function airState(item: UserItem, ep: { season: number; episode: number }): { out: boolean; date?: string } {
  const next = item.title.details?.next_episode_to_air as
    | { season_number?: number; episode_number?: number; air_date?: string }
    | null
    | undefined
  if (!next?.season_number || !next.episode_number) return { out: true }
  const before =
    ep.season < next.season_number || (ep.season === next.season_number && ep.episode < next.episode_number)
  if (before) return { out: true }
  const isNext = ep.season === next.season_number && ep.episode === next.episode_number
  if (isNext && next.air_date && next.air_date <= todayIso()) return { out: true }
  return { out: false, date: isNext ? next.air_date : undefined }
}

/** Continue-row subline: the next concrete step. */
export function continueLine(item: UserItem): string | undefined {
  if (item.title.mediaType !== 'tv') return undefined
  // No season data (e.g. sample titles) → keep the card's usual "S2 · E4" line rather than guess.
  if (seasonsOf(item).length === 0) return undefined
  const ep = nextEpisode(item)
  if (!ep) return 'Caught up'
  const label = `S${ep.season} · E${ep.episode}`
  const state = airState(item, ep)
  if (state.out) return `${label} — out now`
  if (state.date) {
    const days = Math.round((Date.parse(`${state.date}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / DAY)
    return `${label} — ${days < 7 ? weekday(state.date) : monthDay(state.date)}`
  }
  return `Caught up · ${label} not announced`
}

/** 1. Continue — in progress, most recently touched first. */
export function continueItems(items: UserItem[]): UserItem[] {
  return items
    .filter((i) => i.progress === 'in_progress')
    .sort((a, b) => Date.parse(b.updatedAt ?? '0') - Date.parse(a.updatedAt ?? '0'))
}

export interface Upcoming {
  item: UserItem
  date: string
  daysUntil: number
  label: string
}

/** 2. This week — releases, premieres and new episodes in the next 7 days (shows you haven't dropped). */
export function thisWeek(items: UserItem[]): Upcoming[] {
  const out: Upcoming[] = []
  for (const item of items) {
    if (item.progress === 'dropped') continue
    const rel = releaseInfo(item.title)
    if (rel.preRelease && rel.date && rel.daysUntil != null && rel.daysUntil <= 7) {
      out.push({ item, date: rel.date, daysUntil: rel.daysUntil, label: item.title.mediaType === 'tv' ? 'Premiere' : 'Release' })
      continue
    }
    const sched = tvSchedule(item.title)
    if (sched && sched.daysUntil <= 7) {
      out.push({
        item,
        date: sched.date,
        daysUntil: sched.daysUntil,
        label: sched.kind === 'airing' ? `S${sched.season} · E${sched.episode}` : `Season ${sched.season} premiere`,
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** This-week subline: "Today · S2 · E8", "Wed · Release" … */
export function thisWeekLine(u: Upcoming): string {
  const when = u.daysUntil === 0 ? 'Today' : u.daysUntil === 1 ? 'Tomorrow' : weekday(u.date)
  return `${when} · ${u.label}`
}

/**
 * 3. Ready to start — High-priority Wanted titles you can start now: out, and available (movies/TV on your
 * Plex or streaming services; games/books In Your Library). Movies/TV not checked yet are kept, so the row
 * isn't empty before the first availability refresh.
 */
export function readyToStart(items: UserItem[]): UserItem[] {
  return items
    .filter((i) => i.progress === 'wanted' && i.priority === 'high' && !releaseInfo(i.title).preRelease)
    .filter((i) => isAvailable(i) !== false)
    .sort((a, b) => Date.parse(b.addedAt ?? '0') - Date.parse(a.addedAt ?? '0'))
    .slice(0, 10)
}
