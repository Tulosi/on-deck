import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Library, Loader2, RefreshCw, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { friendlyError, useAvailability, usePlexWatch, type PlexWatch } from '../lib/integrations'
import { useUpdateItem, type ItemPatch } from '../lib/library'
import { mediaLabels, type Priority, type Progress, type SeasonOverride, type UserItem } from '../types'

const labelClass = 'font-mono text-[11px] tracking-wider text-faint uppercase'

/** Segmented control: one option active at a time. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className={labelClass}>{label}</p>
      {/* 2×2 on phones, one row from sm up — never a lone option on its own line. */}
      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-bg p-1 sm:grid-cols-4"
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
    </div>
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

interface SeasonMeta {
  season_number: number
  episode_count: number
  name?: string
  air_date?: string | null
}

/**
 * Episodes aired so far vs. watched, assuming episodes are watched in order (so "Watched up to S2 · E3"
 * counts every aired episode before it). Aired = finished seasons in full, plus the current season up to
 * the episode before the next announced one; seasons that haven't started don't count.
 */
function airedCounter(item: UserItem) {
  const next = item.title.details?.next_episode_to_air as { season_number?: number; episode_number?: number } | null
  const today = new Date().toISOString().slice(0, 10)
  return (s: SeasonMeta) => {
    if (next?.season_number != null) {
      if (s.season_number === next.season_number) return Math.max(0, (next.episode_number ?? 1) - 1)
      if (s.season_number > next.season_number) return 0
    }
    if (s.air_date && s.air_date > today) return 0
    return s.episode_count
  }
}

const overrideOf = (item: UserItem, season: number): SeasonOverride | 'auto' =>
  item.seasonOverrides?.[String(season)] ?? 'auto'

