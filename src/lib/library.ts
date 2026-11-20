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
  ratings: { tmdb?: number; imdb?: string } & Record<string, unknown>
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
async function functionError(error: unknown): Promise<Error> {
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

export function useRemoveItem() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return async (itemId: string) => {
    const { error } = await supabase!.from('user_items').delete().eq('id', itemId)
    if (error) throw error
    await queryClient.invalidateQueries({ queryKey: libraryKey(user?.id) })
  }
}
