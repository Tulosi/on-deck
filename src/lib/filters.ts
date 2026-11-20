// Library filtering, sorting and grouping — all state lives in the URL (see docs/FILTERING.md).
//
//   /library?type=tv&status=wanted,in_progress&score=70&release=released&genre=Drama&sort=score&group=status
//
// Layer 1: type (single-select; absent = all). Layer 2: cross-category filters (any type).
// Layer 3: type-specific filters — only read when that type is selected.
// Within one filter values are OR'd; different filters are AND'd. Include only (no exclude).
import { releaseInfo, tvSchedule } from './release'
import type { MediaType, Priority, Progress, UserItem } from '../types'

export const TYPES: MediaType[] = ['movie', 'tv', 'game', 'book']

export type RatingFilter = 'liked' | 'disliked' | 'favourite' | 'unrated'
export type ReleaseFilter = 'released' | 'upcoming'
export type AddedFilter = '7d' | '30d' | '90d' | '365d'
export type TvStatusFilter = 'airing' | 'returning' | 'ended' | 'cancelled'
export type TvProgressFilter = 'not_started' | 'midway' | 'caught_up'
export type SortKey = 'priority' | 'added' | 'release' | 'score' | 'title' | 'updated'
export type GroupKey = 'none' | 'status' | 'type' | 'priority' | 'year'

export interface Filters {
  type: MediaType | null
  // Layer 2
  status: Progress[]
  priority: (Priority | 'none')[]
  rating: RatingFilter[]
  /** Minimum normalised score 0–100, or null for any. */
  minScore: number | null
  release: ReleaseFilter[]
  yearFrom: number | null
  yearTo: number | null
  added: AddedFilter | null
  // Layer 3 (Movies / TV for now)
  genre: string[]
  tvStatus: TvStatusFilter[]
  tvProgress: TvProgressFilter[]
  // Arranging
  sort: SortKey
  group: GroupKey
}

const list = <T extends string>(v: string | null, allowed: readonly T[]): T[] =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x): x is T => (allowed as readonly string[]).includes(x))
const int = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null)

const STATUS: Progress[] = ['wanted', 'in_progress', 'completed', 'dropped']
const PRIORITY: (Priority | 'none')[] = ['high', 'medium', 'low', 'none']
const RATING: RatingFilter[] = ['liked', 'disliked', 'favourite', 'unrated']
const RELEASE: ReleaseFilter[] = ['released', 'upcoming']
const ADDED: AddedFilter[] = ['7d', '30d', '90d', '365d']
const TV_STATUS: TvStatusFilter[] = ['airing', 'returning', 'ended', 'cancelled']
const TV_PROGRESS: TvProgressFilter[] = ['not_started', 'midway', 'caught_up']
const SORTS: SortKey[] = ['priority', 'added', 'release', 'score', 'title', 'updated']
const GROUPS: GroupKey[] = ['none', 'status', 'type', 'priority', 'year']

export function parseFilters(p: URLSearchParams): Filters {
  const type = (TYPES as string[]).includes(p.get('type') ?? '') ? (p.get('type') as MediaType) : null
  const isScreen = type === 'movie' || type === 'tv'
  return {
    type,
    status: list(p.get('status'), STATUS),
    priority: list(p.get('priority'), PRIORITY),
    rating: list(p.get('rating'), RATING),
    minScore: int(p.get('score')),
    release: list(p.get('release'), RELEASE),
    yearFrom: int(p.get('from')),
    yearTo: int(p.get('to')),
    added: (ADDED as string[]).includes(p.get('added') ?? '') ? (p.get('added') as AddedFilter) : null,
    // Layer 3 is ignored unless its type is selected.
    genre: isScreen ? (p.get('genre') ?? '').split(',').filter(Boolean) : [],
    tvStatus: type === 'tv' ? list(p.get('tvstatus'), TV_STATUS) : [],
    tvProgress: type === 'tv' ? list(p.get('tvprogress'), TV_PROGRESS) : [],
    sort: (SORTS as string[]).includes(p.get('sort') ?? '') ? (p.get('sort') as SortKey) : 'priority',
    group: (GROUPS as string[]).includes(p.get('group') ?? '') ? (p.get('group') as GroupKey) : 'none',
  }
}

/** Serialises filters back to URL params (defaults omitted to keep URLs short). */
export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams()
  const set = (k: string, v: string | number | null | undefined) => {
    if (v !== null && v !== undefined && v !== '') p.set(k, String(v))
  }
  set('type', f.type)
  set('status', f.status.join(','))
  set('priority', f.priority.join(','))
  set('rating', f.rating.join(','))
  set('score', f.minScore)
  set('release', f.release.join(','))
  set('from', f.yearFrom)
  set('to', f.yearTo)
  set('added', f.added)
  if (f.type === 'movie' || f.type === 'tv') set('genre', f.genre.join(','))
  if (f.type === 'tv') {
    set('tvstatus', f.tvStatus.join(','))
    set('tvprogress', f.tvProgress.join(','))
  }
  if (f.sort !== 'priority') set('sort', f.sort)
  if (f.group !== 'none') set('group', f.group)
  return p
}

