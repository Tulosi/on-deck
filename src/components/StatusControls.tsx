import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { PriorityScale } from './PriorityScale'
import { Check, Library, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { usePlexWatch } from '../lib/integrations'
import { statusesFor, statusLabel } from '../lib/statusLabels'
import { plexPatch } from '../../supabase/functions/_shared/plexApply.ts'
import { plexStateOf } from '../lib/plexSync'
import { episodeCode } from '../lib/release'
import { upNext } from '../lib/home'
import { useKeys } from '../lib/shortcuts'
import { toast } from '../lib/toast'
import { isOngoing, seasonsOf } from '../lib/seasons'
import { type Progress, type UserItem } from '../types'
import { labelClass, Segmented, ArchiveButton, Toggle, Notes, useSaver, SaveState } from './trackingParts'
import { latestAired, TvProgressSection, NextUp } from './TvProgress'
import { MovieProgressSection, AvailabilityBadge } from './MovieProgress'

/**
 * The main action on a title page, placed right under the title: Status, plus how far along you are
 * (episode for TV, watched state for movies, Steam playtime for games).
 * Top right: "In your library" (games/books) or source availability (movies/TV).
 * Rating, priority and notes live further down, in <TrackingDetails>.
 */
export function StatusControls({ item }: { item: UserItem }) {
  const { save, pending, error } = useSaver(item)
  const type = item.title.mediaType

  // Shows have one "done" option: Caught up while more episodes are coming, Watched once the show has ended.
  const ongoingShow = type === 'tv' && isOngoing(item)
  const doneValue: Progress = ongoingShow ? 'caught_up' : 'completed'
  // Per-type wording and options (Games / Books also get Stalled).
  const progressOptions: { value: Progress; label: string }[] = statusesFor(type, {
    ongoingShow,
    earlyAccess: type === 'game' && item.title.details?.early_access === true,
    current: item.progress,
  }).map((p) => ({
    value: p,
    label: statusLabel(p, type),
  }))
  // A show stored as the other "done" state (e.g. Watched, then renewed) still shows the done option selected.
  const shownProgress: Progress =
    type === 'tv' && (item.progress === 'caught_up' || item.progress === 'completed') ? doneValue : item.progress
  const seasons = seasonsOf(item)
  // ── Plex watch history → "Watched up to" (TV) ──
  // While sync is on for this show, Watched up to mirrors Plex exactly (forwards or backwards).
  // Progress: Wanted → In Progress once anything is watched; Watched once the final episode of an
  // ended/cancelled show is watched. A Dropped show is never changed.
  const plexWatch = usePlexWatch(item.title)
  const plexSyncActive = !!(plexWatch.data?.configured && plexWatch.data.found && item.plexSync !== false)
  const lastApplied = useRef<string | null>(null)
  useEffect(() => {
    const w = plexWatch.data
    if (type !== 'tv' || !w || !w.configured || !w.found || item.plexSync === false) return
    const target = w.lastWatched ?? null
    const cur = item.tvProgress ?? null
    const same = (!target && !cur) || (!!target && !!cur && target.season === cur.season && target.episode === cur.episode)
    if (same) return
    // Keyed on target *and* the current value: guards against re-sending while a save is in flight, but
    // a fresh mismatch (e.g. the user cleared it, then turned sync back on) is always applied.
    const fmt = (p: { season: number; episode: number } | null) => (p ? `${p.season}:${p.episode}` : 'none')
    const key = `${item.id}:${fmt(target)}<-${fmt(cur)}`
    if (lastApplied.current === key) return
    lastApplied.current = key

    const patch = plexPatch(plexStateOf(item), w)
    if (patch) void save({ ...patch, fromPlex: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plexWatch.data, item.id, item.tvProgress, item.progress, item.plexSync])

  // ── Plex watch state → Status (movies) ──
  // Forward only: started → In Progress (from Wanted); finished → Watched (from Wanted / In Progress).
  // Never moves a movie backwards (it may have been watched outside Plex) and never touches Dropped.
  useEffect(() => {
    const w = plexWatch.data
    if (type !== 'movie' || !w || !w.configured || !w.found || !w.movie || item.plexSync === false) return
    const next = plexPatch(plexStateOf(item), w)?.progress ?? null
    if (!next) return
    const key = `${item.id}:${w.movie.state}<-${item.progress}`
    if (lastApplied.current === key) return
    lastApplied.current = key
    void save({ progress: next, fromPlex: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plexWatch.data, item.id, item.progress, item.plexSync])

  // Status change, from a tap or the number keys. TV marked done by hand → up to the latest aired episode (Plex
  // keeps control while syncing).
  const setProgress = (progress: Progress) => {
    const caughtUp =
      type === 'tv' && (progress === 'completed' || progress === 'caught_up') && !plexSyncActive
        ? latestAired(item, seasons)
        : null
    void save(caughtUp ? { progress, tvProgress: caughtUp } : { progress })
  }
  // Next episode watched, from the button or W. Undo puts back the episode (and status) from before.
  const markNext = (ep: { season: number; episode: number }) => {
    const before = { tvProgress: item.tvProgress ?? null, progress: item.progress }
    save({ tvProgress: ep, ...(item.progress === 'wanted' && { progress: 'in_progress' as const }) }).then((ok) =>
      ok && toast({ message: `Marked ${episodeCode(ep)} watched`, action: { label: 'Undo', onClick: () => void save(before) } }),
    )
  }
  useKeys((key) => {
    const n = Number(key)
    if (Number.isInteger(n) && n >= 1 && n <= progressOptions.length) {
      setProgress(progressOptions[n - 1].value)
      return true
    }
    if (key.toLowerCase() === 'w' && type === 'tv') {
      const next = upNext(item)
      if (!next.watchable || item.progress === 'dropped' || next.note === 'Last watched') return
      markNext(next.watchable)
      return true
    }
  })
  return (
    <section className="space-y-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-fg">Tracking</h2>
          <SaveState pending={pending} error={error} />
        </div>
        {type === 'game' || type === 'book' ? (
          <Toggle
            on={item.owned}
            onClick={() => save({ owned: !item.owned })}
            activeClass="border-good/60 bg-good/10 text-good"
          >
            <Library className="size-4" /> In your library
            {item.owned && <Check className="size-3.5" />}
          </Toggle>
        ) : (
          <AvailabilityBadge item={item} />
        )}
      </div>

      <Segmented
        label="Status"
        value={shownProgress}
        options={progressOptions}
        aside={<ArchiveButton item={item} save={save} />}
        numberKeys
        onChange={setProgress}
      />
      {type === 'game' && item.steamPlaytimeMinutes != null && (
        <p className="-mt-2 text-xs text-muted">
          Steam:{' '}
          <span className="font-mono text-fg">
            {item.steamPlaytimeMinutes < 60
              ? `${item.steamPlaytimeMinutes} min`
              : `${(item.steamPlaytimeMinutes / 60).toFixed(1)} h`}
          </span>{' '}
          played
          {item.steamLastPlayed &&
            `, last played ${new Date(item.steamLastPlayed).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
        </p>
      )}

      {type === 'movie' && (
        <MovieProgressSection
          item={item}
          watch={plexWatch.data}
          loading={plexWatch.isFetching}
          error={plexWatch.error}
          onRefresh={() => void plexWatch.refetch()}
          save={save}
        />
      )}

      {type === 'tv' && <NextUp item={item} mark={markNext} />}

      {type === 'tv' && (
        <TvProgressSection
          item={item}
          seasons={seasons}
          watch={plexWatch.data}
          loading={plexWatch.isFetching}
          error={plexWatch.error}
          onRefresh={() => void plexWatch.refetch()}
          save={save}
        />
      )}

    </section>
  )
}

/** The rest of your tracking: rating, priority and notes. Below the overview on the title page. */
export function TrackingDetails({ item }: { item: UserItem }) {
  const { save, update, pending, error } = useSaver(item)
  return (
    <section className="space-y-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-fg">Your take</h2>
        <SaveState pending={pending} error={error} />
      </div>
      <div className="space-y-1.5">
      <p className={labelClass}>Rating</p>
      <div className="flex flex-wrap gap-2">
        <Toggle
          on={item.verdict === 'liked'}
          onClick={() => save({ verdict: item.verdict === 'liked' ? null : 'liked' })}
          activeClass="border-good/60 bg-good/10 text-good"
        >
          <ThumbsUp className="size-4" /> Liked it
        </Toggle>
        <Toggle
          on={item.verdict === 'disliked'}
          onClick={() => save({ verdict: item.verdict === 'disliked' ? null : 'disliked' })}
          activeClass="border-bad/60 bg-bad/10 text-bad"
        >
          <ThumbsDown className="size-4" /> Didn’t like it
        </Toggle>
        <Toggle
          on={item.favourite}
          onClick={() => save({ favourite: !item.favourite })}
          activeClass="border-accent/70 bg-accent/10 text-accent-ink"
        >
          <Star className={clsx('size-4', item.favourite && 'fill-current')} /> All-time favourite
        </Toggle>
      </div>
      </div>

      <PriorityScale value={item.priority ?? 'none'} onChange={(p) => save({ priority: p === 'none' ? null : p })} />

      <Notes key={item.id} initial={item.notes ?? ''} onSave={(notes) => update(item, { notes })} />
    </section>
  )
}
