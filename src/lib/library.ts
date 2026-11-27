import { statusLabel } from './statusLabels'
import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { sampleItems } from '../data/sample'
import { toast, undoable } from './toast'
import type { MediaType, Priority, Progress, SeasonOverride, UserItem, Verdict } from '../types'
import { cheapest, formatPrice, gamePriceFromRow, type PriceRow } from './prices'
import { useAuth } from './auth'
import { allAiredWatched, isOngoing, seasonsOf } from './seasons'
import { supabase } from './supabase'

// ─── Row shapes (mirror supabase/migrations) ───────────────────────────────

interface TitleRow {
  id: string
  media_type: MediaType
  source: string
  source_id: string
  title: string
  year: number | null
  cover_url: string | null
  backdrop_url: string | null
  genres: string[]
  ratings: {
    tmdb?: number
    steam?: number
    imdb?: string | null
    rotten_tomatoes?: string | null
    rt_audience?: string | null
    metacritic?: string | null
    hardcover?: number
    scores_checked_at?: string
  } & Record<string, unknown>
  metadata: Record<string, unknown> & { overview?: string | null }
  external_ids?: Record<string, unknown> | null
  release_date: string | null
}

interface ItemRow {
  id: string
  owned: boolean
  progress: Progress
  verdict: Verdict | null
  favourite: boolean
  priority: Priority | null
  notes: string | null
  current_season: number | null
  current_episode: number | null
  plex_sync: boolean
  notify: boolean | null
  rating_skipped: string[] | null
  stalled_at: string | null
  archived_at: string | null
  completed_at: string | null
  started_at: string | null
  created_at: string
  updated_at: string
  last_activity_at: string | null
  snoozed_until: string | null
  past_completions: string[] | null
  season_overrides: Record<string, SeasonOverride> | null
  steam_playtime_minutes: number | null
  steam_last_played: string | null
  title: TitleRow
}

