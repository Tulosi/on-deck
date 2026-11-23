// Read-only share links (table `share_links`; the public page is /s/:token, read via get_shared_list()).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import { supabase } from './supabase'
import { undoable } from './toast'
import type { MediaType } from '../types'

export interface ShareLink {
  id: string
  token: string
  mediaType: MediaType | null
  collectionId: string | null
  createdAt: string
}

export interface ShareScope {
  mediaType?: MediaType | null
  collectionId?: string | null
}

const key = (userId: string | undefined) => ['share-links', userId]

/** Full public URL for a token (works with the app's base path, e.g. /on-deck/). */
export const shareUrl = (token: string) => `${window.location.origin}${import.meta.env.BASE_URL}s/${token}`

const sameScope = (l: ShareLink, s: ShareScope) =>
  (l.mediaType ?? null) === (s.mediaType ?? null) && (l.collectionId ?? null) === (s.collectionId ?? null)

/** Your active (not turned off) links. */
export function useShareLinks() {
  const { user } = useAuth()
  return useQuery({
    queryKey: key(user?.id),
    enabled: !!user && !!supabase,
    queryFn: async (): Promise<ShareLink[]> => {
      const { data, error } = await supabase!
        .from('share_links')
        .select('id, token, media_type, collection_id, created_at')
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r) => ({
        id: r.id as string,
        token: r.token as string,
        mediaType: (r.media_type as MediaType | null) ?? null,
        collectionId: (r.collection_id as string | null) ?? null,
        createdAt: r.created_at as string,
      }))
    },
  })
}

export function useShareActions() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: key(user?.id) })

  /** Returns the existing active link for this scope, or makes one. */
  const getOrCreate = useMutation({
    mutationFn: async (scope: ShareScope): Promise<ShareLink> => {
      const existing = (queryClient.getQueryData<ShareLink[]>(key(user?.id)) ?? []).find((l) => sameScope(l, scope))
      if (existing) return existing
      const { data, error } = await supabase!
        .from('share_links')
        .insert({ media_type: scope.mediaType ?? null, collection_id: scope.collectionId ?? null })
        .select('id, token, media_type, collection_id, created_at')
        .single()
      if (error) throw error
      return {
        id: data.id,
        token: data.token,
        mediaType: data.media_type ?? null,
        collectionId: data.collection_id ?? null,
        createdAt: data.created_at,
      }
    },
    onSettled: refresh,
  })

  /** Turns a link off for good (anyone opening it sees "This link doesn't work"). */
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onMutate: (id) =>
      queryClient.setQueryData<ShareLink[]>(key(user?.id), (l) => (l ?? []).filter((x) => x.id !== id)),
    onSettled: refresh,
  })

  /** Turn a link off with Undo: hidden now, turned off after a few seconds unless undone. */
  const revokeWithUndo = (id: string, label: string) =>
    undoable({
      message: `Turned off the link to “${label}”`,
      hide: () => queryClient.setQueryData<ShareLink[]>(key(user?.id), (l) => (l ?? []).filter((x) => x.id !== id)),
      commit: async () => {
        const { error } = await supabase!.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
        await refresh()
      },
      restore: () => void refresh(),
      failMessage: `Couldn’t turn off the link to “${label}”. It still works.`,
    })

  return { getOrCreate, revoke, revokeWithUndo }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