/** Watched episodes in one season: overrides win; "auto" follows the Progress pointer. */
function watchedIn(item: UserItem, s: SeasonMeta, aired: number): number {
  const o = overrideOf(item, s.season_number)
  if (o === 'watched') return aired
  if (o === 'unwatched' || o === 'ignored') return 0
  const at = item.tvProgress
  if (!at) return 0
  return s.season_number < at.season ? aired : s.season_number === at.season ? Math.min(at.episode, aired) : 0
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

/**
 * Watched / ignored / aired episodes across the show. Ignored seasons stay in the total and count as
 * done, but are reported separately so the bar can show them in their own colour.
 */
function completion(item: UserItem, seasons: SeasonMeta[]): { watched: number; ignored: number; aired: number } {
  const airedIn = airedCounter(item)
  let watched = 0
  let ignored = 0
  let aired = 0
  for (const s of seasons) {
    const n = airedIn(s)
    aired += n
    if (overrideOf(item, s.season_number) === 'ignored') ignored += n
    else watched += watchedIn(item, s, n)
  }
  return { watched, ignored, aired }
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
function WatchedHeading({ item, seasons }: { item: UserItem; seasons: SeasonMeta[] }) {
  const { watched, ignored, aired } = completion(item, seasons)
  const watchedPct = aired > 0 ? (watched / aired) * 100 : 0
  const ignoredPct = aired > 0 ? (ignored / aired) * 100 : 0
  const done = aired > 0 && watched + ignored >= aired
  const tip =
    `${Math.round(watchedPct)}% watched` + (ignored > 0 ? `, ${Math.round(ignoredPct)}% ignored` : '')
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className={labelClass}>Progress</p>
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

/**
 * Real seasons (specials excluded) with their episode counts, from the title's TMDB details.
 * The stored counts can lag behind an airing season, so the next announced episode raises its count.
 */
function seasonsOf(item: UserItem): SeasonMeta[] {
  const raw = item.title.details?.seasons
  if (!Array.isArray(raw)) return []
  const next = item.title.details?.next_episode_to_air as { season_number?: number; episode_number?: number } | null
  return (raw as SeasonMeta[])
    .filter((s) => s.season_number > 0)
    .map((s) =>
      next?.season_number === s.season_number && (next.episode_number ?? 0) > s.episode_count
        ? { ...s, episode_count: next.episode_number! }
        : s,
    )
    .filter((s) => s.episode_count > 0)
}

const selectClass =
  'h-9 rounded-lg border border-line bg-bg px-2.5 text-sm text-fg outline-none focus:border-accent'

/** Season + episode dropdowns, limited to the show's actual seasons and episode counts. */
function EpisodePicker({
  seasons,
  value,
  onChange,
}: {
  seasons: SeasonMeta[]
  value: { season: number; episode: number }
  onChange: (next: { season: number; episode: number }) => void
}) {
  const season = seasons.find((s) => s.season_number === value.season) ?? seasons[0]
  const episodes = season?.episode_count ?? 1
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Season"
        value={season?.season_number}
        onChange={(e) => onChange({ season: Number(e.target.value), episode: 1 })}
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
        value={Math.min(value.episode, episodes)}
        onChange={(e) => onChange({ season: season.season_number, episode: Number(e.target.value) })}
        className={selectClass}
      >
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
  const tv = item.tvProgress ?? { season: seasons[0]?.season_number ?? 1, episode: 1 }

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
          <span className="text-xs text-muted">from Plex · {server}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {syncButton}
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
  const showPicker = seasons.length > 0 && (item.progress === 'in_progress' || !!item.tvProgress || plexFound)
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
  } else if (!watch && loading) {
    note = 'Checking your Plex watch history…'
  }

  if (!showPicker && !note) return null
  return (
    <div className="space-y-1.5">
      {showPicker && (
        <>
          <WatchedHeading item={item} seasons={seasons} />
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
          {syncOn ? `from Plex · ${watch.server}` : `Manual override · Plex says ${label.toLowerCase()}`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={onRefresh} disabled={loading} className={pillButton}>
            <RefreshCw className={clsx('size-3', loading && 'animate-spin')} /> Sync from Plex
          </button>
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
  const done = mediaLabels[type].done

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

  const progressOptions: { value: Progress; label: string }[] = [
    { value: 'wanted', label: 'Wanted' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: done },
    { value: 'dropped', label: 'Dropped' },
  ]
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

    const patch: ItemPatch = { tvProgress: target ? { season: target.season, episode: target.episode } : null }
    if (target && item.progress !== 'dropped') {
      const final = seasons[seasons.length - 1]
      const status = item.title.details?.status
      const finishedShow =
        (status === 'Ended' || status === 'Canceled') &&
        !!final &&
        target.season === final.season_number &&
        target.episode >= final.episode_count
      if (finishedShow) patch.progress = 'completed'
      else if (item.progress === 'wanted') patch.progress = 'in_progress'
    }
    void save(patch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plexWatch.data, item.id, item.tvProgress, item.progress, item.plexSync])

  // ── Plex watch state → Status (movies) ──
  // Forward only: started → In Progress (from Wanted); finished → Watched (from Wanted / In Progress).
  // Never moves a movie backwards (it may have been watched outside Plex) and never touches Dropped.
  useEffect(() => {
    const w = plexWatch.data
    if (type !== 'movie' || !w || !w.configured || !w.found || !w.movie || item.plexSync === false) return
    let next: Progress | null = null
    if (w.movie.state === 'watched' && (item.progress === 'wanted' || item.progress === 'in_progress')) next = 'completed'
    else if (w.movie.state === 'in_progress' && item.progress === 'wanted') next = 'in_progress'
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

      {type === 'game' && item.steamPlaytimeMinutes != null && (
        <p className="-mb-2 text-xs text-muted">
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
      <Segmented
        label="Status"
        value={item.progress}
        options={progressOptions}
        onChange={(progress) => {
          // TV marked Watched by hand → caught up to the latest aired episode (Plex keeps control while syncing).
          const caughtUp =
            type === 'tv' && progress === 'completed' && !plexSyncActive ? latestAired(item, seasons) : null
          void save(caughtUp ? { progress, tvProgress: caughtUp } : { progress })
        }}
      />

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