function headlineScore(t: TitleRow): UserItem['title']['score'] {
  if (typeof t.ratings.steam === 'number') return { label: 'Steam', value: `${t.ratings.steam}%` }
  if (typeof t.ratings.hardcover === 'number') return { label: 'Hardcover', value: t.ratings.hardcover.toFixed(1) }
  if (t.ratings.imdb) return { label: 'IMDb', value: String(t.ratings.imdb) }
  if (typeof t.ratings.tmdb === 'number') return { label: 'TMDB', value: t.ratings.tmdb.toFixed(1) }
  return undefined
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * True when review scores are missing or stale. Mirrors scoresAreFresh() in
 * supabase/functions/_shared/scores.ts: no IMDb score yet → re-check daily; otherwise weekly.
 */
function scoresNeedRefresh(r: TitleRow['ratings']): boolean {
  const at = r.scores_checked_at ? Date.parse(r.scores_checked_at) : NaN
  if (!Number.isFinite(at)) return true
  // Has a headline score (IMDb, or Steam for games) → weekly; still waiting for one → daily.
  return Date.now() - at >= (r.imdb || typeof r.steam === 'number' || typeof r.hardcover === 'number' ? 7 * DAY_MS : DAY_MS)
}

/**
 * TV: the stored "next episode" has aired since we last looked, so episode counts / last air date are out
 * of date. Refreshing the title (same path as score refresh) picks up the new episodes — which is what
 * lets a show marked Watched flip back to In Progress when it renews.
 */
function airingInfoStale(t: TitleRow): boolean {
  if (t.media_type !== 'tv') return false
  const next = t.metadata.next_episode_to_air as { air_date?: string } | null | undefined
  // Shows airing now that were stored before per-episode dates existed: fetch them once.
  if (next && t.metadata.airing_v !== 1) return true
  return !!next?.air_date && next.air_date <= new Date().toISOString().slice(0, 10)
}

function toUserItem(row: ItemRow): UserItem {
  const t = row.title
  return {
    id: row.id,
    owned: row.owned,
    progress: row.progress,
    verdict: row.verdict ?? undefined,
    favourite: row.favourite,
    priority: row.priority ?? undefined,
    notes: row.notes ?? undefined,
    plexSync: row.plex_sync ?? true,
    notify: row.notify ?? true,
    ratingSkipped: row.rating_skipped ?? [],
    stalledAt: row.stalled_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    addedAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at ?? undefined,
    snoozedUntil: row.snoozed_until ?? undefined,
    pastCompletions: row.past_completions?.length ? row.past_completions : undefined,
    seasonOverrides: row.season_overrides ?? {},
    steamPlaytimeMinutes: row.steam_playtime_minutes ?? undefined,
    steamLastPlayed: row.steam_last_played ?? undefined,
    tvProgress:
      row.current_season != null ? { season: row.current_season, episode: row.current_episode ?? 1 } : undefined,
    title: {
      id: t.id,
      mediaType: t.media_type,
      title: t.title,
      year: t.year ?? undefined,
      coverUrl: t.cover_url ?? undefined,
      backdropUrl: t.backdrop_url ?? undefined,
      genres: t.genres,
      score: headlineScore(t),
      overview: t.metadata.overview ?? undefined,
      releaseDate: t.release_date ?? undefined,
      sourceKey: `${t.media_type}:${t.source}:${t.source_id}`,
      // Games: developer under the year on posters. Books: author.
      byline:
        t.media_type === 'game' && Array.isArray(t.metadata.developer)
          ? ((t.metadata.developer as string[])[0] ?? undefined)
          : t.media_type === 'book' && Array.isArray(t.metadata.authors)
            ? ((t.metadata.authors as string[])[0] ?? undefined)
            : undefined,
      details: t.metadata,
      steamAppId: Number(t.external_ids?.steam_appid) || undefined,
      imdbId: typeof t.external_ids?.imdb_id === 'string' ? t.external_ids.imdb_id : undefined,
      ratings: {
        imdb: t.ratings.imdb ?? undefined,
        rottenTomatoes: t.ratings.rotten_tomatoes ?? undefined,
        rtAudience: t.ratings.rt_audience ?? undefined,
        metacritic: t.ratings.metacritic ?? undefined,
        tmdb: t.ratings.tmdb,
      },
      needsScores:
        // Movies / shows saved before the top-4 cast was stored (cast_v 2) are refreshed once to pick it up.
        (t.source === 'tmdb' && (scoresNeedRefresh(t.ratings) || airingInfoStale(t) || t.metadata.cast_v !== 2)) ||
        // Games saved before release dates (precision, Early Access, 1.0) were stored are refreshed once to pick it up.
        // Games saved before time-to-beat was stored are refreshed once to pick it up.
        (t.source === 'igdb' &&
          (scoresNeedRefresh(t.ratings) ||
            t.metadata.release_milestones === undefined ||
            t.metadata.time_to_beat === undefined ||
            // Games saved before Steam's Early Access flag was read
            (!!t.external_ids?.steam_appid && t.metadata.steam_genres === undefined))) ||
        ((t.source === 'hardcover' || t.source === 'steam') && scoresNeedRefresh(t.ratings)),
    },
  }
}

// ─── Reading ───────────────────────────────────────────────────────────────

export const libraryKey = (userId: string | undefined) => ['library', userId]

/**
 * The items to show. Signed in → the user's real list from Supabase.
 * Signed out → sample data (isSample: true), kept in the same cache under the signed-out key, so the app's own
 * controls can change it: a sandbox that lives in this tab until a reload or sign-in.
 */
interface AvailabilityRow {
  title_id: string
  plex_status: string | null
  streaming: string[]
  available: boolean
  became_available_at: string | null
  checked_at: string
}

/** Plex states from Seerr → the poster dot's three states. */
const PLEX_DOT: Record<string, UserItem['plex']> = {
  available: 'available',
  partial: 'available',
  processing: 'requested',
  pending: 'requested',
  missing: 'missing',
}

function withAvailability(item: UserItem, a: AvailabilityRow | undefined): UserItem {
  if (!a) return item
  return {
    ...item,
    plex: a.plex_status ? PLEX_DOT[a.plex_status] : undefined,
    available: a.available,
    availableVia: [
      ...(a.plex_status === 'available' || a.plex_status === 'partial' ? ['Plex'] : []),
      ...(a.streaming ?? []),
    ],
    becameAvailableAt: a.became_available_at ?? undefined,
  }
}

function withPrice(item: UserItem, r: PriceRow | undefined): UserItem {
  if (!r || item.title.mediaType !== 'game') return item
  const gamePrice = gamePriceFromRow(r)
  const best = cheapest(gamePrice)
  return {
    ...item,
    gamePrice,
    price: best
      ? { amount: formatPrice(best.price, r.currency), discountPct: best.discountPct ?? undefined, atLow: best.atLow }
      : undefined,
  }
}

export function useItems() {
  const { user, loading: authLoading } = useAuth()
  const query = useQuery({
    queryKey: libraryKey(user?.id),
    enabled: !authLoading && (!user || !!supabase),
    // The sample never goes stale on its own (a refetch would throw away what you changed).
    staleTime: user ? undefined : Infinity,
    gcTime: user ? undefined : Infinity,
    queryFn: async () => {
      if (!user) return sampleItems.map((i) => ({ ...i, title: { ...i.title } }))
      // Four reads, run side by side: the library, stored availability (movies/TV, written by the
      // `availability` function), and game prices for the user's region (shared cache from `prices`).
      const itemsReq = supabase!
        .from('user_items')
        .select(
          'id, owned, progress, verdict, favourite, priority, notes, current_season, current_episode, plex_sync, notify, rating_skipped, stalled_at, archived_at, completed_at, started_at, created_at, updated_at, last_activity_at, snoozed_until, past_completions, season_overrides, steam_playtime_minutes, steam_last_played, title:titles(*)',
        )
        .order('created_at', { ascending: false })
      const availReq = supabase!
        .from('user_availability')
        .select('title_id, plex_status, streaming, available, became_available_at, checked_at')
      const pricesReq = supabase!
        .from('profiles')
        .select('country_code')
        .eq('user_id', user!.id)
        .maybeSingle()
        .then(({ data: prof }) =>
          supabase!
            .from('game_prices')
            .select('*')
            .eq('country_code', ((prof?.country_code as string | undefined) ?? 'US').toUpperCase()),
        )
      const [{ data, error }, { data: avail }, { data: priceRows }] = await Promise.all([itemsReq, availReq, pricesReq])
      if (error) throw error
      const byTitle = new Map(((avail ?? []) as AvailabilityRow[]).map((a) => [a.title_id, a]))
      const priceByTitle = new Map(((priceRows ?? []) as PriceRow[]).map((p) => [p.title_id, p]))
      return (data as unknown as ItemRow[]).map((row) =>
        withPrice(withAvailability(toUserItem(row), byTitle.get(row.title.id)), priceByTitle.get(row.title.id)),
      )
    },
  })

  const all = authLoading ? EMPTY : (query.data ?? (user ? undefined : sampleItems))
  // Archived titles are hidden everywhere by default; `allItems` is for the few places that need them
  // (the title page, search's "already added", the Library's Archived filter, collections).
  // Memoised so pages can memoise their own filtering on a stable list.
  const items = useMemo(() => (all ?? EMPTY).filter((i) => !i.archivedAt), [all])
  if (!user) {
    return { items, allItems: all ?? EMPTY, isSample: !authLoading, isLoading: authLoading, error: null, fresh: true }
  }
  return {
    items,
    allItems: all ?? EMPTY,
    isSample: false,
    isLoading: query.isLoading,
    error: query.error,
    /** Loaded from the server since this screen opened, and not mid-refetch: safe to act on automatically. */
    fresh: query.isFetchedAfterMount && !query.isFetching,
  }
}

const EMPTY: UserItem[] = []

// ─── Writing ───────────────────────────────────────────────────────────────

/** Turn a Supabase Functions error into a readable message. */
export async function functionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null)
    return new Error(body?.error ?? `Request failed (${error.context.status})`)
  }
  return error instanceof Error ? error : new Error('Request failed')
}

