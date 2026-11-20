import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { sampleItems } from '../data/sample'
import type { MediaType, Priority, Progress, UserItem, Verdict } from '../types'
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
      needsScores: t.source === 'tmdb' && scoresNeedRefresh(t.ratings),
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
          'id, owned, progress, verdict, favourite, priority, notes, current_season, current_episode, title:titles(*)',
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

export function useRemoveItem() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return async (itemId: string) => {
    const { error } = await supabase!.from('user_items').delete().eq('id', itemId)
    if (error) throw error
    await queryClient.invalidateQueries({ queryKey: libraryKey(user?.id) })
  }
}
