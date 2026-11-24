// Pre-release detection for movies, TV and games, from the data already stored on each title.
import type { Title } from '../types'
import { UNRELEASED_STATUS, type Precision } from '../../supabase/functions/_shared/releases.ts'

export interface ReleaseInfo {
  preRelease: boolean
  /** ISO date (YYYY-MM-DD) when known. For fuzzy dates (see precision) it's only a stand-in. */
  date?: string
  /** Whole days from today until the date (0 = today). Only for exact dates. */
  daysUntil?: number
  precision?: Precision
  /** "March 2027", "Q2 2027", "2027" for fuzzy dates. */
  fuzzyLabel?: string
}

/** Today in the viewer's time zone (YYYY-MM-DD). */
export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/**
 * A title is pre-release when its release / first-air date is in the future, or when it has no date yet (or
 * only a fuzzy one, like "2027") and TMDB / IGDB / Hardcover lists it as not released.
 */
export function releaseInfo(title: Title): ReleaseInfo {
  const date = title.releaseDate
  const today = todayIso()
  const status = title.details?.status
  const unreleased = typeof status === 'string' && UNRELEASED_STATUS.has(status)
  const p = title.details?.release_precision
  const precision: Precision = typeof p === 'string' ? (p as Precision) : 'day'
  if (date && precision !== 'day') {
    const label = typeof title.details?.release_label === 'string' ? title.details.release_label : undefined
    return { preRelease: date > today || unreleased, date, precision, fuzzyLabel: label }
  }
  if (date) {
    if (date > today) return { preRelease: true, date, daysUntil: daysBetween(today, date), precision: 'day' }
    return { preRelease: false, date, precision: 'day' }
  }
  return { preRelease: unreleased, precision: 'tbd' }
}

const monthDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Short poster label: "TODAY", "TOMORROW", "IN 12 DAYS", "DEC 18", "MAR 14 '27", or "TBA". */
export function releaseChip(info: ReleaseInfo): string {
  if (info.fuzzyLabel) return info.fuzzyLabel
  if (!info.date || info.daysUntil == null) return 'TBA'
  if (info.daysUntil === 0) return 'Today'
  if (info.daysUntil === 1) return 'Tomorrow'
  if (info.daysUntil <= 30) return `In ${info.daysUntil} days`
  const sameYear = info.date.slice(0, 4) === todayIso().slice(0, 4)
  return sameYear ? monthDay(info.date) : `${monthDay(info.date)} '${info.date.slice(2, 4)}`
}

/** Long title-page label: "Dec 18, 2026, in 28 days", or "Release date TBA". */
export function releaseLong(info: ReleaseInfo): string {
  if (info.fuzzyLabel) return `${info.fuzzyLabel}, exact date not announced`
  if (!info.date || info.daysUntil == null) return 'Release date TBA'
  const full = new Date(`${info.date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const rel = info.daysUntil === 0 ? 'today' : info.daysUntil === 1 ? 'tomorrow' : `in ${info.daysUntil} days`
  return `${full} (${rel})`
}

// ─── TV schedule: airing now / new season coming ───────────────────────────

export interface TvSchedule {
  kind: 'airing' | 'new-season'
  season: number
  episode: number
  date: string
  daysUntil: number
}

/**
 * For released shows with an announced next episode (TMDB next_episode_to_air, on or after today):
 * episode 1 → a new season is coming; any other episode → the current season is airing.
 */
export function tvSchedule(title: Title): TvSchedule | null {
  if (title.mediaType !== 'tv') return null
  const next = title.details?.next_episode_to_air as
    | { air_date?: string; season_number?: number; episode_number?: number }
    | null
    | undefined
  if (!next?.air_date || next.season_number == null || next.episode_number == null) return null
  const today = todayIso()
  if (next.air_date < today) return null // stale; refreshed on the next library load
  return {
    kind: next.episode_number === 1 ? 'new-season' : 'airing',
    season: next.season_number,
    episode: next.episode_number,
    date: next.air_date,
    daysUntil: daysBetween(today, next.air_date),
  }
}

const weekday = (iso: string, style: 'short' | 'long' = 'short') =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: style })

/** Poster chip: "NEW EP TODAY", "NEXT EP WED", "NEXT EP DEC 3"; "S3 IN 12 DAYS", "S3 · MAR 14". */
/**
 * Poster chip text. `short` fits one line on a narrow poster (3 across on a phone): "S6 in 15d", "S1 today".
 * The long form is for wider posters: "Season 6 in 15 days".
 */
export function tvScheduleChip(s: TvSchedule, short = false): string {
  if (s.kind === 'airing') {
    if (s.daysUntil === 0) return short ? 'New ep today' : 'New episode today'
    if (s.daysUntil < 7) return `Next ep ${weekday(s.date)}`
    return `Next ep ${monthDay(s.date)}`
  }
  const season = short ? `S${s.season}` : `Season ${s.season}`
  if (s.daysUntil === 0) return `${season} today`
  if (s.daysUntil <= 30) return short ? `${season} in ${s.daysUntil}d` : `${season} in ${s.daysUntil} days`
  const sameYear = s.date.slice(0, 4) === todayIso().slice(0, 4)
  const when = sameYear ? monthDay(s.date) : `${monthDay(s.date)} '${s.date.slice(2, 4)}`
  return short ? `${season} ${when}` : `${season}, ${when}`
}

/** Title-page badge text (after the "Airing" / "New season" label). */
/** Episode code as people write it in file names and on Plex: S02E05. */
export const episodeCode = (ep: { season: number; episode: number }) =>
  `S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')}`

export function tvScheduleLong(s: TvSchedule): string {
  const rel = s.daysUntil === 0 ? 'today' : s.daysUntil === 1 ? 'tomorrow' : `in ${s.daysUntil} days`
  if (s.kind === 'airing') {
    const when =
      s.daysUntil < 7
        ? `${weekday(s.date)}, ${monthDay(s.date)}`
        : new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    return `Next episode ${episodeCode(s)}, ${when} (${rel})`
  }
  const full = new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `Season ${s.season} premieres ${full} (${rel})`
}