export interface SearchResult {
  mediaType: 'movie' | 'tv' | 'game' | 'book'
  /** Movies/TV (TMDB) */
  tmdbId?: number
  /** Games (IGDB) */
  igdbId?: number
  /** Games IGDB doesn't have yet, from Steam's store */
  steamAppId?: number
  title: string
  year: number | null
  posterUrl: string | null
  overview?: string | null
  rating?: number | null
  /** Games: developer, shown to tell same-named games apart. */
  developer?: string | null
  /** Books (Hardcover) */
  hardcoverId?: number
  author?: string | null
  series?: string | null
  /** Books: page count (search preview). */
  pages?: number | null
}

/** Matches a search result to a title already on deck (`${mediaType}:${source}:${id}`). */
export const resultKey = (r: SearchResult) =>
  r.mediaType === 'game'
    ? r.igdbId
      ? `game:igdb:${r.igdbId}`
      : `game:steam:${r.steamAppId}`
    : r.mediaType === 'book'
      ? `book:hardcover:${r.hardcoverId}`
      : `${r.mediaType}:tmdb:${r.tmdbId}`

export async function searchBooks(query: string, limit?: number): Promise<SearchResult[]> {
  const { data, error } = await supabase!.functions.invoke('hardcover', { body: { action: 'search', query, limit } })
  if (error) throw await functionError(error)
  return data.results as SearchResult[]
}

