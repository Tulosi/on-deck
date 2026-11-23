// Library filtering, sorting and grouping — all state lives in the URL (see docs/FILTERING.md).
//
//   /library?type=tv&status=wanted,in_progress&score=70&release=released&genre=Drama&sort=score&group=status
//
// Layer 1: type (single-select; absent = all). Layer 2: cross-category filters (any type).
// Layer 3: type-specific filters — only read when that type is selected.
// Within one filter values are OR'd; different filters are AND'd. Include only (no exclude).
import { cheapest } from './prices'
import { releaseInfo, tvSchedule } from './release'
import { statusLabel } from './statusLabels'
import type { MediaType, Priority, Progress, UserItem } from '../types'

export const TYPES: MediaType[] = ['movie', 'tv', 'game', 'book']

export type RatingFilter = 'liked' | 'disliked' | 'favourite' | 'unrated'
export type AvailabilityFilter = 'available' | 'unavailable'
export type ReleaseFilter = 'released' | 'upcoming'
export type AddedFilter = '7d' | '30d' | '90d' | '365d'
export type TvStatusFilter = 'airing' | 'returning' | 'ended' | 'cancelled'
export type TvProgressFilter = 'not_started' | 'midway' | 'caught_up'
export type SortKey = 'priority' | 'added' | 'release' | 'score' | 'title' | 'updated' | 'price' | 'length'
export type CoopFilter = 'online' | 'local' | 'split' | 'pvp'
export type DeckFilter = 'verified' | 'playable' | 'unsupported'
export type AccessFilter = 'early_access' | 'full_release'
export type DealFilter = 'on_sale' | 'historical_low' | 'free'
/** Game length, by IGDB's "normal" time to beat. */
export type LengthFilter = 'short' | 'medium' | 'long' | 'epic'
/**
 * Filter groups with three states per chip: include (match any) → exclude (match none) → off. The others
 * (genre, and two-option groups like Availability) are include-only.
 */
export const TRI_KEYS = ['status', 'priority', 'rating', 'tvStatus', 'tvProgress', 'coop', 'deck', 'deal', 'length'] as const
export type TriKey = (typeof TRI_KEYS)[number]
/** URL parameter for each 3-state group; excluded values are written with a leading "-". */
const TRI_PARAM: Record<TriKey, string> = {
  status: 'status',
  priority: 'priority',
  rating: 'rating',
  tvStatus: 'tvstatus',
  tvProgress: 'tvprogress',
  coop: 'coop',
  deck: 'deck',
  deal: 'deal',
  length: 'length',
}
const TV_TRI: TriKey[] = ['tvStatus', 'tvProgress']
const GAME_TRI: TriKey[] = ['coop', 'deck', 'deal', 'length']

/** hide = the default (archived titles left out). */
export type ArchivedFilter = 'hide' | 'include' | 'only'
export type GroupKey = 'none' | 'status' | 'type' | 'priority' | 'year'

