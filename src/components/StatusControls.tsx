import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useDialog } from '../lib/useDialog'
import clsx from 'clsx'
import { RollingText } from './RollingText'
import { PriorityScale } from './PriorityScale'
import { useSlidingIndicator } from '../lib/useSlidingIndicator'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, Check, ChevronRight, Library, Loader2, RefreshCw, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { friendlyError, useAvailability, usePlexWatch, type PlexWatch } from '../lib/integrations'
import { useUpdateItem, type ItemPatch } from '../lib/library'
import { statusesFor, statusLabel } from '../lib/statusLabels'
import { plexPatch } from '../../supabase/functions/_shared/plexApply.ts'
import { plexStateOf } from '../lib/plexSync'
import { episodeCode } from '../lib/release'
import { upNext } from '../lib/home'
import { useKeys } from '../lib/shortcuts'
import { toast } from '../lib/toast'
import { airedCounter, completion, isOngoing, overrideOf, seasonsOf, watchedIn, type SeasonMeta } from '../lib/seasons'
import { type Progress, type SeasonOverride, type UserItem } from '../types'
import { plainError } from '../lib/errors'

const labelClass = 'text-xs font-medium text-muted'

/** Segmented control: one option active at a time. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  aside,
  fit,
  numberKeys,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  /** Extra control to the right of the options (e.g. Archive). */
  aside?: ReactNode
  /** Size to the labels instead of stretching across the card (short options like Priority). */
  fit?: boolean
  /** Options answer the number keys 1, 2, 3… (announced to screen readers; the handler lives with the caller). */
  numberKeys?: boolean
}) {
  // Laid out by the space the control actually has (a container query), not the window width: on desktop the
  // card sits in a narrower column. Narrow: 2 per row for 4 options, 3 + 2 for 5 (never a lone option on its
  // own line), with `aside` (Archive) on its own line. Wide enough: one row, with `aside` beside it.
  const five = options.length === 5
  const cols = five ? 'grid-cols-3 @[36rem]/status:grid-cols-5' : 'grid-cols-2 @[30rem]/status:grid-cols-4'
  const row = five
    ? 'basis-full @[36rem]/status:basis-auto @[36rem]/status:flex-1'
    : 'basis-full @[30rem]/status:basis-auto @[30rem]/status:flex-1'
  const group = useSlidingIndicator<HTMLDivElement>(value)
  return (
    <div className="space-y-1.5">
      <p className={labelClass}>{label}</p>
      <div className="@container/status flex flex-wrap items-stretch gap-2">
      <div
        ref={group}
        role="radiogroup"
        aria-label={label}
        className={clsx('relative grid min-w-0 gap-1 rounded-lg border border-line bg-bg p-1', fit ? 'w-fit grid-flow-col auto-cols-fr' : [row, cols])}
      >
        <span aria-hidden="true" className="slide-ind rounded-md bg-raised shadow-[inset_0_0_0_1px_var(--color-line)]" />
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            aria-keyshortcuts={numberKeys ? String(i + 1) : undefined}
            title={numberKeys ? `${o.label} (${i + 1})` : undefined}
            onClick={() => onChange(o.value)}
            className={clsx(
              // Labels wrap inside their button (never overrun it) when space is tight.
              'relative rounded-md px-2 py-1.5 text-sm leading-tight text-balance transition-colors',
              value === o.value ? 'font-medium text-fg' : 'text-muted hover:text-fg',
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
function ArchiveButton({ item, save }: { item: UserItem; save: (patch: ItemPatch) => Promise<unknown> }) {
  const [confirming, setConfirming] = useState(false)
  const panel = useDialog<HTMLDivElement>(confirming, () => setConfirming(false))
  if (item.archivedAt) {
    return (
      <button
        type="button"
        onClick={() => void save({ archived: false })}
        className="flex h-9 items-center gap-1.5 self-start rounded-lg border border-accent/60 bg-accent/10 px-3 text-sm text-fg hover:border-accent @[30rem]/status:h-auto @[30rem]/status:self-stretch"
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
        className="flex h-9 items-center gap-1.5 self-start rounded-lg border border-line px-3 text-sm text-muted hover:border-faint hover:text-fg @[30rem]/status:h-auto @[30rem]/status:self-stretch"
        title="Archive this title"
      >
        <Archive className="size-4" /> Archive
      </button>
      {confirming &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="archive-title">
            <div className="absolute inset-0 bg-black/60" onClick={() => setConfirming(false)} aria-hidden="true" />
            <div ref={panel} tabIndex={-1} className="relative w-full max-w-sm space-y-3 rounded-xl border border-line bg-surface p-5 shadow-2xl outline-none">
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
        'flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm whitespace-nowrap transition-colors',
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
  save: (patch: ItemPatch) => Promise<unknown>
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
          Per-season tracking
        </span>
        {overridden > 0 && <span className="text-faint">{overridden} overridden</span>}
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
                <p className="text-xs text-faint">
                  {aired === 0
                    ? 'Not aired yet'
                    : value === 'ignored'
                      ? `${aired} aired, ignored`
                      : `${w} of ${aired} watched${value === 'auto' ? ' (auto)' : ''}`}
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

/**
 * One bar per season: how much of what's aired you've watched. Green when the season's done, pale orange when
 * ignored. Only for shows with more than one season (one season would repeat the overall bar).
 */
/**
 * Watched of aired, per season. `min`: fewest seasons worth a list. Plex-synced shows have no other progress bar,
 * so they get it from one season up; hand-tracked shows already show one bar beside Progress, so from two.
 */
function SeasonBars({ item, seasons, min }: { item: UserItem; seasons: SeasonMeta[]; min: 1 | 2 }) {
  if (seasons.length < min) return null
  const airedIn = airedCounter(item)
  return (
    <ul aria-label="Seasons" className="divide-y divide-line rounded-lg border border-line">
      {seasons.map((s) => {
        const aired = airedIn(s)
        const ignored = overrideOf(item, s.season_number) === 'ignored'
        const w = ignored ? 0 : watchedIn(item, s, aired)
        const pct = ignored ? 100 : aired > 0 ? (w / aired) * 100 : 0
        const done = !ignored && aired > 0 && w >= aired
        const text = aired === 0 ? 'Not aired' : ignored ? 'Ignored' : `${w}/${aired}`
        const label =
          aired === 0
            ? `Season ${s.season_number}: not aired yet`
            : ignored
              ? `Season ${s.season_number}: ignored`
              : `Season ${s.season_number}: ${w} of ${aired} aired episodes watched`
        return (
          <li key={s.season_number} className="flex items-center gap-3 px-3 py-2">
            <span className="w-20 shrink-0 text-sm text-fg">Season {s.season_number}</span>
            <div role="img" aria-label={label} className="h-1 flex-1 overflow-hidden rounded-full bg-raised">
              <div
                className={clsx('bar-fill h-full', ignored ? 'bg-warn/70' : done ? 'bg-good' : 'bg-accent-ink')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={clsx('w-16 shrink-0 text-right text-xs text-muted', aired > 0 && !ignored && 'font-mono')} aria-hidden="true">
              {text}
            </span>
          </li>
        )
      })}
    </ul>
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
          <span className="flex items-center gap-1" title="Checking your Plex watch history">
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
              className={clsx('bar-fill h-full', done ? 'bg-good' : 'bg-accent-ink')}
              style={{ width: `${watchedPct}%` }}
            />
            <div className="bar-fill h-full bg-warn/80" style={{ width: `${ignoredPct}%` }} />
          </div>
          {/* Ignored episodes are tallied in the count (they're "accounted for"), and also shown on their own. */}
          <span className="font-mono text-xs text-muted">
            {watched + ignored} / {aired}
            {ignored > 0 && <span className="text-warn">, {ignored} ignored</span>}
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
      <span className="text-xs text-faint">of <span className="font-mono">{episodes}</span></span>
    </div>
  )
}

const pillButton =
  'hit flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-muted hover:border-accent hover:text-fg disabled:opacity-60'

/** Shown while a title is actively synced from Plex: a green status (tap to check Plex again). */
function SyncedPill({ loading, onRefresh, server }: { loading: boolean; onRefresh: () => void; server?: string | null }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={loading}
      title={`Synced from Plex${server ? ` (${server})` : ''}. Tap to check again.`}
      className="hit group flex h-8 items-center gap-1.5 rounded-md px-1 text-xs text-muted hover:text-fg disabled:opacity-80"
    >
      {loading ? <RefreshCw className="size-3 animate-spin" /> : <span className="size-1.5 rounded-full bg-good" aria-hidden="true" />}
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
  save: (patch: ItemPatch) => Promise<unknown>
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
            {plexLast ? episodeCode(plexLast) : 'Nothing watched yet'}
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
        {seasons.length > 0 && <SeasonBars item={item} seasons={seasons} min={1} />}
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
            .{' '}
            Plex says <span className="font-mono text-fg">{episodeCode(plexLast)}</span>
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
      {showPicker && <SeasonBars item={item} seasons={seasons} min={2} />}
      {showPicker && <SeasonOptions item={item} seasons={seasons} save={save} />}
    </div>
  )
}

/**
 * TV: the next episode, set large, with the one bold action on the page when it's out and yours to mark
 * (Plex isn't tracking the show). Hidden when there's nothing next (caught up, or no season data).
 */
function NextUp({ item, mark }: { item: UserItem; mark: (ep: { season: number; episode: number }) => void }) {
  const next = upNext(item)
  if (!next.value || item.progress === 'dropped' || next.note === 'Last watched') return null
  const ep = next.watchable
  return (
    <div className="rounded-lg border border-line bg-bg p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className={labelClass}>Next up</p>
        {next.note && <p className="text-xs text-muted">{next.note}</p>}
      </div>
      <p className="mt-1 font-mono text-3xl leading-tight font-medium tracking-tight text-fg">
        <RollingText text={next.value} />
      </p>
      {ep && (
        <button
          type="button"
          onClick={() => mark(ep)}
          aria-keyshortcuts="w"
          title="Mark watched (W)"
          className="mt-3 h-11 w-full rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:brightness-105 active:scale-[0.98] sm:w-auto"
        >
          Mark {episodeCode(ep)} watched
        </button>
      )}
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
function AvailabilityBadge({ item }: { item: UserItem }) {
  const availability = useAvailability(item.title)
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
            <span className="text-bad">Couldn’t save. Try again.</span>
          ) : null}
        </span>
      </div>
      <textarea
        value={text}
        rows={3}
        placeholder="Anything to remember, like who recommended it or where you left off…"
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

/** Saves a patch to one item, with a pending count and the last error for a "Saving" / error line. */
function useSaver(item: UserItem) {
  const update = useUpdateItem()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  /** Resolves true once saved; a failure shows beside the Tracking heading and resolves false. */
  async function save(patch: ItemPatch): Promise<boolean> {
    setError(null)
    setPending((n) => n + 1)
    try {
      await update(item, patch)
      return true
    } catch (err) {
      setError(plainError(err, 'Couldn’t save that change.'))
      return false
    } finally {
      setPending((n) => n - 1)
    }
  }
  return { save, update, pending, error }
}

function SaveState({ pending, error }: { pending: number; error: string | null }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-faint" aria-live="polite">
      {pending > 0 ? (
        <>
          <Loader2 className="size-3.5 animate-spin" /> Saving
        </>
      ) : error ? (
        <span className="text-bad">{error}</span>
      ) : null}
    </span>
  )
}

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
  const progressOptions: { value: Progress; label: string }[] = statusesFor(type, { ongoingShow }).map((p) => ({
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