/** `fuzzy`: name-contains lookup for near matches (IGDB's normal search needs whole words). */
export async function searchGames(query: string, limit?: number, fuzzy = false): Promise<SearchResult[]> {
  const { data, error } = await supabase!.functions.invoke('igdb', { body: { action: 'search', query, limit, fuzzy } })
  if (error) throw await functionError(error)
  return data.results as SearchResult[]
}

/** Movies and/or TV from TMDB. `type` limits it to one. */
export async function searchTmdb(query: string, type?: 'movie' | 'tv', limit?: number): Promise<SearchResult[]> {
  const { data, error } = await supabase!.functions.invoke('tmdb', { body: { action: 'search', query, type, limit } })
  if (error) throw await functionError(error)
  return data.results as SearchResult[]
}

export function useAddFromTmdb() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return async (result: SearchResult) => {
    const { data, error } =
      result.mediaType === 'game'
        ? await supabase!.functions.invoke('igdb', {
            body: result.igdbId ? { action: 'add', igdbId: result.igdbId } : { action: 'add', steamAppId: result.steamAppId },
          })
        : result.mediaType === 'book'
          ? await supabase!.functions.invoke('hardcover', { body: { action: 'add', hardcoverId: result.hardcoverId } })
          : await supabase!.functions.invoke('tmdb', {
            body: { action: 'add', tmdbId: result.tmdbId, mediaType: result.mediaType },
          })
    if (error) throw await functionError(error)

    // Already on deck → do nothing (unique user_id + title_id).
    const { error: insertError } = await supabase!
      .from('user_items')
      .upsert({ title_id: data.title.id }, { onConflict: 'user_id,title_id', ignoreDuplicates: true })
    if (insertError) throw insertError

    await queryClient.invalidateQueries({ queryKey: libraryKey(user?.id) })
    // Background follow-ups, then refresh the list: where to watch (movies/TV), already owned (games).
    if (result.mediaType === 'book') return // nothing to follow up for books yet
    const follow =
      result.mediaType === 'game'
        ? Promise.all([
            supabase!.functions.invoke('steam', { body: { action: 'owned', titleIds: [data.title.id] } }),
            refreshPrices({ titleIds: [data.title.id] }),
          ])
        : refreshAvailability({ titleIds: [data.title.id] })
    void Promise.resolve(follow)
      .catch(() => undefined)
      .then(() => queryClient.invalidateQueries({ queryKey: libraryKey(user?.id) }))
  }
}

/** Asks the server to (re)check availability. Returns how many stale titles are still left. */
export async function refreshAvailability(opts: { titleIds?: string[]; before?: string } = {}): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.functions.invoke('availability', { body: { action: 'refresh', ...opts } })
  if (error) throw await functionError(error)
  return (data?.remaining as number) ?? 0
}

/** Asks the server to (re)fetch game prices. Returns how many are still due. */
export async function refreshPrices(opts: { titleIds?: string[]; before?: string } = {}): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.functions.invoke('prices', { body: { action: 'refresh', ...opts } })
  if (error) throw await functionError(error)
  return (data?.remaining as number) ?? 0
}

const pricesStarted = new Set<string>()

/** Refreshes stale game prices (older than 12 h) on app load, then reloads the list. Mount once (AppShell). */
export function usePriceRefresh() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!user || !supabase || pricesStarted.has(user.id)) return
    pricesStarted.add(user.id)
    void (async () => {
      try {
        for (let i = 0; i < 5; i++) {
          const remaining = await refreshPrices()
          await queryClient.invalidateQueries({ queryKey: libraryKey(user.id) })
          if (remaining === 0) break
        }
      } catch (err) {
        console.warn('price refresh failed', err)
      }
    })()
  }, [user, queryClient])
}

/** Availability refreshes already started per user this session (so it runs once per app load). */
const availabilityStarted = new Set<string>()

/**
 * Refreshes stale availability (older than 12 h) in the background on app load, in batches, then reloads the
 * list. Mount once (AppShell). Interim until the daily server job takes over.
 */
export function useAvailabilityRefresh() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!user || !supabase || availabilityStarted.has(user.id)) return
    availabilityStarted.add(user.id)
    void (async () => {
      try {
        for (let i = 0; i < 10; i++) {
          const remaining = await refreshAvailability()
          await queryClient.invalidateQueries({ queryKey: libraryKey(user.id) })
          if (remaining === 0) break
        }
      } catch (err) {
        console.warn('availability refresh failed', err)
      }
    })()
  }, [user, queryClient])
}

/** Titles already asked about this session, so a failing lookup isn't retried in a loop. */
const scoreBackfillAttempted = new Set<string>()

