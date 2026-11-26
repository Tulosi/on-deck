// Library filtering, sorting and grouping — all state lives in the URL (see docs/FILTERING.md).
//
//   /library?type=tv&status=wanted,in_progress&score=70&release=released&genre=Drama&sort=score&group=status
//
// Layer 1: types (any combination, ?type=game,movie; absent = all). Layer 2: cross-category filters (any type).
// Layer 3: type-specific filters — only read when that type is selected.
// Within one filter values are OR'd; different filters are AND'd. A few groups (status, rating, genre, co-op) can
// be flipped to "is not": then their values are exclusions, written to the URL with a leading "-".
import { cheapest } from './prices'
import { releaseInfo, tvSchedule } from './release'
import { statusLabel } from './statusLabels'
import type { MediaType, Priority, Progress, UserItem } from '../types'

export const TYPES: MediaType[] = ['movie', 'tv', 'game', 'book']

export type RatingFilter = 'liked' | 'disliked' | 'favourite' | 'unrated'
export type AvailabilityFilter = 'available' | 'unavailable'
export type ReleaseFilter = 'released' | 'upcoming'
export type AddedFilter = '7d' | '30d' | '90d' | '365d'
/** Ended includes cancelled shows (old links with "cancelled" read as ended). */
export type TvStatusFilter = 'airing' | 'returning' | 'ended'
export type TvProgressFilter = 'not_started' | 'midway' | 'caught_up'
export type SortKey = 'priority' | 'added' | 'release' | 'score' | 'title' | 'updated' | 'played' | 'price' | 'discount' | 'length'
/** How a game is played: alone, with others at all, together against the game (co-op), on one screen, or against each other. */
export type CoopFilter = 'single' | 'multi' | 'coop' | 'local' | 'pvp'
export type DeckFilter = 'verified' | 'playable' | 'unsupported'
export type AccessFilter = 'early_access' | 'full_release'
export type DealFilter = 'on_sale' | 'historical_low' | 'free'
/** Game length, by IGDB's "normal" time to beat. */
export type LengthFilter = 'short' | 'medium' | 'long' | 'epic'
/** Groups that can be flipped from "is" to "is not" (then their values exclude instead of include). */
export const NEG_KEYS = ['status', 'rating', 'genre', 'coop'] as const
export type NegKey = (typeof NEG_KEYS)[number]

/** hide = the default (archived titles left out). */
export type ArchivedFilter = 'hide' | 'include' | 'only'
export type GroupKey = 'none' | 'status' | 'type' | 'priority' | 'year'