/** Switching type keeps Layer 2 but drops the old type's Layer 3 filters. */
export function withType(f: Filters, type: MediaType | null): Filters {
  return { ...f, type, genre: [], tvStatus: [], tvProgress: [] }
}

export function clearFilters(f: Filters): Filters {
  return {
    ...f,
    status: [],
    priority: [],
    rating: [],
    minScore: null,
    release: [],
    yearFrom: null,
    yearTo: null,
    added: null,
    genre: [],
    tvStatus: [],
    tvProgress: [],
  }
}

// ─── Per-item values ───────────────────────────────────────────────────────

/** 0–100: IMDb × 10 (movies/TV), Steam % (games), Hardcover × 20 (books); TMDB × 10 as a fallback. */
export function normalisedScore(item: UserItem): number | null {
  const imdb = item.title.ratings?.imdb
  if (imdb) return Math.round(parseFloat(imdb) * 10)
  const s = item.title.score
  if (!s) return null
  const n = parseFloat(s.value)
  if (!Number.isFinite(n)) return null
  if (s.label === 'Steam') return Math.round(n)
  if (s.label === 'Hardcover') return Math.round(n * 20)
  return Math.round(n * 10) // IMDb / TMDB 0–10
}

function tvStatusOf(item: UserItem): TvStatusFilter | null {
  if (item.title.mediaType !== 'tv') return null
  if (tvSchedule(item.title)?.kind === 'airing') return 'airing'
  const s = item.title.details?.status
  if (s === 'Ended') return 'ended'
  if (s === 'Canceled') return 'cancelled'
  if (s === 'Returning Series' || s === 'In Production') return 'returning'
  return null
}

function tvProgressOf(item: UserItem): TvProgressFilter {
  if (item.progress === 'completed') return 'caught_up'
  if (!item.tvProgress && item.progress !== 'in_progress') return 'not_started'
  return 'midway'
}

const ADDED_DAYS: Record<AddedFilter, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }

// ─── Apply ─────────────────────────────────────────────────────────────────

export function applyFilters(items: UserItem[], f: Filters): UserItem[] {
  const now = Date.now()
  return items.filter((i) => {
    if (f.type && i.title.mediaType !== f.type) return false
    if (f.status.length && !f.status.includes(i.progress)) return false
    if (f.priority.length && !f.priority.includes(i.priority ?? 'none')) return false
    if (f.rating.length) {
      const r = new Set<RatingFilter>()
      if (i.verdict === 'liked') r.add('liked')
      if (i.verdict === 'disliked') r.add('disliked')
      if (i.favourite) r.add('favourite')
      if (!i.verdict && !i.favourite) r.add('unrated')
      if (!f.rating.some((x) => r.has(x))) return false
    }
    if (f.minScore != null) {
      const sc = normalisedScore(i)
      if (sc == null || sc < f.minScore) return false
    }
    if (f.release.length) {
      const upcoming = releaseInfo(i.title).preRelease
      if (!f.release.includes(upcoming ? 'upcoming' : 'released')) return false
    }
    if (f.yearFrom != null || f.yearTo != null) {
      const y = i.title.year
      if (y == null) return false
      if (f.yearFrom != null && y < f.yearFrom) return false
      if (f.yearTo != null && y > f.yearTo) return false
    }
    if (f.added) {
      const t = i.addedAt ? Date.parse(i.addedAt) : NaN
      if (!Number.isFinite(t) || now - t > ADDED_DAYS[f.added] * 86_400_000) return false
    }
    if (f.genre.length && !f.genre.some((g) => i.title.genres.includes(g))) return false
    if (f.tvStatus.length) {
      const s = tvStatusOf(i)
      if (!s || !f.tvStatus.includes(s)) return false
    }
    if (f.tvProgress.length && !f.tvProgress.includes(tvProgressOf(i))) return false
    return true
  })
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 }