/**
 * Fills in missing or stale IMDb / Rotten Tomatoes / Metacritic scores, a few at a time, by re-running
 * the tmdb "add" (which refreshes the cached title). Mount once (AppShell).
 * Interim: a daily server-side cron will take this over along with release tracking.
 */
export function useScoreBackfill() {
  const { user } = useAuth()
  const { items, isSample } = useItems()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (isSample || !supabase || !user) return
    const todo = items
      .filter((i) => i.title.needsScores && i.title.sourceKey && !scoreBackfillAttempted.has(i.title.id))
      .slice(0, 10)
    if (todo.length === 0) return
    todo.forEach((i) => scoreBackfillAttempted.add(i.title.id))

    void (async () => {
      for (const item of todo) {
        const [mediaType, source, id] = item.title.sourceKey!.split(':')
        await supabase!.functions
          .invoke(
            source === 'igdb' || source === 'steam' ? 'igdb' : source === 'hardcover' ? 'hardcover' : 'tmdb',
            source === 'igdb'
              ? { body: { action: 'add', igdbId: Number(id) } }
              : source === 'steam'
                ? { body: { action: 'add', steamAppId: Number(id) } }
              : source === 'hardcover'
                ? { body: { action: 'add', hardcoverId: Number(id) } }
                : { body: { action: 'add', tmdbId: Number(id), mediaType } },
          )
          .catch(() => undefined)
      }
      await queryClient.invalidateQueries({ queryKey: libraryKey(user.id) })
    })()
  }, [items, isSample, user, queryClient])
}

/** Fields the user can change on their own item. */
export interface ItemPatch {
  owned?: boolean
  progress?: Progress
  verdict?: Verdict | null
  favourite?: boolean
  priority?: Priority | null
  notes?: string | null
  tvProgress?: { season: number; episode: number } | null
  /** TV: true = Watched-up-to mirrors Plex; false = manual override for this show. */
  plexSync?: boolean
  /** TV: per-season completion overrides; omitted seasons are auto. */
  seasonOverrides?: Record<string, SeasonOverride>
  /** Release, availability and price alerts for this title. */
  notify?: boolean
  /** Home rating prompts dismissed with "Not now" ("title", "s2" …). */
  ratingSkipped?: string[]
  /** true = archive, false = take out of the archive. */
  archived?: boolean
  /** Hide from Home's "Pick it back up?" row until this time (ISO); null shows it again. */
  snoozedUntil?: string | null
  /** Earlier finish dates (Start again moves the last one here; Undo puts the list back). */
  pastCompletions?: string[]
  /** Exact dates to set, after any a status change stamps (Undo puts the old ones back with this). */
  dates?: { startedAt: string | null; completedAt: string | null; stalledAt: string | null }
  /** Written by Plex sync (not the user): stamps plex_checked_at, so last_activity_at keeps Plex's own watch time. */
  fromPlex?: boolean
}

/**
 * Saves changes to one of the user's items. The UI updates immediately (optimistic) and rolls back if
 * the save fails. Progress changes also stamp started_at / completed_at.
 */
