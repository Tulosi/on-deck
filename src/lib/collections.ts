// Collections: named lists that can mix movies, shows, games and books (tables `collections` and
// `collection_items`, RLS = your own). Items point at your library entries (user_items).
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import { applyFilters, parseFilters, sortItems } from './filters'
import { deals } from './home'
import { useNavLayout } from './navLayout'
import { useItems } from './library'
import { supabase } from './supabase'
import { undoable } from './toast'
import { sampleItems } from '../data/sample'
import type { UserItem } from '../types'

export interface Collection {
  id: string
  name: string
  description: string | null
  createdAt: string
  /** Library item ids, in collection order (position, then when added). */
  itemIds: string[]
  /** Smart collection: Library filters + sort in URL form ("type=game&length=short"). Null = hand-picked. */
  rules: string | null
  /** One of the app's default collections (built in, not stored; can be hidden but not edited). */
  builtin?: boolean
}

// ─── Default smart collections (docs/ROADMAP.md → Group C) ─────────────────

export const BUILTIN_COLLECTIONS: Collection[] = [
  {
    id: 'default-waitlist',
    name: 'Waitlist',
    description: 'Things you want that aren’t out yet, soonest first.',
    rules: 'status=wanted&release=upcoming&sort=release',
    createdAt: '',
    itemIds: [],
    builtin: true,
  },
  {
    id: 'default-early-access',
    name: 'Early Access',
    description: 'Games out in Early Access that haven’t hit 1.0 yet: ones you want, are playing, or are waiting on for 1.0.',
    // caught_up is a game's "Waiting for 1.0".
    rules: 'type=game&status=wanted,in_progress,stalled,caught_up&access=early_access&release=released',
    createdAt: '',
    itemIds: [],
    builtin: true,
  },
  {
    id: 'default-deals',
    name: 'Deals',
    description: 'Games you want and don’t own, at a historical low or your deep-discount % off or more.',
    rules: 'type=game&deal=on_sale,historical_low&sort=discount',
    createdAt: '',
    itemIds: [],
    builtin: true,
  },
]

/**
 * A default collection's titles. Waitlist: soonest release first (undated last). Deals: the same rule as Home's
 * Deals row (historical low, or at least the user's deep-discount %), biggest discount first.
 */
export function builtinItems(id: string, items: UserItem[], dealPct: number): UserItem[] {
  const visible = items.filter((i) => !i.archivedAt)
  if (id === 'default-deals') return sortItems(deals(visible, dealPct), 'discount')
  const c = BUILTIN_COLLECTIONS.find((b) => b.id === id)
  if (!c?.rules) return []
  const list = smartItems(c.rules, visible)
  if (id === 'default-waitlist') {
    return [...list].sort((a, b) => (a.title.releaseDate ?? '9999').localeCompare(b.title.releaseDate ?? '9999'))
  }
  return list
}

const sampleIds = (...names: string[]) =>
  names.map((n) => sampleItems.find((i) => i.title.title === n)?.id).filter((id): id is string => !!id)

/** Signed out: two collections over the sample library, one hand-picked and one smart, to show what they're for. */
export const SAMPLE_COLLECTIONS: Collection[] = [
  {
    id: 'sample-weekend',
    name: 'Slow weekend',
    description: 'Hand-picked, across types: a show, a film, a game and a book.',
    rules: null,
    createdAt: '',
    itemIds: sampleIds('The Bear', 'Perfect Days', 'Outer Wilds', 'Project Hail Mary'),
  },
  {
    id: 'sample-short-games',
    name: 'Short games',
    description: 'A smart collection: games under 30 hours to beat. It keeps itself up to date.',
    rules: 'type=game&length=short,medium&sort=length',
    createdAt: '',
    itemIds: [],
  },
]

/**
 * Every collection to show: the visible default collections first, then yours. `hidden` lists the defaults the
 * user has hidden (Settings → Collections brings them back).
 */