export function sortItems(items: UserItem[], sort: SortKey): UserItem[] {
  const added = (i: UserItem) => (i.addedAt ? Date.parse(i.addedAt) : 0)
  const byAddedDesc = (a: UserItem, b: UserItem) => added(b) - added(a)
  const sorted = [...items]
  switch (sort) {
    case 'priority':
      return sorted.sort(
        (a, b) => PRIORITY_RANK[a.priority ?? 'none'] - PRIORITY_RANK[b.priority ?? 'none'] || byAddedDesc(a, b),
      )
    case 'added':
      return sorted.sort(byAddedDesc)
    case 'updated':
      return sorted.sort((a, b) => Date.parse(b.updatedAt ?? '0') - Date.parse(a.updatedAt ?? '0'))
    case 'release':
      // Newest first; undated last.
      return sorted.sort((a, b) => (b.title.releaseDate ?? '').localeCompare(a.title.releaseDate ?? ''))
    case 'score':
      return sorted.sort((a, b) => (normalisedScore(b) ?? -1) - (normalisedScore(a) ?? -1))
    case 'title':
      return sorted.sort((a, b) => a.title.title.localeCompare(b.title.title))
  }
}

export interface Group {
  key: string
  label: string
  items: UserItem[]
}

const STATUS_LABEL: Record<Progress, string> = {
  wanted: 'Wanted',
  in_progress: 'In Progress',
  completed: 'Done',
  dropped: 'Dropped',
}
const TYPE_LABEL: Record<MediaType, string> = { movie: 'Movies', tv: 'TV Shows', game: 'Games', book: 'Books' }
const PRIORITY_LABEL: Record<string, string> = { high: 'High priority', medium: 'Medium priority', low: 'Low priority', none: 'No priority' }

/** Groups already-sorted items, keeping each group's order. Group order is fixed per key. */
export function groupItems(items: UserItem[], group: GroupKey): Group[] {
  if (group === 'none') return [{ key: 'all', label: '', items }]
  const keyOf = (i: UserItem): [string, string] => {
    switch (group) {
      case 'status':
        return [i.progress, STATUS_LABEL[i.progress]]
      case 'type':
        return [i.title.mediaType, TYPE_LABEL[i.title.mediaType]]
      case 'priority':
        return [i.priority ?? 'none', PRIORITY_LABEL[i.priority ?? 'none']]
      case 'year':
        return [String(i.title.year ?? '—'), i.title.year ? String(i.title.year) : 'No date']
    }
  }
  const map = new Map<string, Group>()
  for (const i of items) {
    const [k, label] = keyOf(i)
    if (!map.has(k)) map.set(k, { key: k, label, items: [] })
    map.get(k)!.items.push(i)
  }
  const order: Record<Exclude<GroupKey, 'none' | 'year'>, string[]> = {
    status: STATUS,
    type: TYPES,
    priority: ['high', 'medium', 'low', 'none'],
  }
  const groups = [...map.values()]
  if (group === 'year') return groups.sort((a, b) => (b.key === '—' ? -1 : a.key === '—' ? 1 : Number(b.key) - Number(a.key)))
  return groups.sort((a, b) => order[group].indexOf(a.key) - order[group].indexOf(b.key))
}

// ─── Labels for the UI ─────────────────────────────────────────────────────

export const LABELS = {
  type: TYPE_LABEL,
  status: STATUS_LABEL,
  priority: { high: 'High', medium: 'Medium', low: 'Low', none: 'None' } as Record<Priority | 'none', string>,
  rating: { liked: 'Liked', disliked: 'Didn’t like', favourite: '★ Favourite', unrated: 'Unrated' } as Record<RatingFilter, string>,
  release: { released: 'Released', upcoming: 'Upcoming' } as Record<ReleaseFilter, string>,
  added: { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '365d': 'Last year' } as Record<AddedFilter, string>,
  tvStatus: { airing: 'Airing', returning: 'Returning', ended: 'Ended', cancelled: 'Cancelled' } as Record<TvStatusFilter, string>,
  tvProgress: { not_started: 'Not started', midway: 'Mid-way', caught_up: 'Caught up' } as Record<TvProgressFilter, string>,
  sort: { priority: 'Priority', added: 'Date added', release: 'Release date', score: 'Score', title: 'Title', updated: 'Last updated' } as Record<SortKey, string>,
  group: { none: 'No grouping', status: 'Status', type: 'Type', priority: 'Priority', year: 'Release year' } as Record<GroupKey, string>,
  options: { STATUS, PRIORITY, RATING, RELEASE, ADDED, TV_STATUS, TV_PROGRESS, SORTS, GROUPS },
}

/** Number of active (non-arranging) filters — for the Filters button badge. */
export function activeCount(f: Filters): number {
  return (
    f.status.length +
    f.priority.length +
    f.rating.length +
    (f.minScore != null ? 1 : 0) +
    f.release.length +
    (f.yearFrom != null || f.yearTo != null ? 1 : 0) +
    (f.added ? 1 : 0) +
    f.genre.length +
    f.tvStatus.length +
    f.tvProgress.length
  )
}
