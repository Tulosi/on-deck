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
  return Date.now() - at >= (r.imdb ? 7 * DAY_MS : DAY_MS)
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
      details: t.metadata,
      ratings: {
        imdb: t.ratings.imdb ?? undefined,
        rottenTomatoes: t.ratings.rotten_tomatoes ?? undefined,
        rtAudience: t.ratings.rt_audience ?? undefined,
        metacritic: t.ratings.metacritic ?? undefined,
        tmdb: t.ratings.tmdb,
      },
      needsScores: t.source === 'tmdb' && (scoresNeedRefresh(t.ratings) || airingInfoStale(t)),
    },
  }
}

// ─── Reading ───────────────────────────────────────────────────────────────

export const libraryKey = (userId: string | undefined) => ['library', userId]

/**
 * The items to show. Signed in → the user's real list from Supabase.
 * Signed out → sample data (isSample: true) so the UI can still be explored.
 */
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
      return (data as unknown as ItemRow[]).map(toUserItem)
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
  tmdbId: number
  mediaType: 'movie' | 'tv'
  title: string
  year: number | null
  posterUrl: string | null
  overview: string
  rating: number | null
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
    const { data, error } = await supabase!.functions.invoke('tmdb', {
      body: { action: 'add', tmdbId: result.tmdbId, mediaType: result.mediaType },
    })
    if (error) throw await functionError(error)

    // Already on deck → do nothing (unique user_id + title_id).
    const { error: insertError } = await supabase!
      .from('user_items')
      .upsert({ title_id: data.title.id }, { onConflict: 'user_id,title_id', ignoreDuplicates: true })
    if (insertError) throw insertError

    await queryClient.invalidateQueries({ queryKey: libraryKey(user?.id) })
  }
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
        const [mediaType, , tmdbId] = item.title.sourceKey!.split(':')
        await supabase!.functions
          .invoke('tmdb', { body: { action: 'add', tmdbId: Number(tmdbId), mediaType } })
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
