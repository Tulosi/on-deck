// Upcoming releases for one title: pre-release dates, season premieres and the next announced episode.
// Plain TypeScript with no Deno or browser APIs. It's shared by the app (Waitlist + Calendar) and the
// `calendar` Edge Function (the .ics feed), so both always agree. See docs/SPEC.md → Waitlist & calendar.

/** How exact a release date is. Only `day` dates get countdowns and calendar entries. */
export type Precision = 'day' | 'month' | 'quarter' | 'year' | 'tbd'

export interface ReleaseInput {
  mediaType: 'movie' | 'tv' | 'game' | 'book'
  releaseDate?: string | null
  /** The title's stored metadata (TMDB / IGDB details). */
  details?: Record<string, unknown> | null
}

export interface ReleaseEvent {
  /**
   * release = movie / game / book out; early_access = a game's Early Access launch; full_release = a game's
   * 1.0 after Early Access; premiere = a new show's first episode; season = new season; episode = next episode.
   */
  kind: 'release' | 'early_access' | 'full_release' | 'premiere' | 'season' | 'episode'
  /** ISO YYYY-MM-DD. For fuzzy dates it's the source's stand-in date, used only for ordering. Null = TBA. */
  date: string | null
  precision: Precision
  /** "March 2027", "Q2 2027", "2027" — how to show a fuzzy date. */
  fuzzyLabel?: string
  season?: number
  episode?: number
}

/** TMDB / IGDB statuses that mean "not out yet". */
export const UNRELEASED_STATUS = new Set(['Rumored', 'Planned', 'In Production', 'Post Production', 'Pilot', 'Upcoming'])

const PRECISIONS = new Set<string>(['day', 'month', 'quarter', 'year', 'tbd'])

/** A game's stored release milestone (igdb function → metadata.release_milestones). */
interface Milestone {
  kind: 'early_access' | 'release'
  date: string | null
  precision: Precision
  label: string | null
}

/** Last day a fuzzy date could mean: "Q2 2027" → 2027-06-30. Exact dates are returned as-is. */
export function periodEnd(iso: string, precision: Precision): string {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  if (precision === 'month') return lastDay(y, m)
  if (precision === 'quarter') return lastDay(y, Math.ceil(m / 3) * 3)
  if (precision === 'year') return `${y}-12-31`
  return iso
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000)
}

/** Every upcoming event for a title, soonest first. `today` is YYYY-MM-DD in the viewer's time zone. */
export function upcomingEvents(t: ReleaseInput, today: string): ReleaseEvent[] {
  const d = t.details ?? {}
  const out: ReleaseEvent[] = []

  // 1a. Games with IGDB milestones: Early Access launch and full release (1.0), each when still to come.
  const milestones = Array.isArray(d.release_milestones) ? (d.release_milestones as Milestone[]) : []
  if (t.mediaType === 'game' && milestones.length) {
    const hadEarlyAccess = milestones.some((m) => m.kind === 'early_access')
    for (const m of milestones) {
      const precision: Precision = m.date && PRECISIONS.has(m.precision) ? m.precision : 'tbd'
      if (m.date && periodEnd(m.date, precision) < today) continue // already happened
      out.push({
        kind: m.kind === 'early_access' ? 'early_access' : hadEarlyAccess ? 'full_release' : 'release',
        date: m.date,
        precision,
        fuzzyLabel: precision !== 'day' && precision !== 'tbd' && m.label ? m.label : undefined,
      })
    }
    return out
  }

  // 1b. Not out yet: the release (movie/game) or premiere (show).
  const rawPrecision = typeof d.release_precision === 'string' && PRECISIONS.has(d.release_precision) ? d.release_precision : 'day'
  const precision = (t.releaseDate ? rawPrecision : 'tbd') as Precision
  const unreleasedStatus = typeof d.status === 'string' && UNRELEASED_STATUS.has(d.status)
  const preRelease = t.releaseDate ? t.releaseDate >= today || (precision !== 'day' && unreleasedStatus) : unreleasedStatus
  if (preRelease) {
    out.push({
      kind: t.mediaType === 'tv' ? 'premiere' : 'release',
      date: t.releaseDate ?? null,
      precision,
      fuzzyLabel: precision !== 'day' && typeof d.release_label === 'string' ? d.release_label : undefined,
    })
  }

  // 2. Shows: the next announced episode (episode 1 = a new season). Skipped when it's the premiere itself.
  if (t.mediaType === 'tv') {
    const next = d.next_episode_to_air as { air_date?: string; season_number?: number; episode_number?: number } | null
    if (next?.air_date && next.season_number != null && next.episode_number != null && next.air_date >= today) {
      const isPremiere = preRelease && next.season_number === 1 && next.episode_number === 1
      if (!isPremiere) {
        out.push({
          kind: next.episode_number === 1 ? 'season' : 'episode',
          date: next.air_date,
          precision: 'day',
          season: next.season_number,
          episode: next.episode_number,
        })
      }
    }
  }
  return out
}

/** Short event name: "Release", "Series premiere", "Season 3 premiere", "S2 · E8". */
export function eventLabel(e: ReleaseEvent): string {
  switch (e.kind) {
    case 'release':
      return 'Release'
    case 'early_access':
      return 'Early Access launch'
    case 'full_release':
      return 'Full release (1.0)'
    case 'premiere':
      return 'Series premiere'
    case 'season':
      return `Season ${e.season} premiere`
    case 'episode':
      return `S${e.season} · E${e.episode}`
  }
}

/** Sort key: exact dates by date, then fuzzy dates by their stand-in date, then TBA. */
export function compareEvents(a: ReleaseEvent, b: ReleaseEvent): number {
  const rank = (e: ReleaseEvent) => (e.date == null ? 2 : e.precision === 'day' || e.precision === 'month' ? 0 : 1)
  return rank(a) - rank(b) || (a.date ?? '').localeCompare(b.date ?? '')
}

// ─── Calendar feed filters ─────────────────────────────────────────────────

/**
 * What a calendar feed includes (the feed URL's `only` parameter):
 *  - new (default): new movies, series and season premieres, game launches (Early Access and 1.0) and book
 *    releases. No individual episodes.
 *  - all: everything, including the next episode of airing shows.
 *  - movie / tv / game / book: everything for one type.
 */
export type FeedFilter = 'new' | 'all' | 'movie' | 'tv' | 'game' | 'book'
export const FEED_FILTERS: FeedFilter[] = ['new', 'all', 'movie', 'tv', 'game', 'book']

export function inFeed(filter: FeedFilter, mediaType: ReleaseInput['mediaType'], e: ReleaseEvent): boolean {
  if (filter === 'all') return true
  if (filter === 'new') return e.kind !== 'episode'
  return mediaType === filter
}
