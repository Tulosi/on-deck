// Collections: named lists that can mix movies, shows, games and books (tables `collections` and
// `collection_items`, RLS = your own). Items point at your library entries (user_items).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import { supabase } from './supabase'

export interface Collection {
  id: string
  name: string
  description: string | null
  createdAt: string
  /** Library item ids, in collection order (position, then when added). */
  itemIds: string[]
}

const key = (userId: string | undefined) => ['collections', userId]

export function useCollections() {
  const { user } = useAuth()
  return useQuery({
    queryKey: key(user?.id),
    enabled: !!user && !!supabase,
    queryFn: async (): Promise<Collection[]> => {
      const { data, error } = await supabase!
        .from('collections')
        .select('id, name, description, created_at, collection_items(user_item_id, position, added_at)')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        description: (c.description as string | null) ?? null,
        createdAt: c.created_at as string,
        itemIds: ((c.collection_items ?? []) as { user_item_id: string; position: number; added_at: string }[])
          .sort((a, b) => a.position - b.position || a.added_at.localeCompare(b.added_at))
          .map((i) => i.user_item_id),
      }))
    },
  })
}

/** Create / rename / delete collections and add / remove titles, with the list kept in sync. */
export function useCollectionActions() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: key(user?.id) })
  const list = () => queryClient.getQueryData<Collection[]>(key(user?.id)) ?? []
  const setList = (fn: (l: Collection[]) => Collection[]) =>
    queryClient.setQueryData<Collection[]>(key(user?.id), (l) => fn(l ?? []))

  const create = useMutation({
    mutationFn: async ({ name, description, itemId }: { name: string; description?: string; itemId?: string }) => {
      const { data, error } = await supabase!
        .from('collections')
        .insert({ name: name.trim(), description: description?.trim() || null })
        .select('id')
        .single()
      if (error) throw error
      if (itemId) {
        const { error: addError } = await supabase!.from('collection_items').insert({ collection_id: data.id, user_item_id: itemId, position: 0 })
        if (addError) throw addError
      }
      return data.id as string
    },
    onSettled: refresh,
  })

  const update = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description: string | null }) => {
      const { error } = await supabase!
        .from('collections')
        .update({ name: name.trim(), description: description?.trim() || null })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: ({ id, name, description }) =>
      setList((l) => l.map((c) => (c.id === id ? { ...c, name: name.trim(), description: description?.trim() || null } : c))),
    onSettled: refresh,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('collections').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: (id) => setList((l) => l.filter((c) => c.id !== id)),
    onSettled: refresh,
  })

  /** Adds (at the end) or removes one library item. */
  const toggleItem = useMutation({
    mutationFn: async ({ collectionId, itemId, add }: { collectionId: string; itemId: string; add: boolean }) => {
      if (add) {
        const position = list().find((c) => c.id === collectionId)?.itemIds.length ?? 0
        const { error } = await supabase!
          .from('collection_items')
          .upsert({ collection_id: collectionId, user_item_id: itemId, position }, { onConflict: 'collection_id,user_item_id', ignoreDuplicates: true })
        if (error) throw error
      } else {
        const { error } = await supabase!.from('collection_items').delete().eq('collection_id', collectionId).eq('user_item_id', itemId)
        if (error) throw error
      }
    },
    onMutate: ({ collectionId, itemId, add }) =>
      setList((l) =>
        l.map((c) =>
          c.id !== collectionId
            ? c
            : { ...c, itemIds: add ? [...c.itemIds.filter((i) => i !== itemId), itemId] : c.itemIds.filter((i) => i !== itemId) },
        ),
      ),
    onSettled: refresh,
  })

  /** Moves an item one place earlier (-1) or later (+1) and saves the new order. */
  const move = useMutation({
    mutationFn: async ({ collectionId, itemId, by }: { collectionId: string; itemId: string; by: -1 | 1 }) => {
      const c = list().find((x) => x.id === collectionId)
      if (!c) return
      const ids = [...c.itemIds]
      const from = ids.indexOf(itemId)
      const to = from + by
      if (from < 0 || to < 0 || to >= ids.length) return
      ;[ids[from], ids[to]] = [ids[to], ids[from]]
      setList((l) => l.map((x) => (x.id === collectionId ? { ...x, itemIds: ids } : x)))
      // Save every position (lists are small; older rows may share position 0).
      await Promise.all(
        ids.map((id) =>
          supabase!.from('collection_items').update({ position: ids.indexOf(id) }).eq('collection_id', collectionId).eq('user_item_id', id),
        ),
      )
    },
    onSettled: refresh,
  })

  return { create, update, remove, toggleItem, move }
}