export function useUpdateItem() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const key = libraryKey(user?.id)

  return async (item: UserItem, patch: ItemPatch) => {
    const row: Record<string, unknown> = {}
    if (patch.owned !== undefined) {
      row.owned = patch.owned
      row.owned_locked = true // the user decided; the Steam ownership check leaves it alone from now on
    }
    if (patch.verdict !== undefined) row.verdict = patch.verdict
    if (patch.favourite !== undefined) row.favourite = patch.favourite
    if (patch.priority !== undefined) row.priority = patch.priority
    if (patch.notes !== undefined) row.notes = patch.notes?.trim() ? patch.notes : null
    if (patch.plexSync !== undefined) row.plex_sync = patch.plexSync
    if (patch.notify !== undefined) row.notify = patch.notify
    if (patch.ratingSkipped !== undefined) row.rating_skipped = patch.ratingSkipped
    if (patch.archived !== undefined) row.archived_at = patch.archived ? new Date().toISOString() : null
    if (patch.seasonOverrides !== undefined) row.season_overrides = patch.seasonOverrides
    if (patch.snoozedUntil !== undefined) row.snoozed_until = patch.snoozedUntil
    if (patch.pastCompletions !== undefined) row.past_completions = patch.pastCompletions
    if (patch.fromPlex) row.plex_checked_at = new Date().toISOString()
    // Status / episode changes by the user count as activity (the database stamps it too).
    const activity = !patch.fromPlex && (patch.progress !== undefined || patch.tvProgress !== undefined)
    if (patch.tvProgress !== undefined) {
      row.current_season = patch.tvProgress?.season ?? null
      row.current_episode = patch.tvProgress?.episode ?? null
    }
    if (patch.progress !== undefined) {
      row.progress = patch.progress
      row.progress_locked = true // games: the Steam playtime check won't change a status set here
      const now = new Date().toISOString()
      if (patch.progress === 'in_progress' && item.progress === 'wanted') row.started_at = now
      if (patch.progress === 'completed') row.completed_at = now
      // Back to playing / watching / reading: it isn't finished any more (Undo puts the old date back via `dates`).
      if (patch.progress === 'in_progress' || patch.progress === 'caught_up' || patch.progress === 'stalled') row.completed_at = null
      row.stalled_at = patch.progress === 'stalled' ? now : null
      if (patch.progress === 'wanted') {
        row.started_at = null
        row.completed_at = null
      }
    }
    if (patch.dates) {
      row.started_at = patch.dates.startedAt
      row.completed_at = patch.dates.completedAt
      row.stalled_at = patch.dates.stalledAt
    }
    const dateOf = (k: string) => (k in row ? { v: (row[k] as string | null) ?? undefined } : null)
    const started = dateOf('started_at')
    const completed = dateOf('completed_at')
    const stalled = dateOf('stalled_at')

    // Optimistic update of the cached library. Cancel any in-flight refetch first so it can't land
    // afterwards with older data and overwrite this change.
    await queryClient.cancelQueries({ queryKey: key })
    const previous = queryClient.getQueryData<UserItem[]>(key)
    queryClient.setQueryData<UserItem[]>(key, (items) =>
      items?.map((i) =>
        i.id === item.id
          ? {
              ...i,
              ...(patch.owned !== undefined && { owned: patch.owned }),
              ...(patch.progress !== undefined && { progress: patch.progress }),
              ...(patch.verdict !== undefined && { verdict: patch.verdict ?? undefined }),
              ...(patch.favourite !== undefined && { favourite: patch.favourite }),
              ...(patch.priority !== undefined && { priority: patch.priority ?? undefined }),
              ...(patch.notes !== undefined && { notes: patch.notes ?? undefined }),
              ...(patch.tvProgress !== undefined && { tvProgress: patch.tvProgress ?? undefined }),
              ...(patch.plexSync !== undefined && { plexSync: patch.plexSync }),
              ...(patch.notify !== undefined && { notify: patch.notify }),
              ...(patch.ratingSkipped !== undefined && { ratingSkipped: patch.ratingSkipped }),
              ...(patch.archived !== undefined && { archivedAt: patch.archived ? new Date().toISOString() : undefined }),
              ...(started && { startedAt: started.v }),
              ...(completed && { completedAt: completed.v }),
              ...(stalled && { stalledAt: stalled.v }),
              ...(patch.seasonOverrides !== undefined && { seasonOverrides: patch.seasonOverrides }),
              ...(patch.snoozedUntil !== undefined && { snoozedUntil: patch.snoozedUntil ?? undefined }),
              ...(patch.pastCompletions !== undefined && { pastCompletions: patch.pastCompletions.length ? patch.pastCompletions : undefined }),
              ...(activity && { lastActivityAt: new Date().toISOString() }),
            }
          : i,
      ),
    )

    // Signed out: the sample sandbox. The change above is the whole save.
    if (!user) return

    const { error } = await supabase!.from('user_items').update(row).eq('id', item.id)
    if (error) {
      // Put back just this title: a whole-list snapshot would also undo (or redo) other saves running at the same
      // time, e.g. a bulk change where every save fails.
      const before = previous?.find((i) => i.id === item.id)
      queryClient.setQueryData<UserItem[]>(key, (items) => items?.map((i) => (i.id === item.id && before ? before : i)))
      void queryClient.invalidateQueries({ queryKey: key })
      throw error
    }
    // Re-sync with the database once the write has landed (no-op visually when it matches).
    void queryClient.invalidateQueries({ queryKey: key })
  }
}

/** Games whose move to Want to play was undone: left on Waiting for 1.0 from then on (in this browser). */
const KEEP_WAITING = 'ondeck.keepWaiting'
function keptWaiting(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEEP_WAITING) ?? '[]') as string[]
  } catch {
    return []
  }
}
function keepWaiting(id: string) {
  try {
    localStorage.setItem(KEEP_WAITING, JSON.stringify([...new Set([...keptWaiting(), id])]))
  } catch {
    // Storage blocked: it may be moved again next visit.
  }
}