export interface Filters {
  type: MediaType | null
  // Layer 2
  status: Progress[]
  priority: (Priority | 'none')[]
  rating: RatingFilter[]
  /** Minimum normalised score 0–100, or null for any. */
  minScore: number | null
  /** Movies/TV: on Plex or my streaming services. Games/books: In Your Library. */
  availability: AvailabilityFilter[]
  release: ReleaseFilter[]
  yearFrom: number | null
  yearTo: number | null
  added: AddedFilter | null
  /** Archived titles: hidden (default), included, or only them. */
  archived: ArchivedFilter
  /** Excluded values per 3-state group ("not Dropped"). */
  not: Partial<Record<TriKey, string[]>>
  // Layer 3 (Movies / TV for now)
  genre: string[]
  tvStatus: TvStatusFilter[]
  tvProgress: TvProgressFilter[]
  // Layer 3 — Games
  coop: CoopFilter[]
  deck: DeckFilter[]
  access: AccessFilter[]
  deal: DealFilter[]
  length: LengthFilter[]
  /** Cheapest price at most this (in the user's currency), or null. */
  maxPrice: number | null
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

const STATUS: Progress[] = ['wanted', 'in_progress', 'caught_up', 'stalled', 'completed', 'dropped']
const PRIORITY: (Priority | 'none')[] = ['high', 'medium', 'low', 'none']
const RATING: RatingFilter[] = ['liked', 'disliked', 'favourite', 'unrated']
const RELEASE: ReleaseFilter[] = ['released', 'upcoming']
const AVAILABILITY: AvailabilityFilter[] = ['available', 'unavailable']
const ADDED: AddedFilter[] = ['7d', '30d', '90d', '365d']
const TV_STATUS: TvStatusFilter[] = ['airing', 'returning', 'ended', 'cancelled']
const TV_PROGRESS: TvProgressFilter[] = ['not_started', 'midway', 'caught_up']
/** Sort when none is chosen: date added, newest first. */
export const DEFAULT_SORT: SortKey = 'added'
const SORTS: SortKey[] = ['added', 'priority', 'release', 'score', 'title', 'updated', 'price', 'length']
const LENGTH: LengthFilter[] = ['short', 'medium', 'long', 'epic']
const COOP: CoopFilter[] = ['online', 'local', 'split', 'pvp']
const DECK: DeckFilter[] = ['verified', 'playable', 'unsupported']
const ACCESS: AccessFilter[] = ['early_access', 'full_release']
const DEAL: DealFilter[] = ['on_sale', 'historical_low', 'free']
const GROUPS: GroupKey[] = ['none', 'status', 'type', 'priority', 'year']

export function parseFilters(p: URLSearchParams): Filters {
  const type = (TYPES as string[]).includes(p.get('type') ?? '') ? (p.get('type') as MediaType) : null
  const hasGenres = type === 'movie' || type === 'tv' || type === 'game'
  const isGame = type === 'game'
  const ALLOWED: Record<TriKey, readonly string[]> = {
    status: STATUS,
    priority: PRIORITY,
    rating: RATING,
    tvStatus: TV_STATUS,
    tvProgress: TV_PROGRESS,
    coop: COOP,
    deck: DECK,
    deal: DEAL,
    length: LENGTH,
  }
  const not: Partial<Record<TriKey, string[]>> = {}
  for (const k of TRI_KEYS) {
    if (TV_TRI.includes(k) && type !== 'tv') continue
    if (GAME_TRI.includes(k) && !isGame) continue
    const ex = (p.get(TRI_PARAM[k]) ?? '')
      .split(',')
      .filter((v) => v.startsWith('-'))
      .map((v) => v.slice(1))
      .filter((v) => ALLOWED[k].includes(v))
    if (ex.length) not[k] = ex
  }
  return {
    type,
    not,
    status: list(p.get('status'), STATUS),
    priority: list(p.get('priority'), PRIORITY),
    rating: list(p.get('rating'), RATING),
    minScore: int(p.get('score')),
    availability: list(p.get('avail'), AVAILABILITY),
    release: list(p.get('release'), RELEASE),
    yearFrom: int(p.get('from')),
    yearTo: int(p.get('to')),
    added: (ADDED as string[]).includes(p.get('added') ?? '') ? (p.get('added') as AddedFilter) : null,
    archived: p.get('archived') === 'include' || p.get('archived') === 'only' ? (p.get('archived') as ArchivedFilter) : 'hide',
    // Layer 3 is ignored unless its type is selected.
    genre: hasGenres ? (p.get('genre') ?? '').split(',').filter(Boolean) : [],
    tvStatus: type === 'tv' ? list(p.get('tvstatus'), TV_STATUS) : [],
    tvProgress: type === 'tv' ? list(p.get('tvprogress'), TV_PROGRESS) : [],
    coop: isGame ? list(p.get('coop'), COOP) : [],
    deck: isGame ? list(p.get('deck'), DECK) : [],
    access: isGame ? list(p.get('access'), ACCESS) : [],
    deal: isGame ? list(p.get('deal'), DEAL) : [],
    length: isGame ? list(p.get('length'), LENGTH) : [],
    maxPrice: isGame ? int(p.get('maxprice')) : null,
    sort: (SORTS as string[]).includes(p.get('sort') ?? '') ? (p.get('sort') as SortKey) : DEFAULT_SORT,
    group: (GROUPS as string[]).includes(p.get('group') ?? '') ? (p.get('group') as GroupKey) : 'none',
  }
}

/** Serialises filters back to URL params (defaults omitted to keep URLs short). */
export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams()
  const set = (k: string, v: string | number | null | undefined) => {
    if (v !== null && v !== undefined && v !== '') p.set(k, String(v))
  }
  /** Included values, then excluded ones with a leading "-". */
  const tri = (key: TriKey, inc: readonly string[]) => [...inc, ...(f.not[key] ?? []).map((v) => `-${v}`)].join(',')
  set('type', f.type)
  set('status', tri('status', f.status))
  set('priority', tri('priority', f.priority))
  set('rating', tri('rating', f.rating))
  set('score', f.minScore)
  set('avail', f.availability.join(','))
  set('release', f.release.join(','))
  set('from', f.yearFrom)
  set('to', f.yearTo)
  set('added', f.added)
  if (f.archived !== 'hide') set('archived', f.archived)
  if (f.type === 'movie' || f.type === 'tv' || f.type === 'game') set('genre', f.genre.join(','))
  if (f.type === 'game') {
    set('coop', tri('coop', f.coop))
    set('deck', tri('deck', f.deck))
    set('access', f.access.join(','))
    set('deal', tri('deal', f.deal))
    set('length', tri('length', f.length))
    set('maxprice', f.maxPrice)
  }
  if (f.type === 'tv') {
    set('tvstatus', tri('tvStatus', f.tvStatus))
    set('tvprogress', tri('tvProgress', f.tvProgress))
  }
  if (f.sort !== DEFAULT_SORT) set('sort', f.sort)
  if (f.group !== 'none') set('group', f.group)
  return p
}

