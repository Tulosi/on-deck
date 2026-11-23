import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, Check, ChevronRight, Library, Loader2, RefreshCw, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { friendlyError, useAvailability, usePlexWatch, type PlexWatch } from '../lib/integrations'
import { useUpdateItem, type ItemPatch } from '../lib/library'
import { statusesFor, statusLabel } from '../lib/statusLabels'
import { plexPatch } from '../../supabase/functions/_shared/plexApply.ts'
import { plexStateOf } from '../lib/plexSync'
import { airedCounter, completion, isOngoing, overrideOf, seasonsOf, watchedIn, type SeasonMeta } from '../lib/seasons'
import { type Priority, type Progress, type SeasonOverride, type UserItem } from '../types'

const labelClass = 'font-mono text-[11px] tracking-wider text-faint uppercase'

/** Segmented control: one option active at a time. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  aside,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  /** Extra control to the right of the options (e.g. Archive). */
  aside?: ReactNode
}) {
  // Phones: 2 per row for 4 options, 3 + 2 for 5 (never a lone option on its own line). One row from sm up.
  const cols = options.length === 5 ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'
  return (
    <div className="space-y-1.5">
      <p className={labelClass}>{label}</p>
      <div className="flex flex-wrap items-stretch gap-2">
      <div
        role="radiogroup"
        aria-label={label}
        // Phones: full width (anything in `aside` drops to its own line); wider: options grow beside it.
        className={clsx('grid min-w-0 basis-full gap-1 rounded-lg border border-line bg-bg p-1 sm:basis-auto sm:flex-1', cols)}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={clsx(
              'rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors',
              value === o.value ? 'bg-accent font-medium text-accent-fg' : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {aside}
      </div>
    </div>
  )
}

/** Archive: confirm, then hide the title everywhere by default. Archived titles show a notice to bring them back. */
function ArchiveButton({ item, save }: { item: UserItem; save: (patch: ItemPatch) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  if (item.archivedAt) {
    return (
      <button
        type="button"
        onClick={() => void save({ archived: false })}
        className="flex h-9 items-center gap-1.5 self-start rounded-lg border border-accent/60 bg-accent/10 px-3 text-sm text-fg hover:border-accent sm:h-auto sm:self-stretch"
        title="Take this title out of the archive"
      >
        <ArchiveRestore className="size-4" /> Unarchive
      </button>
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-9 items-center gap-1.5 self-start rounded-lg border border-line px-3 text-sm text-muted hover:border-faint hover:text-fg sm:h-auto sm:self-stretch"
        title="Archive this title"
      >
        <Archive className="size-4" /> Archive
      </button>
      {confirming &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="archive-title">
            <div className="absolute inset-0 bg-black/60" onClick={() => setConfirming(false)} />
            <div className="relative w-full max-w-sm space-y-3 rounded-xl border border-line bg-surface p-5 shadow-2xl">
              <p id="archive-title" className="text-base font-semibold text-fg">
                Archive “{item.title.title}”?
              </p>
              <p className="text-sm text-muted">For things you're done with but want a record of. Archiving:</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                <li>Hides it from Home, the Library, the Calendar and collections</li>
                <li>Stops its alerts and leaves it out of share links and calendar feeds</li>
                <li>Keeps its status, rating and notes exactly as they are</li>
              </ul>
              <p className="text-xs text-faint">
                Find it again any time with the <b>Archived</b> filter in the Library, and unarchive it from its page.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setConfirming(false)} className="h-9 rounded-md border border-line px-3 text-sm text-fg hover:border-accent">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false)
                    void save({ archived: true })
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:brightness-95"
                >
                  <Archive className="size-4" /> Archive
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/** On/off pill with an icon. */
function Toggle({
  on,
  onClick,
  children,
  activeClass,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
  activeClass: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        'flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors',
        on ? activeClass : 'border-line text-muted hover:border-faint hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

/** The most recent aired episode outside ignored seasons — "caught up" when marking a show Watched. */
function latestAired(item: UserItem, seasons: SeasonMeta[]): { season: number; episode: number } | null {
  const airedIn = airedCounter(item)
  for (let i = seasons.length - 1; i >= 0; i--) {
    if (overrideOf(item, seasons[i].season_number) === 'ignored') continue
    const n = airedIn(seasons[i])
    if (n > 0) return { season: seasons[i].season_number, episode: n }
  }
  return null
}

/** Collapsed-by-default per-season controls: Auto (follows Progress) / Watched / Unwatched / Ignore. */
function SeasonOptions({
  item,
  seasons,
  save,
}: {
  item: UserItem
  seasons: SeasonMeta[]
  save: (patch: ItemPatch) => Promise<void>
}) {
  const airedIn = airedCounter(item)
  const overridden = Object.keys(item.seasonOverrides ?? {}).length
  const choices: { value: SeasonOverride | 'auto'; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'watched', label: 'Watched' },
    { value: 'unwatched', label: 'Unwatched' },
    { value: 'ignored', label: 'Ignore' },
  ]

  function set(season: number, value: SeasonOverride | 'auto') {
    const next = { ...(item.seasonOverrides ?? {}) }
    if (value === 'auto') delete next[String(season)]
    else next[String(season)] = value
    void save({ seasonOverrides: next })
  }

  return (
    <details className="group rounded-lg border border-line bg-bg">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs text-muted select-none hover:text-fg [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          More options — per-season tracking
        </span>
        {overridden > 0 && <span className="font-mono text-faint">{overridden} overridden</span>}
      </summary>
      <ul className="divide-y divide-line border-t border-line">
        {seasons.map((s) => {
          const aired = airedIn(s)
          const value = overrideOf(item, s.season_number)
          const w = value === 'ignored' ? null : watchedIn(item, s, aired)
          return (
            <li key={s.season_number} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <div className="min-w-[8rem] flex-1">
                <p className={clsx('text-sm', value === 'ignored' ? 'text-faint line-through' : 'text-fg')}>
                  Season {s.season_number}
                </p>
                <p className="font-mono text-[11px] text-faint">
                  {aired === 0
                    ? 'Not aired yet'
                    : value === 'ignored'
                      ? `${aired} aired · ignored`
                      : `${w} / ${aired} watched${value === 'auto' ? ' · auto' : ''}`}
                </p>
              </div>
              <div role="radiogroup" aria-label={`Season ${s.season_number}`} className="flex gap-0.5 rounded-md border border-line p-0.5">
                {choices.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={value === c.value}
                    onClick={() => set(s.season_number, c.value)}
                    className={clsx(
                      'rounded px-2 py-1 text-xs whitespace-nowrap transition-colors',
                      value === c.value ? 'bg-raised font-medium text-fg' : 'text-muted hover:text-fg',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="border-t border-line px-3 py-2 text-[11px] text-faint">
        Auto follows Progress{item.plexSync !== false ? ' (and Plex sync)' : ''}. Ignored seasons count as done
        and show in pale orange on the progress bar.
      </p>
    </details>
  )
}

/** "Watched up to" label with a completion bar: watched / aired episodes. */
function WatchedHeading({ item, seasons, checking }: { item: UserItem; seasons: SeasonMeta[]; checking?: boolean }) {
  const { watched, ignored, aired } = completion(item, seasons)
  const watchedPct = aired > 0 ? (watched / aired) * 100 : 0
  const ignoredPct = aired > 0 ? (ignored / aired) * 100 : 0
  const done = aired > 0 && watched + ignored >= aired
  const tip =
    `${Math.round(watchedPct)}% watched` + (ignored > 0 ? `, ${Math.round(ignoredPct)}% ignored` : '')
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className={clsx(labelClass, 'flex items-center gap-1.5')}>
        Progress
        {/* Inline, so it takes no extra space while Plex is being checked. */}
        {checking && (
          <span className="flex items-center gap-1 normal-case tracking-normal" title="Checking your Plex watch history">
            <Loader2 className="size-3 animate-spin" /> Plex…
          </span>
        )}
      </p>
      {aired > 0 && (
        <div className="flex items-center gap-2" title={tip}>
          {/* Watched (accent, green when everything's accounted for) then ignored (pale orange) then the rest. */}
          <div
            role="progressbar"
            aria-label="Episodes watched"
            aria-valuetext={tip}
            aria-valuemin={0}
            aria-valuemax={aired}
            aria-valuenow={watched + ignored}
            className="flex h-1.5 w-28 overflow-hidden rounded-full bg-faint/55"
          >
            <div
              className={clsx('h-full transition-[width]', done ? 'bg-good' : 'bg-accent')}
              style={{ width: `${watchedPct}%` }}
            />
            <div className="h-full bg-orange-300/80 transition-[width]" style={{ width: `${ignoredPct}%` }} />
          </div>
          {/* Ignored episodes are tallied in the count (they're "accounted for"), and also shown on their own. */}
          <span className="font-mono text-xs text-muted">
            {watched + ignored} / {aired}
            {ignored > 0 && <span className="text-orange-300"> · {ignored} ignored</span>}
          </span>
        </div>
      )}
    </div>
  )
}

const selectClass =
  'h-9 rounded-lg border border-line bg-bg px-2.5 text-sm text-fg outline-none focus:border-accent'

/**
 * Season + episode dropdowns, limited to the show's actual seasons and episode counts. `value` null = not
 * started: the episode menu reads "Not started" until you pick one.
 */
function EpisodePicker({
  seasons,
  value,
  onChange,
}: {
  seasons: SeasonMeta[]
  value: { season: number; episode: number } | null
  onChange: (next: { season: number; episode: number }) => void
}) {
  const [pickedSeason, setPickedSeason] = useState<number | null>(null)
  const season =
    seasons.find((s) => s.season_number === (value?.season ?? pickedSeason)) ?? seasons[0]
  const episodes = season?.episode_count ?? 1
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Season"
        value={season?.season_number}
        onChange={(e) => {
          // Not started yet: changing the season only changes the episode list; nothing is saved until an episode is picked.
          if (!value) setPickedSeason(Number(e.target.value))
          else onChange({ season: Number(e.target.value), episode: 1 })
        }}
        className={selectClass}
      >
        {seasons.map((s) => (
          <option key={s.season_number} value={s.season_number}>
            Season {s.season_number}
          </option>
        ))}
      </select>
      <select
        aria-label="Episode"
        value={value ? Math.min(value.episode, episodes) : 0}
        onChange={(e) => Number(e.target.value) > 0 && onChange({ season: season.season_number, episode: Number(e.target.value) })}
        className={selectClass}
      >
        {!value && <option value={0}>Not started</option>}
        {Array.from({ length: episodes }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            Episode {n}
          </option>
        ))}
      </select>
      <span className="font-mono text-xs text-faint">of {episodes}</span>
    </div>
  )
}

const pillButton =
  'flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-fg disabled:opacity-60'

/** Shown while a title is actively synced from Plex: a green status (tap to check Plex again). */
function SyncedPill({ loading, onRefresh, server }: { loading: boolean; onRefresh: () => void; server?: string | null }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={loading}
      title={`Synced from Plex${server ? ` (${server})` : ''}. Tap to check again.`}
      className="group flex items-center gap-1.5 rounded-full border border-good/60 bg-good/10 px-2.5 py-1 text-xs font-medium text-good disabled:opacity-80"
    >
      {loading ? <RefreshCw className="size-3 animate-spin" /> : <Check className="size-3" />}
      {loading ? 'Syncing…' : 'Synced from Plex'}
      {!loading && <RefreshCw className="size-3 opacity-50 group-hover:opacity-100" aria-hidden="true" />}
    </button>
  )
}

/**
 * "Watched up to" for TV — one source of truth at a time:
 *  - Plex sync on (show found on the user's Plex, not overridden): read-only, mirrors Plex.
 *  - Overridden, or no Plex: the user's own dropdowns.
 */
function TvProgressSection({
  item,
  seasons,
  watch,
  loading,
  error,
  onRefresh,
  save,
}: {
  item: UserItem
  seasons: SeasonMeta[]
  watch: PlexWatch | undefined
  loading: boolean
  error: unknown
  onRefresh: () => void
  save: (patch: ItemPatch) => Promise<void>
}) {
  const plexFound = !!(watch?.configured && watch.found)
  const syncOn = plexFound && item.plexSync !== false
  const plexLast = watch?.configured && watch.found ? (watch.lastWatched ?? null) : null
  const server = watch?.configured && watch.found ? watch.server : null
  const tv = item.tvProgress ?? null

  const syncButton = (
    <button type="button" onClick={onRefresh} disabled={loading} className={pillButton}>
      <RefreshCw className={clsx('size-3', loading && 'animate-spin')} /> Sync from Plex
    </button>
  )

  // ── Synced: read-only ──
  if (syncOn) {
    return (
      <div className="space-y-1.5">
        <WatchedHeading item={item} seasons={seasons} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-9 items-center rounded-lg border border-line bg-bg px-3 font-mono text-sm text-fg">
            {plexLast ? `S${plexLast.season} · E${plexLast.episode}` : 'Nothing watched yet'}
          </span>
          <span className="text-xs text-muted">{server}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <SyncedPill loading={loading} onRefresh={onRefresh} server={server} />
            <button type="button" onClick={() => save({ plexSync: false })} className={pillButton}>
              Override
            </button>
          </div>
        </div>
        {error ? <p className="text-xs text-bad">Plex sync failed: {friendlyError(error)}</p> : null}
        {seasons.length > 0 && <SeasonOptions item={item} seasons={seasons} save={save} />}
      </div>
    )
  }

  // ── Manual ──
  // Always shown for shows that aren't dropped (even at "not started"), so the section is there from the first
  // moment and nothing below it jumps when Plex answers.
  const showPicker = seasons.length > 0 && (item.progress !== 'dropped' || !!item.tvProgress || plexFound)
  const checkingPlex = !watch && loading
  let note: ReactNode = null
  if (plexFound && item.plexSync === false) {
    note = (
      <>
        Manual override
        {plexLast && (
          <>
            {' '}
            · Plex says <span className="font-mono text-fg">S{plexLast.season} · E{plexLast.episode}</span>
          </>
        )}
        <button type="button" onClick={() => save({ plexSync: true })} className={pillButton}>
          <RefreshCw className="size-3" /> Use Plex sync
        </button>
      </>
    )
  } else if (error) {
    note = (
      <>
        <span className="text-bad">Plex sync failed: {friendlyError(error)}</span>
        {syncButton}
      </>
    )
  } else if (watch?.configured && !watch.found && watch.reason === 'no_reachable_server') {
    note = <>Couldn’t reach your Plex server {syncButton}</>
  } else if (!showPicker && checkingPlex) {
    note = 'Checking your Plex watch history…'
  }

  if (!showPicker && !note) return null
  return (
    <div className="space-y-1.5">
      {showPicker && (
        <>
          <WatchedHeading item={item} seasons={seasons} checking={checkingPlex} />
          <div className="flex flex-wrap items-center gap-3">
            <EpisodePicker
              seasons={seasons}
              value={tv}
              onChange={(next) =>
                save({
                  tvProgress: next,
                  ...(item.progress === 'wanted' && { progress: 'in_progress' as const }),
                })
              }
            />
            {item.tvProgress && (
              <button type="button" onClick={() => save({ tvProgress: null })} className="text-xs text-muted hover:text-fg">
                Clear
              </button>
            )}
          </div>
        </>
      )}
      {note && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">{note}</div>}
      {showPicker && <SeasonOptions item={item} seasons={seasons} save={save} />}
    </div>
  )
}

/**
 * Movies: a Progress row once Plex knows the movie — how far you got, from Plex, with Sync / Override.
 * Sync moves Status forward only (see the effect in StatusControls). Hidden when the movie isn't on Plex.
 */
function MovieProgressSection({
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
  save: (patch: ItemPatch) => Promise<void>
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
              className={clsx('h-full transition-[width]', percent >= 100 ? 'bg-good' : 'bg-accent')}
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
          {syncOn ? watch.server : `Manual override · Plex says ${label.toLowerCase()}`}
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
function AvailabilityBadge({ item }: { item: UserItem }) {
  const availability = useAvailability(item.title)
  const base = 'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs whitespace-nowrap'
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

/** Notes box that saves itself shortly after you stop typing (and on blur). */
function Notes({ initial, onSave }: { initial: string; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const lastSaved = useRef(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function save(value: string) {
    if (value === lastSaved.current) return
    setState('saving')
    try {
      await onSave(value)
      lastSaved.current = value
      setState('saved')
    } catch {
      setState('error')
    }
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <p className={labelClass}>Notes</p>
        <span className="text-xs text-faint" aria-live="polite">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? (
            <span className="text-bad">Couldn’t save — try again</span>
          ) : null}
        </span>
      </div>
      <textarea
        value={text}
        rows={3}
        placeholder="Anything you want to remember — who recommended it, where you left off…"
        onChange={(e) => {
          const value = e.target.value
          setText(value)
          setState('idle')
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => save(value), 800)
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current)
          void save(text)
        }}
        className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg outline-none placeholder:text-faint focus:border-accent"
      />
    </div>
  )
}

/**
 * The user's own tracking for this title: progress, verdict, favourite, priority, TV progress, notes.
 * Top right: "In Your Library" (games/books) or source availability (movies/TV).
 */
export function StatusControls({ item }: { item: UserItem }) {
  const update = useUpdateItem()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const type = item.title.mediaType

  async function save(patch: ItemPatch) {
    setError(null)
    setPending((n) => n + 1)
    try {
      await update(item, patch)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save that change.')
    } finally {
      setPending((n) => n - 1)
    }
  }

  // Shows have one "done" option: Caught up while more episodes are coming, Watched once the show has ended.
  const ongoingShow = type === 'tv' && isOngoing(item)
  const doneValue: Progress = ongoingShow ? 'caught_up' : 'completed'
  // Per-type wording and options (Games / Books also get Stalled).
  const progressOptions: { value: Progress; label: string }[] = statusesFor(type, { ongoingShow }).map((p) => ({
    value: p,
    label: statusLabel(p, type),
  }))
  // A show stored as the other "done" state (e.g. Watched, then renewed) still shows the done option selected.
  const shownProgress: Progress =
    type === 'tv' && (item.progress === 'caught_up' || item.progress === 'completed') ? doneValue : item.progress
  const priorityOptions: { value: Priority | 'none'; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ]
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
    if (patch) void save(patch)
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
    void save({ progress: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plexWatch.data, item.id, item.progress, item.plexSync])

  return (
    <section className="space-y-5 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-fg">Tracking</h2>
          <span className="flex items-center gap-1.5 text-xs text-faint" aria-live="polite">
            {pending > 0 ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Saving
              </>
            ) : error ? (
              <span className="text-bad">{error}</span>
            ) : null}
          </span>
        </div>
        {type === 'game' || type === 'book' ? (
          <Toggle
            on={item.owned}
            onClick={() => save({ owned: !item.owned })}
            activeClass="border-good/60 bg-good/10 text-good"
          >
            <Library className="size-4" /> In Your Library
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
        onChange={(progress) => {
          // TV marked done by hand → up to the latest aired episode (Plex keeps control while syncing).
          const caughtUp =
            type === 'tv' && (progress === 'completed' || progress === 'caught_up') && !plexSyncActive
              ? latestAired(item, seasons)
              : null
          void save(caughtUp ? { progress, tvProgress: caughtUp } : { progress })
        }}
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
            ` · last played ${new Date(item.steamLastPlayed).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
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
          activeClass="border-accent bg-accent text-accent-fg"
        >
          <Star className={clsx('size-4', item.favourite && 'fill-current')} /> All-Time Favourite
        </Toggle>
      </div>
      </div>

      <Segmented
        label="Priority"
        value={item.priority ?? 'none'}
        options={priorityOptions}
        onChange={(p) => save({ priority: p === 'none' ? null : p })}
      />

      <Notes key={item.id} initial={item.notes ?? ''} onSave={(notes) => update(item, { notes })} />
    </section>
  )
}
