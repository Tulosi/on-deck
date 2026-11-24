import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Check, ChevronRight, SlidersHorizontal, Tag, TagX, X } from 'lucide-react'
import { useChipModeControl } from '../lib/chips'
import {
  LABELS,
  activeCount,
  moreActive,
  clearFilters,
  withType,
  cycleTri,
  type Filters,
  type GroupKey,
  type SortKey,
} from '../lib/filters'
import { useItems } from '../lib/library'
import { statusFilterOptions, statusLabel } from '../lib/statusLabels'
import { useFilters } from '../lib/useFilters'
import { TypeFilter } from './TypeFilter'
import type { MediaType } from '../types'

// ─── Poster labels button ──────────────────────────────────────────────────

/**
 * One on/off button for the chips on posters (scores, Plex, prices, dates). A saved "on hover" setting from
 * the old three-way switch still works and counts as on; this button only switches between shown and hidden.
 */
function LabelsButton() {
  const [mode, setMode] = useChipModeControl()
  const on = mode !== 'hide'
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="Poster labels"
      title={on ? 'Hide poster labels' : 'Show poster labels'}
      onClick={() => setMode(on ? 'hide' : 'show')}
      className={clsx(
        'hit flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
        on ? 'border-line bg-raised text-fg' : 'border-line text-muted hover:text-fg',
      )}
    >
      {on ? <Tag className="size-3.5" /> : <TagX className="size-3.5" />}
      <span className="hidden sm:inline">{on ? 'Labels on' : 'Labels off'}</span>
    </button>
  )
}

// ─── Type pills (Layer 1) ──────────────────────────────────────────────────

const selectClass = 'h-7 rounded-md border border-line bg-surface px-2 text-xs text-fg outline-none focus:border-accent'

// ─── Filters panel ─────────────────────────────────────────────────────────