export interface Filters {
  /** The types shown; empty = all. */
  types: MediaType[]
  /** The one type, when exactly one is picked (its own Layer 3 filters and words apply); otherwise null. */
  type: MediaType | null
  // Layer 2
  status: Progress[]
  priority: (Priority | 'none')[]
  rating: RatingFilter[]
  /** Minimum normalised score 0–100, or null for any. No longer in the panel: read from older links and saved
   *  collections, shown as a removable chip. Same for yearFrom/yearTo, added and tvProgress. */
  minScore: number | null
  /** Movies/TV: on Plex or my streaming services. Games/books: In your library. */
  availability: AvailabilityFilter[]
  release: ReleaseFilter[]
  yearFrom: number | null
  yearTo: number | null
  added: AddedFilter | null
  /** Archived titles: hidden (default), included, or only them. */
  archived: ArchivedFilter
  /** Groups flipped to "is not": their values are exclusions ("not Dropped"). */
  neg: Partial<Record<NegKey, boolean>>
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
  /** The sort, and the groups, the other way round. Titles without the sorted value (no price, no date) stay last. */
  sortRev: boolean
  groupRev: boolean
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
const TV_STATUS: TvStatusFilter[] = ['airing', 'returning', 'ended']
const TV_PROGRESS: TvProgressFilter[] = ['not_started', 'midway', 'caught_up']
/** Sort when none is chosen: date added, newest first. */
export const DEFAULT_SORT: SortKey = 'added'
const SORTS: SortKey[] = ['added', 'priority', 'release', 'score', 'title', 'updated', 'played', 'price', 'discount', 'length']
const LENGTH: LengthFilter[] = ['short', 'medium', 'long', 'epic']
const COOP: CoopFilter[] = ['single', 'multi', 'coop', 'local', 'pvp']
const DECK: DeckFilter[] = ['verified', 'playable', 'unsupported']
const ACCESS: AccessFilter[] = ['early_access', 'full_release']
const DEAL: DealFilter[] = ['on_sale', 'historical_low', 'free']
const GROUPS: GroupKey[] = ['none', 'status', 'type', 'priority', 'year']

const split = (v: string | null) =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

/**
 * A group that can be "is not": plain values include; values with a leading "-" exclude. Older links could mix
 * the two in one group; then the included values win (for a one-value field like status, excluding as well
 * changes nothing).
 */
function negList<T extends string>(v: string | null, allowed: readonly T[] | null): { values: T[]; neg: boolean } {
  const ok = (xs: string[]) => (allowed ? xs.filter((x): x is T => (allowed as readonly string[]).includes(x)) : (xs as T[]))
  const all = split(v)
  const inc = ok(all.filter((x) => !x.startsWith('-')))
  if (inc.length) return { values: inc, neg: false }
  const ex = ok(all.filter((x) => x.startsWith('-')).map((x) => x.slice(1)))
  // A lone "-" keeps a group on "is not" before anything is picked.
  return { values: ex, neg: ex.length > 0 || all.includes('-') }
}

/** An include-only group. Older links could exclude values ("-high"); those read as every other option. */
function incList<T extends string>(v: string | null, allowed: readonly T[]): T[] {
  const all = split(v)
  const inc = list(all.filter((x) => !x.startsWith('-')).join(','), allowed)
  if (inc.length) return inc
  const ex = all.filter((x) => x.startsWith('-')).map((x) => x.slice(1))
  return ex.length ? allowed.filter((a) => !ex.includes(a)) : []
}

export function parseFilters(p: URLSearchParams): Filters {
  // Hand-made links may repeat it (?type=movie&type=game); read every one.
  const types = normTypes(list(p.getAll('type').join(',') || null, TYPES))
  const type = types.length === 1 ? types[0] : null
  const hasGenres = type === 'movie' || type === 'tv' || type === 'game'
  const isGame = type === 'game'
  const status = negList(p.get('status'), STATUS)
  const rating = negList(p.get('rating'), RATING)
  const genre = hasGenres ? negList(p.get('genre'), null) : { values: [], neg: false }
  // Older links: "online" co-op is now plain Co-op, and Split-screen sits under Local co-op.
  const coopParam = p.get('coop')?.replace(/\bonline\b/g, 'coop').replace(/\bsplit\b/g, 'local') ?? null
  const coop = isGame ? negList(coopParam, COOP) : { values: [], neg: false }
  const neg: Filters['neg'] = {}
  if (status.neg) neg.status = true
  if (rating.neg) neg.rating = true
  if (genre.neg) neg.genre = true
  if (coop.neg) neg.coop = true
  // "cancelled" was its own option; it now counts as ended.
  const tvStatus = type === 'tv' ? [...new Set(incList((p.get('tvstatus') ?? '').replace(/cancelled/g, 'ended'), TV_STATUS))] : []
  return {
    type,
    types,
    neg,
    status: status.values,
    priority: incList(p.get('priority'), PRIORITY),
    rating: rating.values,
    minScore: int(p.get('score')),
    availability: list(p.get('avail'), AVAILABILITY),
    release: list(p.get('release'), RELEASE),
    yearFrom: int(p.get('from')),
    yearTo: int(p.get('to')),
    added: (ADDED as string[]).includes(p.get('added') ?? '') ? (p.get('added') as AddedFilter) : null,
    archived: p.get('archived') === 'include' || p.get('archived') === 'only' ? (p.get('archived') as ArchivedFilter) : 'hide',
    // Layer 3 is ignored unless its type is selected.
    genre: genre.values,
    tvStatus,
    tvProgress: type === 'tv' ? incList(p.get('tvprogress'), TV_PROGRESS) : [],
    coop: coop.values,
    deck: isGame ? incList(p.get('deck'), DECK) : [],
    access: isGame ? list(p.get('access'), ACCESS) : [],
    deal: isGame ? incList(p.get('deal'), DEAL) : [],
    length: isGame ? incList(p.get('length'), LENGTH) : [],
    maxPrice: isGame ? int(p.get('maxprice')) : null,
    sort: (SORTS as string[]).includes(p.get('sort') ?? '') ? (p.get('sort') as SortKey) : DEFAULT_SORT,
    // Group by type is only offered across types; inside one type it falls back to no grouping.
    group: (GROUPS as string[]).includes(p.get('group') ?? '') && !(type && p.get('group') === 'type') ? (p.get('group') as GroupKey) : 'none',
    sortRev: p.get('sortrev') === '1',
    groupRev: p.get('grouprev') === '1',
  }
}

/** Serialises filters back to URL params (defaults omitted to keep URLs short). */
export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams()
  const set = (k: string, v: string | number | null | undefined) => {
    if (v !== null && v !== undefined && v !== '') p.set(k, String(v))
  }
  /** A group's values; in an "is not" group each one gets a leading "-". */
  const tri = (key: NegKey, vs: readonly string[]) =>
    f.neg[key] && vs.length === 0 ? '-' : vs.map((v) => (f.neg[key] ? `-${v}` : v)).join(',')
  set('type', f.types.join(','))
  set('status', tri('status', f.status))
  set('priority', f.priority.join(','))
  set('rating', tri('rating', f.rating))
  set('score', f.minScore)
  set('avail', f.availability.join(','))
  set('release', f.release.join(','))
  set('from', f.yearFrom)
  set('to', f.yearTo)
  set('added', f.added)
  if (f.archived !== 'hide') set('archived', f.archived)
  if (f.type === 'movie' || f.type === 'tv' || f.type === 'game') set('genre', tri('genre', f.genre))
  if (f.type === 'game') {
    set('coop', tri('coop', f.coop))
    set('deck', f.deck.join(','))
    set('access', f.access.join(','))
    set('deal', f.deal.join(','))
    set('length', f.length.join(','))
    set('maxprice', f.maxPrice)
  }
  if (f.type === 'tv') {
    set('tvstatus', f.tvStatus.join(','))
    set('tvprogress', f.tvProgress.join(','))
  }
  if (f.sort !== DEFAULT_SORT) set('sort', f.sort)
  if (f.group !== 'none') set('group', f.group)
  if (f.sortRev) set('sortrev', 1)
  if (f.group !== 'none' && f.groupRev) set('grouprev', 1)
  return p
}