/** Switching type keeps Layer 2 but drops the old type's Layer 3 filters. */
export function withType(f: Filters, type: MediaType | null): Filters {
  const not = { ...f.not }
  for (const k of [...TV_TRI, ...GAME_TRI]) delete not[k]
  return { ...f, type, not, genre: [], tvStatus: [], tvProgress: [], coop: [], deck: [], access: [], deal: [], length: [], maxPrice: null }
}

export function clearFilters(f: Filters): Filters {
  return {
    ...f,
    not: {},
    status: [],
    priority: [],
    rating: [],
    minScore: null,
    availability: [],
    release: [],
    yearFrom: null,
    yearTo: null,
    added: null,
    archived: 'hide',
    genre: [],
    tvStatus: [],
    tvProgress: [],
    coop: [],
    deck: [],
    access: [],
    deal: [],
    length: [],
    maxPrice: null,
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
  if (item.progress === 'completed' || item.progress === 'caught_up') return 'caught_up'
  if (!item.tvProgress && item.progress !== 'in_progress') return 'not_started'
  return 'midway'
}

/** Movies/TV: stored availability (null = not checked yet). Games/books: In Your Library. */
export function isAvailable(item: UserItem): boolean | null {
  if (item.title.mediaType === 'game' || item.title.mediaType === 'book') return item.owned
  return item.available ?? null
}

const ADDED_DAYS: Record<AddedFilter, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }

// ─── Apply ─────────────────────────────────────────────────────────────────