function OptionGroup<T extends string>({
  label,
  options,
  selected,
  excluded,
  render,
  onToggle,
}: {
  label: string
  options: readonly T[]
  selected: readonly T[]
  /** 3-state groups: values currently excluded ("not …"). Omit for include-only groups. */
  excluded?: readonly string[]
  render: (v: T) => string
  onToggle: (v: T) => void
}) {
  if (options.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o)
          const off = !!excluded?.includes(o)
          const name = render(o)
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on ? 'true' : off ? 'mixed' : 'false'}
              aria-label={on ? `${name}: included` : off ? `${name}: excluded` : name}
              title={excluded ? (on ? 'Included · tap to exclude' : off ? 'Excluded · tap to clear' : 'Tap to include') : undefined}
              onClick={() => onToggle(o)}
              className={clsx(
                'flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs transition-colors',
                on
                  ? 'border-accent bg-accent/15 text-fg'
                  : off
                    ? 'border-bad/70 bg-bad/10 text-bad'
                    : 'border-line text-muted hover:border-faint hover:text-fg',
              )}
            >
              {on && <Check className="size-3" />}
              {off && <X className="size-3" />}
              <span className={clsx(off && 'line-through decoration-bad/70')}>{name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

function FilterPanel({ f, set }: { f: Filters; set: (next: Filters) => void }) {
  const { items } = useItems()
  const genres =
    f.type === 'movie' || f.type === 'tv' || f.type === 'game'
      ? [...new Set(items.filter((i) => i.title.mediaType === f.type).flatMap((i) => i.title.genres))].sort()
      : []
  const years = items.map((i) => i.title.year).filter((y): y is number => !!y)
  const minYear = years.length ? Math.min(...years) : 1950
  const maxYear = Math.max(new Date().getFullYear() + 3, ...years)
  const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i)

  return (
    <div className="space-y-5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint">
        Tap a filter once to include it, again to exclude it
        <span className="inline-flex items-center gap-0.5 rounded-md border border-bad/70 bg-bad/10 px-1.5 text-bad">
          <X className="size-2.5" />
          <span className="line-through">like this</span>
        </span>
        , a third time to clear.
      </p>
      {f.type && (
        <Section title={LABELS.type[f.type]}>
          {f.type === 'movie' || f.type === 'tv' ? (
            <>
              <OptionGroup
                label="Genre"
                options={genres}
                selected={f.genre}
                render={(v) => v}
                onToggle={(v) => set({ ...f, genre: toggle(f.genre, v) })}
              />
              {f.type === 'tv' && (
                <>
                  <OptionGroup
                    label="Show status"
                    options={LABELS.options.TV_STATUS}
                    selected={f.tvStatus}
                    render={(v) => LABELS.tvStatus[v]}
                    excluded={f.not.tvStatus ?? []}
          onToggle={(v) => set(cycleTri(f, 'tvStatus', v))}
                  />
                  <OptionGroup
                    label="Watch progress"
                    options={LABELS.options.TV_PROGRESS}
                    selected={f.tvProgress}
                    render={(v) => LABELS.tvProgress[v]}
                    excluded={f.not.tvProgress ?? []}
          onToggle={(v) => set(cycleTri(f, 'tvProgress', v))}
                  />
                </>
              )}
              <p className="text-[11px] text-faint">More filters (runtime, Plex, streaming service …) are on the way.</p>
            </>
          ) : f.type === 'game' ? (
            <>
              <OptionGroup
                label="Genre & tags"
                options={genres}
                selected={f.genre}
                render={(v) => v}
                onToggle={(v) => set({ ...f, genre: toggle(f.genre, v) })}
              />
              <OptionGroup
                label="Co-op & multiplayer"
                options={LABELS.options.COOP}
                selected={f.coop}
                render={(v) => LABELS.coop[v]}
                excluded={f.not.coop ?? []}
          onToggle={(v) => set(cycleTri(f, 'coop', v))}
              />
              <OptionGroup
                label="Length (time to beat)"
                options={LABELS.options.LENGTH}
                selected={f.length}
                render={(v) => LABELS.length[v]}
                excluded={f.not.length ?? []}
          onToggle={(v) => set(cycleTri(f, 'length', v))}
              />
              <OptionGroup
                label="Steam Deck"
                options={LABELS.options.DECK}
                selected={f.deck}
                render={(v) => LABELS.deck[v]}
                excluded={f.not.deck ?? []}
          onToggle={(v) => set(cycleTri(f, 'deck', v))}
              />
              <OptionGroup
                label="Release state"
                options={LABELS.options.ACCESS}
                selected={f.access}
                render={(v) => LABELS.access[v]}
                onToggle={(v) => set({ ...f, access: toggle(f.access, v) })}
              />
              <OptionGroup
                label="Deals"
                options={LABELS.options.DEAL}
                selected={f.deal}
                render={(v) => LABELS.deal[v]}
                excluded={f.not.deal ?? []}
          onToggle={(v) => set(cycleTri(f, 'deal', v))}
              />
              <label className="space-y-1.5">
                <span className="block text-xs font-medium text-muted">Max price</span>
                <select
                  value={f.maxPrice ?? ''}
                  onChange={(e) => set({ ...f, maxPrice: e.target.value ? Number(e.target.value) : null })}
                  className={selectClass}
                >
                  <option value="">Any</option>
                  {[5, 10, 20, 30, 50].map((n) => (
                    <option key={n} value={n}>
                      Under {n}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-[11px] text-faint">
                Prices are the cheapest of Steam-key stores and key shops, in your region’s currency.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted">Books filters arrive with books search.</p>
          )}
        </Section>
      )}
      <Section title={f.type ? 'Everything' : 'Filters'}>
        <OptionGroup
          label="Status"
          options={statusFilterOptions(f.type)}
          selected={f.status}
          render={(v) => statusLabel(v, f.type)}
          excluded={f.not.status ?? []}
          onToggle={(v) => set(cycleTri(f, 'status', v))}
        />
        <OptionGroup
          label="Priority"
          options={LABELS.options.PRIORITY}
          selected={f.priority}
          render={(v) => LABELS.priority[v]}
          excluded={f.not.priority ?? []}
          onToggle={(v) => set(cycleTri(f, 'priority', v))}
        />
        <OptionGroup
          label="Rating"
          options={LABELS.options.RATING}
          selected={f.rating}
          render={(v) => LABELS.rating[v]}
          excluded={f.not.rating ?? []}
          onToggle={(v) => set(cycleTri(f, 'rating', v))}
        />
        <OptionGroup
          label="Availability"
          options={LABELS.options.AVAILABILITY}
          selected={f.availability}
          render={(v) => LABELS.availability[v]}
          onToggle={(v) => set({ ...f, availability: toggle(f.availability, v) })}
        />
        <p className="text-[11px] text-faint">
          Availability: movies and TV on your Plex or your streaming services (Settings); games and books In Your
          Library. Score is on one 0–100 scale: IMDb × 10 for movies and TV, Steam % for games, Hardcover × 20 for books.
        </p>
      </Section>
      <details className="group" open={moreActive(f)}>
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-fg [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 text-muted transition-transform group-open:rotate-90" />
          More filters
          <span className="text-xs font-normal text-faint">release, score, year, date added, archived</span>
        </summary>
        <div className="mt-3 space-y-4">
        <OptionGroup
          label="Release"
          options={LABELS.options.RELEASE}
          selected={f.release}
          render={(v) => LABELS.release[v]}
          onToggle={(v) => set({ ...f, release: toggle(f.release, v) })}
        />
        <div className="flex flex-wrap gap-x-6 gap-y-4">
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-muted">Minimum score</span>
            <select
              value={f.minScore ?? ''}
              onChange={(e) => set({ ...f, minScore: e.target.value ? Number(e.target.value) : null })}
              className={selectClass}
            >
              <option value="">Any</option>
              {[90, 80, 70, 60, 50].map((n) => (
                <option key={n} value={n}>
                  {n}+ / 100
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted">Year</span>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <select
                aria-label="From year"
                value={f.yearFrom ?? ''}
                onChange={(e) => set({ ...f, yearFrom: e.target.value ? Number(e.target.value) : null })}
                className={selectClass}
              >
                <option value="">Any</option>
                {yearOptions.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
              to
              <select
                aria-label="To year"
                value={f.yearTo ?? ''}
                onChange={(e) => set({ ...f, yearTo: e.target.value ? Number(e.target.value) : null })}
                className={selectClass}
              >
                <option value="">Any</option>
                {yearOptions.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-muted">Archived</span>
            <select
              value={f.archived}
              onChange={(e) => set({ ...f, archived: e.target.value as Filters['archived'] })}
              className={selectClass}
            >
              <option value="hide">Hidden (default)</option>
              <option value="include">Include</option>
              <option value="only">Only archived</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-muted">Date added</span>
            <select
              value={f.added ?? ''}
              onChange={(e) => set({ ...f, added: (e.target.value || null) as Filters['added'] })}
              className={selectClass}
            >
              <option value="">Any time</option>
              {LABELS.options.ADDED.map((a) => (
                <option key={a} value={a}>
                  {LABELS.added[a]}
                </option>
              ))}
            </select>
          </label>
        </div>
        </div>
      </details>
      {!f.type && (
        <p className="text-xs text-faint">Pick a type (movies, TV shows, games, books) for its own filters.</p>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {children}
    </section>
  )
}

function FiltersButton({ f, set }: { f: Filters; set: (next: Filters) => void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const count = activeCount(f)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'hit flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors',
          open || count ? 'border-accent text-fg' : 'border-line text-muted hover:text-fg',
        )}
      >
        <SlidersHorizontal className="size-3.5" />
        Filters
        {count > 0 && (
          <span className="grid min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[10px] text-accent-fg">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="pop-in origin-top fixed inset-x-3 top-28 z-40 max-h-[70vh] overflow-y-auto overscroll-contain rounded-xl sm:origin-top-left border border-line bg-surface p-4 shadow-2xl shadow-black/40 sm:absolute sm:inset-x-auto sm:top-9 sm:left-0 sm:w-[32rem]">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-fg">Filters</p>
            <div className="flex items-center gap-3">
              {count > 0 && (
                <button type="button" onClick={() => set(clearFilters(f))} className="text-xs text-muted hover:text-fg">
                  Clear all
                </button>
              )}
              <button type="button" aria-label="Close filters" onClick={() => setOpen(false)} className="text-muted hover:text-fg">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <FilterPanel f={f} set={set} />
          {/* Phones: sorting and grouping live here (the toolbar has no room for them). */}
          <div className="mt-5 space-y-2 border-t border-line pt-4 sm:hidden">
            <p className="text-xs font-medium text-muted">Arrange</p>
            <ArrangeSelects f={f} set={set} stacked />
          </div>
        </div>
      )}
    </div>
  )
}

function ArrangeSelects({ f, set, stacked }: { f: Filters; set: (next: Filters) => void; stacked?: boolean }) {
  return (
    <div className={stacked ? 'flex flex-wrap items-center gap-2' : 'hidden items-center gap-1.5 sm:flex'}>
      <select
        aria-label="Sort by"
        value={f.sort}
        onChange={(e) => set({ ...f, sort: e.target.value as SortKey })}
        className={selectClass}
      >
        {/* Price and Length only mean something for games (shown for Games and All). */}
        {LABELS.options.SORTS.filter(
          (s) => !['played', 'price', 'discount', 'length'].includes(s) || !f.type || f.type === 'game' || f.sort === s,
        ).map((s) => (
          <option key={s} value={s}>
            Sort: {LABELS.sort[s]}
          </option>
        ))}
      </select>
      <select
        aria-label="Group by"
        value={f.group}
        onChange={(e) => set({ ...f, group: e.target.value as GroupKey })}
        className={clsx(selectClass, !stacked && 'hidden sm:block')}
      >
        {LABELS.options.GROUPS.map((g) => (
          <option key={g} value={g}>
            {g === 'none' ? 'No grouping' : `Group: ${LABELS.group[g]}`}
          </option>
        ))}
      </select>
    </div>
  )
}

// ─── Toolbar ───────────────────────────────────────────────────────────────

/**
 * The row under the search bar on browsing pages.
 * Library: type pills · Filters · Sort · Group · labels switch. Home: type pills · labels switch.
 */
export function Toolbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [f, set] = useFilters()
  const isLibrary = pathname === '/library'

  const setType = (t: MediaType | null) => {
    if (isLibrary) set(withType(f, t))
    else navigate({ pathname, search: t ? `?type=${t}` : '' })
  }

  return (
    <div className="sticky top-14 z-10 flex h-11 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* Library: the sidebar sets the type on desktop, so the toolbar only offers it on phones. */}
        <TypeFilter value={f.type} onChange={setType} navOwned={isLibrary} />
        {isLibrary && (
          <>
            <FiltersButton f={f} set={set} />
            <ArrangeSelects f={f} set={set} />
          </>
        )}
      </div>
      <LabelsButton />
    </div>
  )
}

/** Library URL for a type (used by the sidebar shortcuts). */
export const libraryHref = (type: MediaType | null) => `/library${type ? `?type=${type}` : ''}`

