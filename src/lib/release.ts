// Pre-release detection for movies and TV, from the TMDB data already stored on each title.
import type { Title } from '../types'

/** TMDB statuses that mean "not out yet". */
const UNRELEASED_STATUS = new Set(['Rumored', 'Planned', 'In Production', 'Post Production', 'Pilot'])

export interface ReleaseInfo {
  preRelease: boolean
  /** ISO date (YYYY-MM-DD) when known. */
  date?: string
  /** Whole days from today until the date (0 = today). */
  daysUntil?: number
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/**
 * A movie or show is pre-release when its release / first-air date is in the future, or when it has no
 * date yet and TMDB lists it as not released (Planned, In Production …). Games and books: not yet handled.
 */
export function releaseInfo(title: Title): ReleaseInfo {
  if (title.mediaType !== 'movie' && title.mediaType !== 'tv') return { preRelease: false }
  const date = title.releaseDate
  const today = todayIso()
  if (date) {
    if (date > today) return { preRelease: true, date, daysUntil: daysBetween(today, date) }
    return { preRelease: false, date }
  }
  const status = title.details?.status
  return { preRelease: typeof status === 'string' && UNRELEASED_STATUS.has(status) }
}

const monthDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Short poster label: "TODAY", "TOMORROW", "IN 12 DAYS", "DEC 18", "MAR 14 '27", or "TBA". */
export function releaseChip(info: ReleaseInfo): string {
  if (!info.date || info.daysUntil == null) return 'TBA'
  if (info.daysUntil === 0) return 'TODAY'
  if (info.daysUntil === 1) return 'TOMORROW'
  if (info.daysUntil <= 30) return `IN ${info.daysUntil} DAYS`
  const sameYear = info.date.slice(0, 4) === todayIso().slice(0, 4)
  return (sameYear ? monthDay(info.date) : `${monthDay(info.date)} '${info.date.slice(2, 4)}`).toUpperCase()
}

/** Long title-page label: "Dec 18, 2026 · in 28 days", or "Release date TBA". */
export function releaseLong(info: ReleaseInfo): string {
  if (!info.date || info.daysUntil == null) return 'Release date TBA'
  const full = new Date(`${info.date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const rel = info.daysUntil === 0 ? 'today' : info.daysUntil === 1 ? 'tomorrow' : `in ${info.daysUntil} days`
  return `${full} · ${rel}`
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
export function tvScheduleChip(s: TvSchedule): string {
  if (s.kind === 'airing') {
    if (s.daysUntil === 0) return 'NEW EP TODAY'
    if (s.daysUntil < 7) return `NEXT EP ${weekday(s.date)}`.toUpperCase()
    return `NEXT EP ${monthDay(s.date)}`.toUpperCase()
  }
  if (s.daysUntil === 0) return `S${s.season} TODAY`
  if (s.daysUntil <= 30) return `S${s.season} IN ${s.daysUntil} DAYS`
  const sameYear = s.date.slice(0, 4) === todayIso().slice(0, 4)
  return `S${s.season} · ${sameYear ? monthDay(s.date) : `${monthDay(s.date)} '${s.date.slice(2, 4)}`}`.toUpperCase()
}

/** Title-page badge text (after the "Airing" / "New season" label). */
export function tvScheduleLong(s: TvSchedule): string {
  const rel = s.daysUntil === 0 ? 'today' : s.daysUntil === 1 ? 'tomorrow' : `in ${s.daysUntil} days`
  if (s.kind === 'airing') {
    const when =
      s.daysUntil < 7
        ? `${weekday(s.date)}, ${monthDay(s.date)}`
        : new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    return `Next episode S${s.season} · E${s.episode} — ${when} · ${rel}`
  }
  const full = new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `Season ${s.season} premieres ${full} · ${rel}`
}
