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
  created_at: string
  updated_at: string
  last_activity_at: string | null
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
    addedAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at ?? undefined,
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
        (t.source === 'hardcover' && scoresNeedRefresh(t.ratings)),
    },
  }
}

// ─── Reading ───────────────────────────────────────────────────────────────

export const libraryKey = (userId: string | undefined) => ['library', userId]

/**
 * The items to show. Signed in → the user's real list from Supabase.
 * Signed out → sample data (isSample: true) so the UI can still be explored.
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
    enabled: !!user && !!supabase,
    queryFn: async () => {
      // Four reads, run side by side: the library, stored availability (movies/TV, written by the
      // `availability` function), and game prices for the user's region (shared cache from `prices`).
      const itemsReq = supabase!
        .from('user_items')
        .select(
          'id, owned, progress, verdict, favourite, priority, notes, current_season, current_episode, plex_sync, notify, rating_skipped, stalled_at, archived_at, completed_at, created_at, updated_at, last_activity_at, season_overrides, steam_playtime_minutes, steam_last_played, title:titles(*)',
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

  const all = user ? query.data : authLoading ? EMPTY : sampleItems
  // Archived titles are hidden everywhere by default; `allItems` is for the few places that need them
  // (the title page, search's "already added", the Library's Archived filter, collections).
  // Memoised so pages can memoise their own filtering on a stable list.
  const items = useMemo(() => (all ?? EMPTY).filter((i) => !i.archivedAt), [all])
  if (!user) {
    return { items, allItems: all ?? EMPTY, isSample: !authLoading, isLoading: authLoading, error: null }
  }
  return {
    items,
    allItems: all ?? EMPTY,
    isSample: false,
    isLoading: query.isLoading,
    error: query.error,
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
    ? `game:igdb:${r.igdbId}`
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
        ? await supabase!.functions.invoke('igdb', { body: { action: 'add', igdbId: result.igdbId } })
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
            source === 'igdb' ? 'igdb' : source === 'hardcover' ? 'hardcover' : 'tmdb',
            source === 'igdb'
              ? { body: { action: 'add', igdbId: Number(id) } }
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
      row.stalled_at = patch.progress === 'stalled' ? now : null
      if (patch.progress === 'wanted') {
        row.started_at = null
        row.completed_at = null
      }
    }

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
              ...(patch.progress === 'stalled' && { stalledAt: new Date().toISOString() }),
              ...(patch.seasonOverrides !== undefined && { seasonOverrides: patch.seasonOverrides }),
              ...(activity && { lastActivityAt: new Date().toISOString() }),
            }
          : i,
      ),
    )

    const { error } = await supabase!.from('user_items').update(row).eq('id', item.id)
    if (error) {
      queryClient.setQueryData(key, previous)
      throw error
    }
    // Re-sync with the database once the write has landed (no-op visually when it matches).
    void queryClient.invalidateQueries({ queryKey: key })
  }
}

/** Status moves already attempted this session (item:from→to), so a failing save can't loop. */
const statusMovesTried = new Set<string>()

/**
 * Shows move between statuses by themselves as episodes air (Mount once: AppShell):
 *  - In Progress → Caught up: every aired episode watched, and the show is ongoing.
 *  - Caught up → In Progress: a new episode has aired (so it's back in Continue).
 *  - Caught up → Watched: the show has ended and you'd watched it all.
 *  - Watched → Caught up: an ongoing show marked Watched (shows only use Watched once they've ended).
 *  - Watched → In Progress: a show you'd finished got new episodes (renewal).
 * Dropped and Wanted shows are never touched.
 */
export function useRenewalCheck() {
  const { items, isSample } = useItems()
  const update = useUpdateItem()

  useEffect(() => {
    if (isSample || !supabase) return
    for (const item of items) {
      if (item.title.mediaType !== 'tv') continue
      const done = allAiredWatched(item)
      const ongoing = isOngoing(item)
      let next: Progress | null = null
      if (item.progress === 'in_progress' && done && ongoing) next = 'caught_up'
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
  }, [items, isSample])
}

/**
 * Remove a title with Undo: it disappears now, and is only deleted after a few seconds unless Undo is pressed.
 * `after` runs straight away (e.g. leaving the title page).
 */
export function useRemoveItemWithUndo() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const key = libraryKey(user?.id)
  return (item: UserItem, after?: () => void) =>
    undoable({
      message: `Removed “${item.title.title}”`,
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
    })
}


/**
 * Actions on several titles at once (Library → Select). Status changes go through useUpdateItem one by one so
 * each keeps its own started / finished dates. Archive and Remove hide the titles now and save after a few
 * seconds, with Undo.
 */
export function useBulkItems() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const key = libraryKey(user?.id)
  const update = useUpdateItem()
  const plural = (n: number) => `${n} title${n === 1 ? '' : 's'}`

  const setStatus = async (items: UserItem[], progress: Progress) => {
    const results = await Promise.allSettled(items.filter((i) => i.progress !== progress).map((i) => update(i, { progress })))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed) toast({ message: `Couldn’t update ${plural(failed)}. Try again.`, tone: 'error' })
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
