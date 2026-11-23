// Background Plex sync: brings Plex watch progress into your library without opening each title's page.
// Same rules as the show page (supabase/functions/_shared/plexApply.ts); the `daily` job does this too,
// server-side, every few hours.
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { finalSeasonOf, plexPatch, type PlexItemState } from '../../supabase/functions/_shared/plexApply.ts'
import { useAuth } from './auth'
import { callFn, tmdbRef, usePlexStatus, type PlexWatch } from './integrations'
import { useItems, useUpdateItem } from './library'
import type { UserItem } from '../types'

/** An item's current state, in the shape the shared Plex rules take. */
export function plexStateOf(item: UserItem): PlexItemState {
  return {
    mediaType: item.title.mediaType === 'movie' ? 'movie' : 'tv',
    progress: item.progress,
    tvProgress: item.tvProgress ?? null,
    plexSync: item.plexSync !== false,
    showStatus: typeof item.title.details?.status === 'string' ? item.title.details.status : null,
    finalSeason: finalSeasonOf(item.title.details),
  }
}

/** Titles whose Plex progress can still move them along. */
function syncable(i: UserItem): boolean {
  if (i.plexSync === false) return false
  if (i.title.mediaType === 'tv') return ['wanted', 'in_progress', 'caught_up'].includes(i.progress)
  if (i.title.mediaType === 'movie') return i.progress === 'wanted' || i.progress === 'in_progress'
  return false
}

const PER_PASS = 6
const NEW_MS = 15 * 60_000
/** Items already checked this session (the daily job covers the rest over time). */
const checked = new Set<string>()

/**
 * On app load (and whenever the library changes, e.g. right after adding a title), checks Plex for a few
 * titles at a time: just-added titles first, then shows you're watching, then the rest. Mount once (AppShell).
 */
export function usePlexBackgroundSync() {
  const { user } = useAuth()
  const { items, isSample, isLoading } = useItems()
  const plex = usePlexStatus()
  const update = useUpdateItem()
  const queryClient = useQueryClient()
  const running = useRef(false)

  useEffect(() => {
    if (!user || isSample || isLoading || !plex.data?.linked || running.current) return
    const now = Date.now()
    const rank = (i: UserItem) =>
      i.addedAt && now - Date.parse(i.addedAt) < NEW_MS ? 0 : i.progress === 'in_progress' || i.progress === 'caught_up' ? 1 : 2
    const batch = items
      .filter((i) => syncable(i) && !checked.has(i.id) && tmdbRef(i.title))
      .sort((a, b) => rank(a) - rank(b) || Date.parse(b.updatedAt ?? '0') - Date.parse(a.updatedAt ?? '0'))
      .slice(0, PER_PASS)
    if (batch.length === 0) return
    batch.forEach((i) => checked.add(i.id))
    running.current = true

    void (async () => {
      try {
        for (const item of batch) {
          const ref = tmdbRef(item.title)!
          // Same cache entry the title page uses, so opening it right after doesn't ask Plex again.
          const w = await queryClient
            .fetchQuery({
              queryKey: ['plex-watch', user.id, ref.mediaType, ref.tmdbId],
              staleTime: 10 * 60_000,
              queryFn: () =>
                callFn<PlexWatch>('plex-watch', { action: 'sync', tmdbId: ref.tmdbId, title: item.title.title, mediaType: ref.mediaType }),
            })
            .catch(() => null)
          const patch = plexPatch(plexStateOf(item), w as Parameters<typeof plexPatch>[1])
          if (patch) await update(item, { ...patch, fromPlex: true }).catch(() => undefined)
        }
      } finally {
        running.current = false
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, user, isSample, isLoading, plex.data?.linked])
}