/** Status moves already attempted this session (item:from→to), so a failing save can't loop. */
const statusMovesTried = new Set<string>()

/**
 * Shows move between statuses by themselves as episodes air (Mount once: AppShell):
 *  - In Progress → Caught up: every aired episode watched, and the show is ongoing.
 *  - In Progress → Watched: every episode watched, and the show has ended.
 *  - Caught up → In Progress: a new episode has aired (so it's back in Continue).
 *  - Caught up → Watched: the show has ended and you'd watched it all.
 *  - Watched → Caught up: an ongoing show marked Watched (shows only use Watched once they've ended).
 *  - Watched → In Progress: a show you'd finished got new episodes (renewal).
 * Dropped and Wanted shows are never touched.
 *
 * Games: Waiting for 1.0 → Playing it (if you played it in Early Access) or Want to play, once the game is out of
 * Early Access (its 1.0 is out), with Undo. The dates from playing it in Early Access are kept.
 */
export function useRenewalCheck() {
  const { items, isSample, fresh } = useItems()
  const update = useUpdateItem()

  useEffect(() => {
    // Only on data just loaded from the server: an older copy (another device changed a status since) must not
    // move anything.
    if (isSample || !supabase || !fresh) return
    for (const item of items) {
      // Only when the stored data says so: older titles that never had the flag recorded are left alone.
      if (item.title.mediaType === 'game' && item.progress === 'caught_up' && item.title.details?.early_access === false) {
        const key = `${item.id}:caught_up->wanted`
        if (statusMovesTried.has(key) || keptWaiting().includes(item.id)) continue
        statusMovesTried.add(key)
        const dates = { startedAt: item.startedAt ?? null, completedAt: item.completedAt ?? null, stalledAt: item.stalledAt ?? null }
        // Played it in Early Access (Steam play time or a start date): back to Playing it. Otherwise Want to play.
        const played = (item.steamPlaytimeMinutes ?? 0) > 0 || !!item.startedAt
        const to: Progress = played ? 'in_progress' : 'wanted'
        void update(item, { progress: to, dates })
          .then(() =>
            toast({
              message: `${item.title.title} is out of Early Access, so it’s back on ${played ? 'Playing it' : 'Want to play'}`,
              key: item.id,
              duration: 10_000,
              action: {
                label: 'Undo',
                onClick: () => {
                  keepWaiting(item.id)
                  void update({ ...item, progress: to }, { progress: 'caught_up', dates }).catch(() => undefined)
                },
              },
            }),
          )
          .catch(() => undefined)
        continue
      }
      if (item.title.mediaType !== 'tv') continue
      const done = allAiredWatched(item)
      const ongoing = isOngoing(item)
      let next: Progress | null = null
      if (item.progress === 'in_progress' && done && ongoing) next = 'caught_up'
      // Watched the last episode of a show that has ended (by hand; Plex sync already does this).
      else if (item.progress === 'in_progress' && done && !ongoing) next = 'completed'
      else if (item.progress === 'caught_up' && !done && seasonsOf(item).length > 0) next = 'in_progress'
      else if (item.progress === 'caught_up' && done && !ongoing) next = 'completed'
      else if (item.progress === 'completed' && ongoing && done) next = 'caught_up'
      else if (item.progress === 'completed' && item.completedAt) {
        const lastAir = item.title.details?.last_air_date
        if (typeof lastAir === 'string' && lastAir > item.completedAt.slice(0, 10) && !done) next = 'in_progress'
      }
      if (!next) continue
      const key = `${item.id}:${item.progress}->${next}`
      if (statusMovesTried.has(key)) continue
      statusMovesTried.add(key)
      void update(item, { progress: next }).catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, isSample, fresh])
}

/**
 * Remove a title with Undo: it disappears now, and is only deleted after a few seconds unless Undo is pressed.
 * `after` runs straight away (e.g. leaving the title page).
 */
/** ", with your rating and notes" (whichever it has), for the Remove toast. */
function lostWith(item: UserItem): string {
  const parts = [(item.verdict || item.favourite) && 'rating', item.notes?.trim() && 'notes'].filter(Boolean)
  return parts.length ? `, with your ${parts.join(' and ')}` : ''
}

export function useRemoveItemWithUndo() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const key = libraryKey(user?.id)
  return (item: UserItem, after?: () => void) =>
    undoable({
      // Say what goes with it, since Remove (unlike Archive) doesn't keep them.
      message: `Removed “${item.title.title}”${lostWith(item)}`,
      hide: () => {
        queryClient.setQueryData<UserItem[]>(key, (l) => (l ?? []).filter((i) => i.id !== item.id))
        after?.()
      },
      commit: async () => {
        const { error } = await supabase!.from('user_items').delete().eq('id', item.id)
        if (error) throw error
        await queryClient.invalidateQueries({ queryKey: key })
      },
      restore: () => void queryClient.invalidateQueries({ queryKey: key }),
      failMessage: `Couldn’t remove “${item.title.title}”. It’s back in your library.`,
      key: item.id,
    })
}