export function applyFilters(items: UserItem[], f: Filters): UserItem[] {
  const now = Date.now()
  return items.filter((i) => {
    if (f.archived === 'hide' && i.archivedAt) return false
    if (f.archived === 'only' && !i.archivedAt) return false
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
    if (f.availability.length) {
      const a = isAvailable(i)
      // Not checked yet (or no sources set up) matches neither option.
      if (a === null || !f.availability.includes(a ? 'available' : 'unavailable')) return false
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
    if (f.coop.length) {
      const mp = (i.title.details?.multiplayer ?? {}) as Record<string, unknown>
      const has: Record<CoopFilter, boolean> = {
        online: !!mp.online_coop,
        local: !!mp.local_coop,
        split: !!mp.split_screen,
        pvp: !!mp.pvp,
      }
      if (!f.coop.some((c) => has[c])) return false
    }
    if (f.deck.length && !f.deck.includes(i.title.details?.steam_deck as DeckFilter)) return false
    if (f.access.length) {
      const ea = i.title.details?.early_access === true
      if (!f.access.includes(ea ? 'early_access' : 'full_release')) return false
    }
    if (f.length.length) {
      const b = lengthBucket(i)
      if (!b || !f.length.includes(b)) return false
    }
    if (f.deal.length) {
      const p = i.gamePrice
      const best = p ? cheapest(p) : null
      const has: Record<DealFilter, boolean> = {
        on_sale: !!best && (best.discountPct ?? 0) > 0,
        historical_low: !!best?.atLow,
        free: !!p?.isFree,
      }
      if (!f.deal.some((d) => has[d])) return false
    }
    if (f.maxPrice != null) {
      const p = i.gamePrice
      const price = p?.isFree ? 0 : p ? cheapest(p)?.price : undefined
      if (price == null || price > f.maxPrice) return false
    }
    // Exclusions ("not …"): drop anything matching an excluded value.
    for (const k of TRI_KEYS) {
      const ex = f.not[k]
      if (ex?.length && triValues(k, i).some((v) => ex.includes(v))) return false
    }
    return true
  })
}

/** The values an item has in a 3-state group (for exclusions). */
export function triValues(k: TriKey, i: UserItem): string[] {
  switch (k) {
    case 'status':
      return [i.progress]
    case 'priority':
      return [i.priority ?? 'none']
    case 'rating': {
      const r: string[] = []
      if (i.verdict === 'liked') r.push('liked')
      if (i.verdict === 'disliked') r.push('disliked')
      if (i.favourite) r.push('favourite')
      if (!i.verdict && !i.favourite) r.push('unrated')
      return r
    }
    case 'tvStatus': {
      const s = tvStatusOf(i)
      return s ? [s] : []
    }
    case 'tvProgress':
      return [tvProgressOf(i)]
    case 'coop': {
      const mp = (i.title.details?.multiplayer ?? {}) as Record<string, unknown>
      return [mp.online_coop && 'online', mp.local_coop && 'local', mp.split_screen && 'split', mp.pvp && 'pvp'].filter(Boolean) as string[]
    }
    case 'deck':
      return typeof i.title.details?.steam_deck === 'string' ? [i.title.details.steam_deck as string] : []
    case 'deal': {
      const p = i.gamePrice
      const best = p ? cheapest(p) : null
      return [best && (best.discountPct ?? 0) > 0 && 'on_sale', best?.atLow && 'historical_low', p?.isFree && 'free'].filter(Boolean) as string[]
    }
    case 'length': {
      const b = lengthBucket(i)
      return b ? [b] : []
    }
  }
}

/** Off → include → exclude → off, for one chip of a 3-state group. */
export function cycleTri<K extends TriKey>(f: Filters, k: K, v: string): Filters {
  const inc = f[k] as string[]
  const ex: string[] = f.not[k] ?? []
  if (inc.includes(v)) {
    // include → exclude
    return { ...f, [k]: inc.filter((x) => x !== v), not: { ...f.not, [k]: [...ex, v] } }
  }
  if (ex.includes(v)) {
    // exclude → off
    return { ...f, not: { ...f.not, [k]: ex.filter((x) => x !== v) } }
  }
  return { ...f, [k]: [...inc, v] } // off → include
}

/** Hours to beat a game at a normal pace (IGDB players), falling back to the rushed time. */
export function hoursToBeat(i: UserItem): number | null {
  const t = i.title.details?.time_to_beat as { normal?: number | null; rushed?: number | null } | null | undefined
  return t?.normal ?? t?.rushed ?? null
}

export function lengthBucket(i: UserItem): LengthFilter | null {
  const h = hoursToBeat(i)
  if (h == null) return null
  return h < 10 ? 'short' : h < 30 ? 'medium' : h < 60 ? 'long' : 'epic'
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
    case 'price': {
      // Cheapest first (free = 0); no price last.
      const priceOf = (i: UserItem) => (i.gamePrice?.isFree ? 0 : i.gamePrice ? (cheapest(i.gamePrice)?.price ?? Infinity) : Infinity)
      return sorted.sort((a, b) => priceOf(a) - priceOf(b))
    }
    case 'length':
      // Shortest first; unknown last.
      return sorted.sort((a, b) => (hoursToBeat(a) ?? Infinity) - (hoursToBeat(b) ?? Infinity))
  }
}