/** In the usual order, without repeats; every type picked is the same as none (all). */
export function normTypes(ts: readonly MediaType[]): MediaType[] {
  const out = TYPES.filter((t) => ts.includes(t))
  return out.length === TYPES.length ? [] : out
}

/** "Movies", "Movies and games", "Movies, TV shows and games" (all lower case mid-sentence); null for all types. */
export function typesLabel(ts: readonly MediaType[], midSentence = false): string | null {
  if (!ts.length) return null
  const lower = (t: MediaType) => LABELS.type[t].toLowerCase().replace('tv', 'TV')
  const names = ts.map((t, i) => (i || midSentence ? lower(t) : LABELS.type[t]))
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** "Games, books", "TV, movies" for tight spots (the phone type pill); null for all types. */
export function typesShortLabel(ts: readonly MediaType[]): string | null {
  if (!ts.length) return null
  if (ts.length === 1) return LABELS.type[ts[0]]
  return ts.map((t, i) => (t === 'tv' ? 'TV' : i ? LABELS.type[t].toLowerCase() : LABELS.type[t])).join(', ')
}

/** Picking a set of types. Layer 3 filters stay while the one type stays the same. */
export function withTypes(f: Filters, ts: readonly MediaType[]): Filters {
  const types = normTypes(ts)
  const type = types.length === 1 ? types[0] : null
  if (type && type === f.type) return { ...f, types }
  return { ...withType(f, type), types }
}

/** Switching type keeps Layer 2 but drops the old type's Layer 3 filters. */
export function withType(f: Filters, type: MediaType | null): Filters {
  const neg = { ...f.neg }
  delete neg.genre
  delete neg.coop
  const group = type && f.group === 'type' ? 'none' : f.group
  return { ...f, type, types: type ? [type] : [], neg, group, genre: [], tvStatus: [], tvProgress: [], coop: [], deck: [], access: [], deal: [], length: [], maxPrice: null }
}

export function clearFilters(f: Filters): Filters {
  return {
    ...f,
    neg: {},
    status: [],
    priority: [],
    rating: [],
    minScore: null,
    availability: [],
    release: [],
    yearFrom: null,
    yearTo: null,
    added: null,
    // The Archive page is archived=only: clearing its filters keeps you on it.
    archived: f.archived === 'only' ? 'only' : 'hide',
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
  if (s === 'Canceled') return 'ended'
  if (s === 'Returning Series' || s === 'In Production') return 'returning'
  return null
}

function tvProgressOf(item: UserItem): TvProgressFilter {
  if (item.progress === 'completed' || item.progress === 'caught_up') return 'caught_up'
  if (!item.tvProgress && item.progress !== 'in_progress') return 'not_started'
  return 'midway'
}

/** Movies/TV: stored availability (null = not checked yet). Games/books: In your library. */
export function isAvailable(item: UserItem): boolean | null {
  if (item.title.mediaType === 'game' || item.title.mediaType === 'book') return item.owned
  return item.available ?? null
}

/** The ways a game can be played, from what IGDB and Steam say about it. */
export function playModes(item: UserItem): Set<CoopFilter> {
  const mp = (item.title.details?.multiplayer ?? {}) as Record<string, unknown>
  const m = new Set<CoopFilter>()
  if (mp.single_player) m.add('single')
  if (mp.online_coop || mp.local_coop) m.add('coop')
  if (mp.local_coop || mp.split_screen) m.add('local')
  if (mp.pvp) m.add('pvp')
  if (m.has('coop') || m.has('local') || m.has('pvp') || (typeof mp.online_max === 'number' && mp.online_max > 1)) m.add('multi')
  return m
}

const ADDED_DAYS: Record<AddedFilter, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }

// ─── Apply ─────────────────────────────────────────────────────────────────

export function applyFilters(items: UserItem[], f: Filters): UserItem[] {
  const now = Date.now()
  return items.filter((i) => {
    if (f.archived === 'hide' && i.archivedAt) return false
    if (f.archived === 'only' && !i.archivedAt) return false
    if (f.types.length && !f.types.includes(i.title.mediaType)) return false
    // "Is not" groups drop what matches; the others keep only what matches.
    const keep = (key: NegKey, match: boolean) => (f.neg[key] ? !match : match)
    if (f.status.length && !keep('status', f.status.includes(i.progress))) return false
    if (f.priority.length && !f.priority.includes(i.priority ?? 'none')) return false
    if (f.rating.length) {
      const r = new Set<RatingFilter>()
      if (i.verdict === 'liked') r.add('liked')
      if (i.verdict === 'disliked') r.add('disliked')
      if (i.favourite) r.add('favourite')
      if (!i.verdict && !i.favourite) r.add('unrated')
      if (!keep('rating', f.rating.some((x) => r.has(x)))) return false
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
    if (f.genre.length && !keep('genre', f.genre.some((g) => i.title.genres.includes(g)))) return false
    if (f.tvStatus.length) {
      const s = tvStatusOf(i)
      if (!s || !f.tvStatus.includes(s)) return false
    }
    if (f.tvProgress.length && !f.tvProgress.includes(tvProgressOf(i))) return false
    if (f.coop.length && !keep('coop', f.coop.some((c) => playModes(i).has(c)))) return false
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
    return true
  })
}

/** Selects or clears one value of a group. */
export function toggleValue<K extends keyof Filters>(f: Filters, key: K, v: string): Filters {
  const cur = f[key] as unknown as string[]
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
  return { ...f, [key]: next }
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

/** "The Gentlemen" files under G, "A Quiet Place" under Q, as in a library or on Plex. */
export const titleSortKey = (title: string) => title.trim().replace(/^(the|an|a)\s+(?=\S)/i, '')
const byTitle = (a: UserItem, b: UserItem) =>
  titleSortKey(a.title.title).localeCompare(titleSortKey(b.title.title), undefined, { sensitivity: 'base', numeric: true })

/**
 * Sorts by `sort`; `reverse` flips it. Titles without the value being sorted on (no price, no release date, no
 * score…) stay at the end either way, newest added first, so reversing never buries the list under blanks.
 */
export function sortItems(items: UserItem[], sort: SortKey, reverse = false): UserItem[] {
  const added = (i: UserItem) => (i.addedAt ? Date.parse(i.addedAt) : 0)
  const byAddedDesc = (a: UserItem, b: UserItem) => added(b) - added(a)
  const priceOf = (i: UserItem) => (i.gamePrice?.isFree ? 0 : i.gamePrice ? (cheapest(i.gamePrice)?.price ?? null) : null)
  const off = (i: UserItem) => {
    const b = i.gamePrice && !i.gamePrice.isFree ? cheapest(i.gamePrice) : null
    return b ? (b.discountPct ?? 0) + (b.atLow ? 0.5 : 0) : null
  }
  // Games: Steam's last-played date when there is one, otherwise the last time you did something with it in On Deck.
  const played = (i: UserItem) => Date.parse(i.steamLastPlayed ?? i.lastActivityAt ?? '') || null
  const num = (v: (i: UserItem) => number | null, dir: 1 | -1) => ({
    has: (i: UserItem) => v(i) != null,
    cmp: (a: UserItem, b: UserItem) => dir * (v(a)! - v(b)!),
  })
  const how: { has?: (i: UserItem) => boolean; cmp: (a: UserItem, b: UserItem) => number } = (() => {
    switch (sort) {
      case 'priority':
        return { has: (i: UserItem) => !!i.priority, cmp: (a: UserItem, b: UserItem) => PRIORITY_RANK[a.priority!] - PRIORITY_RANK[b.priority!] || byAddedDesc(a, b) }
      case 'added':
        return { cmp: byAddedDesc }
      case 'updated':
        return { cmp: (a: UserItem, b: UserItem) => Date.parse(b.updatedAt ?? '0') - Date.parse(a.updatedAt ?? '0') }
      case 'release': // newest first
        return { has: (i: UserItem) => !!i.title.releaseDate, cmp: (a: UserItem, b: UserItem) => b.title.releaseDate!.localeCompare(a.title.releaseDate!) }
      case 'score':
        return num(normalisedScore, -1)
      case 'title':
        return { cmp: byTitle }
      case 'price': // cheapest first (free = 0)
        return num(priceOf, 1)
      case 'discount': // biggest discount off Steam's full price first (historical lows break ties)
        return num(off, -1)
      case 'played': {
        const p = num(played, -1)
        return { has: p.has, cmp: (a: UserItem, b: UserItem) => p.cmp(a, b) || byAddedDesc(a, b) }
      }
      case 'length': // shortest first
        return num(hoursToBeat, 1)
    }
  })()
  const has = how.has ?? (() => true)
  const sorted = items.filter(has).sort(how.cmp)
  if (reverse) sorted.reverse()
  return [...sorted, ...items.filter((i) => !has(i)).sort(byAddedDesc)]
}

export interface Group {
  key: string
  label: string
  items: UserItem[]
}

const STATUS_LABEL: Record<Progress, string> = Object.fromEntries(
  (['wanted', 'in_progress', 'caught_up', 'stalled', 'completed', 'dropped'] as Progress[]).map((p) => [p, statusLabel(p)]),
) as Record<Progress, string>
const TYPE_LABEL: Record<MediaType, string> = { movie: 'Movies', tv: 'TV shows', game: 'Games', book: 'Books' }
const PRIORITY_LABEL: Record<string, string> = { high: 'High priority', medium: 'Medium priority', low: 'Low priority', none: 'No priority' }

/**
 * Groups already-sorted items, keeping each group's order. Group order is fixed per key (`reverse` flips it). With one type selected,
 * status groups use that type's words ("Want to play", "Beat it"), matching the filter panel and title pages.
 */
export function groupItems(items: UserItem[], group: GroupKey, type: MediaType | null = null, reverse = false): Group[] {
  if (group === 'none') return [{ key: 'all', label: '', items }]
  const keyOf = (i: UserItem): [string, string] => {
    switch (group) {
      case 'status':
        return [i.progress, type ? statusLabel(i.progress, type) : STATUS_LABEL[i.progress]]
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
  if (group === 'year') groups.sort((a, b) => (b.key === '—' ? -1 : a.key === '—' ? 1 : Number(b.key) - Number(a.key)))
  else groups.sort((a, b) => order[group].indexOf(a.key) - order[group].indexOf(b.key))
  if (reverse) groups.reverse()
  // "No date" and "No priority" stay last either way.
  const blank = groups.findIndex((g) => g.key === '—' || (group === 'priority' && g.key === 'none'))
  if (blank >= 0) groups.push(groups.splice(blank, 1)[0])
  return groups
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
  tvStatus: { airing: 'Airing', returning: 'Returning', ended: 'Ended' } as Record<TvStatusFilter, string>,
  tvProgress: { not_started: 'Not started', midway: 'Mid-way', caught_up: 'Caught up' } as Record<TvProgressFilter, string>,
  sort: { priority: 'Priority', added: 'Recently added', release: 'Release date', score: 'Score', title: 'Title', updated: 'Last updated', played: 'Last played', price: 'Price', discount: 'Discount %', length: 'Length' } as Record<SortKey, string>,
  coop: { single: 'Single player', multi: 'Multiplayer', coop: 'Co-op', local: 'Local co-op', pvp: 'PvP' } as Record<CoopFilter, string>,
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
    (f.archived === 'include' ? 1 : 0) +
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
