// Title page, TV — seasons, Watched up to, Plex sync and the next episode.
import { labelClass, selectClass, pillButton, SyncedPill } from './trackingParts'
import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { RollingText } from './RollingText'
import { ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { friendlyError, type PlexWatch } from '../lib/integrations'
import { type ItemPatch } from '../lib/library'
import { episodeCode } from '../lib/release'
import { upNext } from '../lib/home'
import { airedCounter, completion, overrideOf, watchedIn, type SeasonMeta } from '../lib/seasons'
import { type SeasonOverride, type UserItem } from '../types'

/** The most recent aired episode outside ignored seasons — "caught up" when marking a show Watched. */
export function latestAired(item: UserItem, seasons: SeasonMeta[]): { season: number; episode: number } | null {
  const airedIn = airedCounter(item)
  for (let i = seasons.length - 1; i >= 0; i--) {
    if (overrideOf(item, seasons[i].season_number) === 'ignored') continue
    const n = airedIn(seasons[i])
    if (n > 0) return { season: seasons[i].season_number, episode: n }
  }
  return null
}

/** Collapsed-by-default per-season controls: Auto (follows Progress) / Watched / Unwatched / Ignore. */
export function SeasonOptions({
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
    // A section of the Tracking card (a rule above it), not a box inside the box.
    <details className="group border-t border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 text-xs sm:min-h-0 text-muted select-none hover:text-fg [&::-webkit-details-marker]:hidden">
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
            <li key={s.season_number} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
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
                      'hit rounded px-2 py-1 text-xs whitespace-nowrap transition-colors',
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
      <p className="border-t border-line py-2 text-[11px] text-faint">
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
export function SeasonBars({ item, seasons, min }: { item: UserItem; seasons: SeasonMeta[]; min: 1 | 2 }) {
  if (seasons.length < min) return null
  const airedIn = airedCounter(item)
  return (
    <ul aria-label="Seasons" className="divide-y divide-line border-y border-line">
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
          <li key={s.season_number} className="flex items-center gap-3 py-2">
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
export function WatchedHeading({ item, seasons, checking }: { item: UserItem; seasons: SeasonMeta[]; checking?: boolean }) {
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

/**
 * Season + episode dropdowns, limited to the show's actual seasons and episode counts. `value` null = not
 * started: the episode menu reads "Not started" until you pick one.
 */
export function EpisodePicker({
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

/**
 * "Watched up to" for TV — one source of truth at a time:
 *  - Plex sync on (show found on the user's Plex, not overridden): read-only, mirrors Plex.
 *  - Overridden, or no Plex: the user's own dropdowns.
 */
export function TvProgressSection({
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
              <button type="button" onClick={() => save({ tvProgress: null })} className="hit text-xs text-muted hover:text-fg">
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
export function NextUp({ item, mark }: { item: UserItem; mark: (ep: { season: number; episode: number }) => void }) {
  const next = upNext(item)
  if (!next.value || item.progress === 'dropped' || next.note === 'Last watched') return null
  const ep = next.watchable
  return (
    <div className="border-t border-line pt-4">
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
