// TV season helpers shared by the show page (StatusControls) and Home ("Finished recently").
import type { SeasonOverride, UserItem } from '../types'
import { todayIso } from './release'

export interface SeasonMeta {
  season_number: number
  episode_count: number
  name?: string
  air_date?: string | null
}

type Ep = { season_number?: number; episode_number?: number; air_date?: string | null }

/**
 * The first episode we can't yet show has aired, as { season, episode }, or null when everything listed has.
 * TMDB's "next episode" is the starting point, but it lags: on a premiere day it still names the episode airing
 * today (and a two-episode premiere leaves the second one unaccounted for). So an episode also counts as aired
 * when its air date has come (local date), when TMDB's last aired episode is at or past it, or when you've
 * watched it (Plex syncing S1E2 proves S1E2 is out).
 */
export function firstUnaired(item: UserItem): { season: number; episode: number } | null {
  const d = item.title.details ?? {}
  const next = d.next_episode_to_air as Ep | null | undefined
  if (next?.season_number == null) return null
  let season = next.season_number
  let episode = next.episode_number ?? 1
  const passIf = (at: { season: number; episode: number } | null | undefined) => {
    if (at && (at.season > season || (at.season === season && at.episode >= episode))) {
      season = at.season
      episode = at.episode + 1
    }
  }
  if (next.air_date && next.air_date <= todayIso()) passIf({ season, episode })
  const last = d.last_episode_to_air as Ep | null | undefined
  if (last?.season_number != null && last.episode_number != null) passIf({ season: last.season_number, episode: last.episode_number })
  passIf(item.tvProgress)
  return { season, episode }
}

/** True when what TMDB calls the next episode has already aired by the evidence above (its data is a day behind). */
export function nextIsStale(item: UserItem): boolean {
  const next = item.title.details?.next_episode_to_air as Ep | null | undefined
  const f = firstUnaired(item)
  return !!next?.season_number && !!f && (f.season !== next.season_number || f.episode !== (next.episode_number ?? 1))
}

/**
 * Episodes aired so far in a season. Finished seasons count in full; the current season counts up to the first
 * episode not known to have aired (see firstUnaired); seasons that haven't started don't count.
 */
export function airedCounter(item: UserItem) {
  const first = firstUnaired(item)
  const today = todayIso()
  const at = item.tvProgress
  return (s: SeasonMeta) => {
    // Never fewer than you've watched: that's proof they're out.
    const seen = at && at.season === s.season_number ? at.episode : at && at.season > s.season_number ? s.episode_count : 0
    if (first) {
      if (s.season_number === first.season) return Math.max(seen, first.episode - 1)
      if (s.season_number > first.season) return seen
    }
    if (s.air_date && s.air_date > today) return seen
    return Math.max(seen, s.episode_count)
  }
}

export const overrideOf = (item: UserItem, season: number): SeasonOverride | 'auto' =>
  item.seasonOverrides?.[String(season)] ?? 'auto'

/** Watched episodes in one season: overrides win; "auto" follows the Progress pointer. */
export function watchedIn(item: UserItem, s: SeasonMeta, aired: number): number {
  const o = overrideOf(item, s.season_number)
  if (o === 'watched') return aired
  if (o === 'unwatched' || o === 'ignored') return 0
  const at = item.tvProgress
  if (!at) return 0
  return s.season_number < at.season ? aired : s.season_number === at.season ? Math.min(at.episode, aired) : 0
}

/**
 * Real seasons (specials excluded) with their episode counts, from the title's TMDB details.
 * The stored counts can lag behind an airing season, so the next announced episode, or your own progress, raises it.
 */
export function seasonsOf(item: UserItem): SeasonMeta[] {
  const raw = item.title.details?.seasons
  if (!Array.isArray(raw)) return []
  const next = item.title.details?.next_episode_to_air as { season_number?: number; episode_number?: number } | null
  const at = item.tvProgress
  // Raise a lagging count to the next announced episode, or to what you've watched.
  const atLeast = (s: SeasonMeta) =>
    Math.max(
      s.episode_count,
      next?.season_number === s.season_number ? (next.episode_number ?? 0) : 0,
      at?.season === s.season_number ? at.episode : 0,
    )
  return (raw as SeasonMeta[])
    .filter((s) => s.season_number > 0)
    .map((s) => (atLeast(s) > s.episode_count ? { ...s, episode_count: atLeast(s) } : s))
    .filter((s) => s.episode_count > 0)
}

/** Seasons you've fully watched (aired episodes all watched, not ignored), oldest first. */
export function finishedSeasons(item: UserItem): number[] {
  const seasons = seasonsOf(item)
  const airedIn = airedCounter(item)
  return seasons
    .filter((s) => {
      const n = airedIn(s)
      if (n === 0 || n < s.episode_count) return false // not fully aired yet
      if (overrideOf(item, s.season_number) === 'ignored') return false
      return watchedIn(item, s, n) >= n
    })
    .map((s) => s.season_number)
}

/**
 * Watched / ignored / aired episodes across the show. Ignored seasons stay in the total and count as
 * done, but are reported separately so the bar can show them in their own colour.
 */
export function completion(item: UserItem, seasons: SeasonMeta[]): { watched: number; ignored: number; aired: number } {
  const airedIn = airedCounter(item)
  let watched = 0
  let ignored = 0
  let aired = 0
  for (const s of seasons) {
    const n = airedIn(s)
    aired += n
    if (overrideOf(item, s.season_number) === 'ignored') ignored += n
    else watched += watchedIn(item, s, n)
  }
  return { watched, ignored, aired }
}

/** TMDB statuses for shows that will get more episodes. */
const ONGOING = new Set(['Returning Series', 'In Production', 'Planned', 'Pilot'])

/** Will this show get more episodes? (Ongoing status, or a next episode is announced.) */
export function isOngoing(item: UserItem): boolean {
  const d = item.title.details ?? {}
  return ONGOING.has(String(d.status ?? '')) || !!(d.next_episode_to_air as { air_date?: string } | null)?.air_date
}

/** Every episode aired so far is watched (or in an ignored season). False when nothing has aired. */
export function allAiredWatched(item: UserItem): boolean {
  if (item.title.mediaType !== 'tv') return false
  const seasons = seasonsOf(item)
  if (seasons.length === 0) return false
  const c = completion(item, seasons)
  return c.aired > 0 && c.watched + c.ignored >= c.aired
}
