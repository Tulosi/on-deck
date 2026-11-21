import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { sampleItems } from '../data/sample'
import type { MediaType, Priority, Progress, SeasonOverride, UserItem, Verdict } from '../types'
import { useAuth } from './auth'
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
    scores_checked_at?: string
  } & Record<string, unknown>
  metadata: Record<string, unknown> & { overview?: string | null }
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
  completed_at: string | null
  created_at: string
  updated_at: string
  season_overrides: Record<string, SeasonOverride> | null
  title: TitleRow
}

function headlineScore(t: TitleRow): UserItem['title']['score'] {
  if (typeof t.ratings.steam === 'number') return { label: 'Steam', value: `${t.ratings.steam}%` }
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
  return Date.now() - at >= (r.imdb || typeof r.steam === 'number' ? 7 * DAY_MS : DAY_MS)
}

/**
 * TV: the stored "next episode" has aired since we last looked, so episode counts / last air date are out
 * of date. Refreshing the title (same path as score refresh) picks up the new episodes — which is what
 * lets a show marked Watched flip back to In Progress when it renews.
 */
function airingInfoStale(t: TitleRow): boolean {
  if (t.media_type !== 'tv') return false
  const next = t.metadata.next_episode_to_air as { air_date?: string } | null | undefined
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
    completedAt: row.completed_at ?? undefined,
    addedAt: row.created_at,
    updatedAt: row.updated_at,
    seasonOverrides: row.season_overrides ?? {},
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
      // Games: developer under the year on posters.
      byline:
        t.media_type === 'game' && Array.isArray(t.metadata.developer)
          ? ((t.metadata.developer as string[])[0] ?? undefined)
          : undefined,
      details: t.metadata,
      ratings: {
        imdb: t.ratings.imdb ?? undefined,
        rottenTomatoes: t.ratings.rotten_tomatoes ?? undefined,
        rtAudience: t.ratings.rt_audience ?? undefined,
        metacritic: t.ratings.metacritic ?? undefined,
        tmdb: t.ratings.tmdb,
      },
      needsScores:
        (t.source === 'tmdb' && (scoresNeedRefresh(t.ratings) || airingInfoStale(t))) ||
        (t.source === 'igdb' && scoresNeedRefresh(t.ratings)),
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

export function useItems() {
  const { user, loading: authLoading } = useAuth()
  const query = useQuery({
    queryKey: libraryKey(user?.id),
    enabled: !!user && !!supabase,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('user_items')
        .select(
          'id, owned, progress, verdict, favourite, priority, notes, current_season, current_episode, plex_sync, completed_at, created_at, updated_at, season_overrides, title:titles(*)',
        )
        .order('created_at', { ascending: false })
      if (error) throw error
      // Stored availability (movies/TV), written by the `availability` function.
      const { data: avail } = await supabase!
        .from('user_availability')
        .select('title_id, plex_status, streaming, available, became_available_at, checked_at')
      const byTitle = new Map(((avail ?? []) as AvailabilityRow[]).map((a) => [a.title_id, a]))
      return (data as unknown as ItemRow[]).map((row) => withAvailability(toUserItem(row), byTitle.get(row.title.id)))
    },
  })

  if (!user) return { items: authLoading ? [] : sampleItems, isSample: !authLoading, isLoading: authLoading, error: null }
  return { items: query.data ?? [], isSample: false, isLoading: query.isLoading, error: query.error }
}

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
  mediaType: 'movie' | 'tv' | 'game'
  /** Movies/TV (TMDB) */
  tmdbId?: number
  /** Games (IGDB) */
  igdbId?: number
  title: string
  year: number | null
  posterUrl: string | null
  overview?: string
  rating?: number | null
  /** Games: developer, shown to tell same-named games apart. */
  developer?: string | null
}

/** Matches a search result to a title already on deck (`${mediaType}:${source}:${id}`). */
export const resultKey = (r: SearchResult) =>
  r.mediaType === 'game' ? `game:igdb:${r.igdbId}` : `${r.mediaType}:tmdb:${r.tmdbId}`

export async function searchGames(query: string): Promise<SearchResult[]> {
  const { data, error } = await supabase!.functions.invoke('igdb', { body: { action: 'search', query } })
  if (error) throw await functionError(error)
  return data.results as SearchResult[]
}

export async function searchTmdb(query: string): Promise<SearchResult[]> {
  const { data, error } = await supabase!.functions.invoke('tmdb', { body: { action: 'search', query } })
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
    // Check where it's available in the background, then show it.
    void refreshAvailability({ titleIds: [data.title.id] }).then(() =>
      queryClient.invalidateQueries({ queryKey: libraryKey(user?.id) }),
    )
  }
}

/** Asks the server to (re)check availability. Returns how many stale titles are still left. */
export async function refreshAvailability(opts: { titleIds?: string[]; before?: string } = {}): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.functions.invoke('availability', { body: { action: 'refresh', ...opts } })
  if (error) throw await functionError(error)
  return (data?.remaining as number) ?? 0
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
            source === 'igdb' ? 'igdb' : 'tmdb',
            source === 'igdb'
              ? { body: { action: 'add', igdbId: Number(id) } }
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
    if (patch.owned !== undefined) row.owned = patch.owned
    if (patch.verdict !== undefined) row.verdict = patch.verdict
    if (patch.favourite !== undefined) row.favourite = patch.favourite
    if (patch.priority !== undefined) row.priority = patch.priority
    if (patch.notes !== undefined) row.notes = patch.notes?.trim() ? patch.notes : null
    if (patch.plexSync !== undefined) row.plex_sync = patch.plexSync
    if (patch.seasonOverrides !== undefined) row.season_overrides = patch.seasonOverrides
    if (patch.tvProgress !== undefined) {
      row.current_season = patch.tvProgress?.season ?? null
      row.current_episode = patch.tvProgress?.episode ?? null
    }
    if (patch.progress !== undefined) {
      row.progress = patch.progress
      const now = new Date().toISOString()
      if (patch.progress === 'in_progress' && item.progress === 'wanted') row.started_at = now
      if (patch.progress === 'completed') row.completed_at = now
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
              ...(patch.seasonOverrides !== undefined && { seasonOverrides: patch.seasonOverrides }),
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

/**
 * Renewing shows: a TV show marked Watched is "caught up" as of when it was marked. If an episode has aired
 * since then (the show's last air date is after completed_at), it goes back to In Progress. Runs across the
 * whole list on load (mount once, in AppShell). Shows marked Watched before completed_at existed are skipped.
 */
export function useRenewalCheck() {
  const { items, isSample } = useItems()
  const update = useUpdateItem()

  useEffect(() => {
    if (isSample || !supabase) return
    for (const item of items) {
      if (item.title.mediaType !== 'tv' || item.progress !== 'completed' || !item.completedAt) continue
      const lastAir = item.title.details?.last_air_date
      if (typeof lastAir !== 'string') continue
      if (lastAir > item.completedAt.slice(0, 10)) void update(item, { progress: 'in_progress' }).catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, isSample])
}

export function useRemoveItem() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return async (itemId: string) => {
    const { error } = await supabase!.from('user_items').delete().eq('id', itemId)
    if (error) throw error
    await queryClient.invalidateQueries({ queryKey: libraryKey(user?.id) })
  }
}
