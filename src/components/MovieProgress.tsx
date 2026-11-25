// Title page, movies — watched state, Plex sync and availability.
import { pillButton, labelClass, SyncedPill } from './trackingParts'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { Check, Loader2, RefreshCw } from 'lucide-react'
import { friendlyError, useAvailability, type PlexWatch } from '../lib/integrations'
import { type ItemPatch } from '../lib/library'
import { useAuth } from '../lib/auth'
import { type UserItem } from '../types'

/**
 * Movies: a Progress row once Plex knows the movie — how far you got, from Plex, with Sync / Override.
 * Sync moves Status forward only (see the effect in StatusControls). Hidden when the movie isn't on Plex.
 */
export function MovieProgressSection({
  item,
  watch,
  loading,
  error,
  onRefresh,
  save,
}: {
  item: UserItem
  watch: PlexWatch | undefined
  loading: boolean
  error: unknown
  onRefresh: () => void
  save: (patch: ItemPatch) => Promise<unknown>
}) {
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="text-bad">Plex sync failed: {friendlyError(error)}</span>
        <button type="button" onClick={onRefresh} disabled={loading} className={pillButton}>
          <RefreshCw className={clsx('size-3', loading && 'animate-spin')} /> Sync from Plex
        </button>
      </div>
    )
  }
  if (!watch?.configured || !watch.found || !watch.movie) return null

  const { state, percent } = watch.movie
  const syncOn = item.plexSync !== false
  const label = state === 'watched' ? 'Watched' : state === 'in_progress' ? `${percent}% watched` : 'Not started'

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className={labelClass}>Progress</p>
        <div className="flex items-center gap-2" title={`${percent}% watched on Plex`}>
          <div
            role="progressbar"
            aria-label="Movie watched"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="flex h-1.5 w-28 overflow-hidden rounded-full bg-faint/55"
          >
            <div
              className={clsx('bar-fill h-full', percent >= 100 ? 'bg-good' : 'bg-accent-ink')}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="font-mono text-xs text-muted">{percent}%</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 items-center rounded-lg border border-line bg-bg px-3 font-mono text-sm text-fg">
          {label}
        </span>
        <span className="text-xs text-muted">
          {syncOn ? watch.server : `Manual override. Plex says ${label.toLowerCase()}`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {syncOn ? (
            <SyncedPill loading={loading} onRefresh={onRefresh} server={watch.server} />
          ) : (
            <button type="button" onClick={onRefresh} disabled={loading} className={pillButton}>
              <RefreshCw className={clsx('size-3', loading && 'animate-spin')} /> Sync from Plex
            </button>
          )}
          {syncOn ? (
            <button type="button" onClick={() => save({ plexSync: false })} className={pillButton}>
              Override
            </button>
          ) : (
            <button type="button" onClick={() => save({ plexSync: true })} className={pillButton}>
              Use Plex sync
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Top-right of the card for movies/TV: can the user watch it through any of their sources? */
export function AvailabilityBadge({ item }: { item: UserItem }) {
  const { user } = useAuth()
  const live = useAvailability(item.title)
  // Sample titles (signed out) carry their own Plex state; there are no sources to check.
  const availability: typeof live = user
    ? live
    : item.plex === 'available'
      ? { state: 'available', via: ['Plex'] }
      : { state: 'unavailable' }
  const base = 'flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs whitespace-nowrap'
  switch (availability.state) {
    case 'loading':
      return (
        <span className={`${base} border-line text-faint`}>
          <Loader2 className="size-3.5 animate-spin" /> Checking sources…
        </span>
      )
    case 'available':
      return (
        <span className={`${base} border-good/50 bg-good/10 text-good`} title={`On ${availability.via.join(', ')}`}>
          <Check className="size-3.5" /> Available
        </span>
      )
    case 'unavailable':
      return <span className={`${base} border-line text-muted`}>Not available via any of your sources</span>
    case 'no-sources':
      return (
        <Link to="/settings" className={`${base} border-line text-muted hover:text-fg`}>
          Set up your sources
        </Link>
      )
  }
}