/**
 * Actions on several titles at once (Library → Select). Status changes go through useUpdateItem one by one so
 * each keeps its own started / finished dates. Archive and Remove hide the titles now and save after a few
 * seconds, with Undo.
 */
/** The media type shared by every item, or null when they're mixed (for status wording). */
function oneType(items: UserItem[]) {
  const t = items[0]?.title.mediaType
  return t && items.every((i) => i.title.mediaType === t) ? t : null
}

export function useBulkItems() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const key = libraryKey(user?.id)
  const update = useUpdateItem()
  const plural = (n: number) => `${n} title${n === 1 ? '' : 's'}`

  /** "“Dune”", "“Dune” and “Arrival”", "“Dune”, “Arrival” and 3 more". */
  const names = (list: UserItem[]) => {
    const q = list.slice(0, 2).map((i) => `“${i.title.title}”`)
    const more = list.length - q.length
    return more > 0 ? `${q.join(', ')} and ${more} more` : q.join(' and ')
  }

  // Undo puts each title's own status and dates back (Want to… clears dates, so they mustn't be lost).
  // Failures name the titles and offer Retry for just those.
  const setStatus = async (items: UserItem[], progress: Progress) => {
    const changing = items.filter((i) => i.progress !== progress)
    const results = await Promise.allSettled(changing.map((i) => update(i, { progress })))
    const failed = changing.filter((_, k) => results[k].status === 'rejected')
    const done = changing.filter((_, k) => results[k].status === 'fulfilled')
    if (failed.length) {
      toast({
        message: `Couldn’t update ${names(failed)}.`,
        tone: 'error',
        duration: 10_000,
        action: { label: 'Retry', onClick: () => void setStatus(failed, progress) },
      })
      if (!done.length) return
    }
    toast({
      message: `${plural(items.length - failed.length)} set to ${statusLabel(progress, oneType(items))}`,
      duration: 10_000,
      action: done.length
        ? {
            label: 'Undo',
            onClick: () =>
              void Promise.allSettled(
                done.map((i) =>
                  update(
                    { ...i, progress },
                    {
                      progress: i.progress,
                      dates: { startedAt: i.startedAt ?? null, completedAt: i.completedAt ?? null, stalledAt: i.stalledAt ?? null },
                    },
                  ),
                ),
              ).then((r) => {
                const missed = r.filter((x) => x.status === 'rejected').length
                if (missed) toast({ message: `Couldn’t undo ${plural(missed)}. Try again.`, tone: 'error' })
              }),
          }
        : undefined,
    })
  }

  const archive = (items: UserItem[], archived: boolean) => {
    const ids = items.map((i) => i.id)
    const stamp = archived ? new Date().toISOString() : undefined
    undoable({
      message: `${archived ? 'Archived' : 'Unarchived'} ${plural(ids.length)}`,
      hide: () =>
        queryClient.setQueryData<UserItem[]>(key, (l) => (l ?? []).map((i) => (ids.includes(i.id) ? { ...i, archivedAt: stamp } : i))),
      commit: async () => {
        const { error } = await supabase!.from('user_items').update({ archived_at: stamp ?? null }).in('id', ids)
        if (error) throw error
        await queryClient.invalidateQueries({ queryKey: key })
      },
      restore: () => void queryClient.invalidateQueries({ queryKey: key }),
    })
  }

  const remove = (items: UserItem[]) => {
    const ids = items.map((i) => i.id)
    undoable({
      message: `Removed ${plural(ids.length)}`,
      hide: () => queryClient.setQueryData<UserItem[]>(key, (l) => (l ?? []).filter((i) => !ids.includes(i.id))),
      commit: async () => {
        const { error } = await supabase!.from('user_items').delete().in('id', ids)
        if (error) throw error
        await queryClient.invalidateQueries({ queryKey: key })
      },
      restore: () => void queryClient.invalidateQueries({ queryKey: key }),
      failMessage: 'Couldn’t remove those titles. They’re back in your library.',
    })
  }

  return { setStatus, archive, remove }
}
