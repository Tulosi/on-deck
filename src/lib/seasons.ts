// TV season helpers shared by the show page (StatusControls) and Home ("Finished recently").
import type { SeasonOverride, UserItem } from '../types'

export interface SeasonMeta {
  season_number: number
  episode_count: number
  name?: string
  air_date?: string | null
}

/**
 * Episodes aired so far vs. watched, assuming episodes are watched in order (so "Watched up to S2 · E3"
 * counts every aired episode before it). Aired = finished seasons in full, plus the current season up to
 * the episode before the next announced one; seasons that haven't started don't count.
 */
export function airedCounter(item: UserItem) {
  const next = item.title.details?.next_episode_to_air as { season_number?: number; episode_number?: number } | null
  const today = new Date().toISOString().slice(0, 10)
  return (s: SeasonMeta) => {
    if (next?.season_number != null) {
      if (s.season_number === next.season_number) return Math.max(0, (next.episode_number ?? 1) - 1)
      if (s.season_number > next.season_number) return 0
    }
    if (s.air_date && s.air_date > today) return 0
    return s.episode_count
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
 * The stored counts can lag behind an airing season, so the next announced episode raises its count.
 */
export function seasonsOf(item: UserItem): SeasonMeta[] {
  const raw = item.title.details?.seasons
  if (!Array.isArray(raw)) return []
  const next = item.title.details?.next_episode_to_air as { season_number?: number; episode_number?: number } | null
  return (raw as SeasonMeta[])
    .filter((s) => s.season_number > 0)
    .map((s) =>
      next?.season_number === s.season_number && (next.episode_number ?? 0) > s.episode_count
        ? { ...s, episode_count: next.episode_number! }
        : s,
    )
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