export interface Group {
  key: string
  label: string
  items: UserItem[]
}

const STATUS_LABEL: Record<Progress, string> = Object.fromEntries(
  (['wanted', 'in_progress', 'caught_up', 'stalled', 'completed', 'dropped'] as Progress[]).map((p) => [p, statusLabel(p)]),
) as Record<Progress, string>
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
  availability: { available: 'Available', unavailable: 'Not available' } as Record<AvailabilityFilter, string>,
  archived: { hide: 'Hide', include: 'Include', only: 'Only archived' } as Record<ArchivedFilter, string>,
  added: { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '365d': 'Last year' } as Record<AddedFilter, string>,
  tvStatus: { airing: 'Airing', returning: 'Returning', ended: 'Ended', cancelled: 'Cancelled' } as Record<TvStatusFilter, string>,
  tvProgress: { not_started: 'Not started', midway: 'Mid-way', caught_up: 'Caught up' } as Record<TvProgressFilter, string>,
  sort: { priority: 'Priority', added: 'None (date added)', release: 'Release date', score: 'Score', title: 'Title', updated: 'Last updated', price: 'Price', length: 'Length' } as Record<SortKey, string>,
  coop: { online: 'Online co-op', local: 'Local co-op', split: 'Split-screen', pvp: 'PvP' } as Record<CoopFilter, string>,
  deck: { verified: 'Deck Verified', playable: 'Deck Playable', unsupported: 'Deck Unsupported' } as Record<DeckFilter, string>,
  access: { early_access: 'Early Access', full_release: 'Full release (1.0)' } as Record<AccessFilter, string>,
  deal: { on_sale: 'On sale', historical_low: 'Historical low', free: 'Free-To-Play' } as Record<DealFilter, string>,
  length: { short: 'Short (under 10h)', medium: 'Medium (10–30h)', long: 'Long (30–60h)', epic: 'Epic (60h+)' } as Record<LengthFilter, string>,
  group: { none: 'No grouping', status: 'Status', type: 'Type', priority: 'Priority', year: 'Release year' } as Record<GroupKey, string>,
  options: { COOP, DECK, ACCESS, DEAL, LENGTH, STATUS, PRIORITY, RATING, AVAILABILITY, RELEASE, ADDED, TV_STATUS, TV_PROGRESS, SORTS, GROUPS },
}

/** Number of active (non-arranging) filters — for the Filters button badge. */
export function activeCount(f: Filters): number {
  return (
    f.status.length +
    f.priority.length +
    f.rating.length +
    (f.minScore != null ? 1 : 0) +
    f.availability.length +
    f.release.length +
    (f.yearFrom != null || f.yearTo != null ? 1 : 0) +
    (f.added ? 1 : 0) +
    (f.archived !== 'hide' ? 1 : 0) +
    Object.values(f.not).reduce((n, v) => n + (v?.length ?? 0), 0) +
    f.genre.length +
    f.tvStatus.length +
    f.tvProgress.length +
    f.coop.length +
    f.deck.length +
    f.access.length +
    f.deal.length +
    f.length.length +
    (f.maxPrice != null ? 1 : 0)
  )
}