export function useCollectionList() {
  const q = useCollections()
  const { user, loading } = useAuth()
  const [layout] = useNavLayout()
  const hidden = new Set(layout.hidden ?? [])
  const defaults = BUILTIN_COLLECTIONS.filter((c) => !hidden.has(c.id))
  // Signed out there's nothing stored; the sample collections stand in.
  const mine = !loading && !user ? SAMPLE_COLLECTIONS : (q.data ?? [])
  const isLoading = !!user && q.isLoading
  return { ...q, isLoading, data: [...defaults, ...mine], list: [...defaults, ...mine], hidden }
}

/** A smart collection's current titles: the Library filtered and sorted by its rules. */
export function smartItems(rules: string, items: UserItem[]): UserItem[] {
  const f = parseFilters(new URLSearchParams(rules))
  return sortItems(applyFilters(items, f), f.sort)
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
        .select('id, name, description, rules, created_at, collection_items(user_item_id, position, added_at)')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        description: (c.description as string | null) ?? null,
        rules: (c.rules as string | null) ?? null,
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
    mutationFn: async ({
      name,
      description,
      itemId,
      rules,
    }: {
      name: string
      description?: string
      itemId?: string
      rules?: string
    }) => {
      const { data, error } = await supabase!
        .from('collections')
        .insert({ name: name.trim(), description: description?.trim() || null, rules: rules ?? null })
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

  /** Delete with Undo: gone from the list now, deleted after a few seconds unless undone. */
  const removeWithUndo = (c: { id: string; name: string }, after?: () => void) =>
    undoable({
      message: `Deleted “${c.name}”. The titles stay in your library.`,
      hide: () => {
        setList((l) => l.filter((x) => x.id !== c.id))
        after?.()
      },
      commit: async () => {
        const { error } = await supabase!.from('collections').delete().eq('id', c.id)
        if (error) throw error
        await refresh()
      },
      restore: () => void refresh(),
      failMessage: `Couldn’t delete “${c.name}”. It’s been put back.`,
    })

  /** Replaces a smart collection's rules (the sync then updates its titles). */
  const setRules = useMutation({
    mutationFn: async ({ id, rules }: { id: string; rules: string }) => {
      const { error } = await supabase!.from('collections').update({ rules }).eq('id', id)
      if (error) throw error
    },
    onMutate: ({ id, rules }) => setList((l) => l.map((c) => (c.id === id ? { ...c, rules } : c))),
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

  return { create, update, remove, removeWithUndo, toggleItem, move, setRules }
}

/**
 * Keeps each smart collection's stored titles (collection_items) the same as what its rules match right now,
 * in the same order, so counts, collages and share links stay right. Mount once (AppShell). Runs when the
 * library or the collections change; only writes when something differs.
 */
export function useSmartCollectionSync() {
  const { user } = useAuth()
  // All items: a smart collection's rules decide whether archived titles count (hidden by default).
  const { allItems: items, isSample, isLoading } = useItems()
  const { data: collections } = useCollections()
  const queryClient = useQueryClient()
  const running = useRef(false)
  // Each (collection, wanted titles) sync is tried once per session, so a failing write can't loop.
  const tried = useRef(new Set<string>())

  useEffect(() => {
    if (!user || !supabase || isSample || isLoading || !collections || running.current) return
    const stale = collections
      .filter((c) => c.rules != null)
      .map((c) => ({ c, ids: smartItems(c.rules!, items).map((i) => i.id) }))
      .filter(({ c, ids }) => ids.join() !== c.itemIds.join() && !tried.current.has(`${c.id}:${ids.join()}`))
    if (stale.length === 0) return
    stale.forEach(({ c, ids }) => tried.current.add(`${c.id}:${ids.join()}`))
    running.current = true
    void (async () => {
      try {
        for (const { c, ids } of stale) {
          await supabase!.from('collection_items').delete().eq('collection_id', c.id)
          if (ids.length) {
            await supabase!
              .from('collection_items')
              .insert(ids.map((id, position) => ({ collection_id: c.id, user_item_id: id, position })))
          }
        }
      } finally {
        running.current = false
        await queryClient.invalidateQueries({ queryKey: ['collections', user.id] })
      }
    })()
  }, [user, items, isSample, isLoading, collections, queryClient])
}
