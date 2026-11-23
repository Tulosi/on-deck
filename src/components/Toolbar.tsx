import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Check, SlidersHorizontal, X } from 'lucide-react'
import { useChipModeControl, type ChipMode } from '../lib/chips'
import {
  LABELS,
  TYPES,
  activeCount,
  clearFilters,
  withType,
  type Filters,
  type GroupKey,
  type SortKey,
} from '../lib/filters'
import { useItems } from '../lib/library'
import { useFilters } from '../lib/useFilters'
import type { MediaType } from '../types'

// ─── Poster labels switch ──────────────────────────────────────────────────

const MODES: { value: ChipMode; readout: string }[] = [
  { value: 'show', readout: 'Labels shown' },
  { value: 'hover', readout: 'Labels on hover' },
  { value: 'hide', readout: 'Labels hidden' },
]

/**
 * Compact 3-position switch: a pill with a round knob that slides between three slots.
 * Click a slot to jump to it; click the knob's own slot (or press Space/Enter on the switch) to cycle.
 * Arrow keys move left/right. The readout to the right says what the current position does.
 */
function LabelsToggle() {
  const [mode, setMode] = useChipModeControl()
  const index = Math.max(0, MODES.findIndex((m) => m.value === mode))
  const go = (i: number) => setMode(MODES[(i + MODES.length) % MODES.length].value)

  return (
    <div className="flex items-center gap-2.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Poster labels"
        aria-valuemin={0}
        aria-valuemax={MODES.length - 1}
        aria-valuenow={index}
        aria-valuetext={MODES[index].readout}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(Math.min(index + 1, MODES.length - 1))
          else if (e.key === 'ArrowLeft') go(Math.max(index - 1, 0))
          else if (e.key === ' ' || e.key === 'Enter') go(index + 1)
          else return
          e.preventDefault()
        }}
        className="relative flex h-5 w-[3.25rem] shrink-0 cursor-pointer items-center rounded-full border border-line bg-surface outline-none focus-visible:border-accent"
      >
        {MODES.map((m, i) => (
          <button
            key={m.value}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            title={m.readout}
            onClick={() => go(i === index ? index + 1 : i)}
            className="relative z-10 h-full flex-1"
          />
        ))}
        <span className="pointer-events-none absolute inset-x-[0.4375rem] flex justify-between">
          {MODES.map((m) => (
            <span key={m.value} className="size-1 rounded-full bg-faint/60" />
          ))}
        </span>
        <span
          aria-hidden="true"
          className={clsx(
            'pointer-events-none absolute top-1/2 left-0.5 size-3.5 rounded-full shadow transition-[transform,background-color] duration-200 ease-out will-change-transform',
            mode === 'hide' ? 'bg-faint' : 'bg-accent',
          )}
          // Slides with transform (smooth) rather than `left`. Each step = (inner track 50px − knob 14px − 2 × 2px inset) / 2 = 1rem.
          style={{ transform: `translate(${index}rem, -50%)` }}
        />
      </div>
      {/* Fixed width, so the switch doesn't shift when the text changes. */}
      <span className="hidden w-[6.5rem] text-xs whitespace-nowrap text-muted lg:inline">{MODES[index].readout}</span>
    </div>
  )
}

// ─── Type pills (Layer 1) ──────────────────────────────────────────────────

const selectClass = 'h-7 rounded-md border border-line bg-surface px-2 text-xs text-fg outline-none focus:border-accent'

function TypePills({ value, onChange }: { value: MediaType | null; onChange: (t: MediaType | null) => void }) {
  const options: { value: MediaType | null; label: string }[] = [
    { value: null, label: 'All' },
    ...TYPES.map((t) => ({ value: t, label: LABELS.type[t] })),
  ]
  // When the pills overflow and scroll sideways, keep the selected one in view.
  const pills = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = pills.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (el && pills.current) pills.current.scrollLeft = el.offsetLeft - pills.current.offsetLeft - 8
  }, [value])
  return (
    <>
      {/* Phones: a compact dropdown, so the selected type is always visible. */}
      <select
        aria-label="Media type"
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as MediaType | null)}
        className={clsx(selectClass, 'shrink-0 sm:hidden')}
      >
        {options.map((o) => (
          <option key={o.label} value={o.value ?? ''}>
            {o.label}
          </option>
        ))}
      </select>
    <div ref={pills} role="radiogroup" aria-label="Media type" className="no-scrollbar hidden gap-1 overflow-x-auto sm:flex">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'h-7 shrink-0 rounded-full px-3 text-xs whitespace-nowrap transition-colors',
            value === o.value ? 'bg-accent font-medium text-accent-fg' : 'text-muted hover:bg-raised hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
    </>
  )
}

// ─── Filters panel ─────────────────────────────────────────────────────────

function OptionGroup<T extends string>({
  label,
  options,
  selected,
  render,
  onToggle,
}: {
  label: string
  options: readonly T[]
  selected: readonly T[]
  render: (v: T) => string
  onToggle: (v: T) => void
}) {
  if (options.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[11px] tracking-wider text-faint uppercase">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o)
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o)}
              className={clsx(
                'flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors',
                on ? 'border-accent bg-accent/15 text-fg' : 'border-line text-muted hover:border-faint hover:text-fg',
              )}
            >
              {on && <Check className="size-3" />}
              {render(o)}
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
  const doneLabel = f.type ? (f.type === 'game' ? 'Played' : f.type === 'book' ? 'Read' : 'Watched') : 'Done'

  return (
    <div className="space-y-5">
      <Section title="All types">
        <OptionGroup
          label="Status"
          options={LABELS.options.STATUS}
          selected={f.status}
          render={(v) => (v === 'completed' ? doneLabel : LABELS.status[v])}
          onToggle={(v) => set({ ...f, status: toggle(f.status, v) })}
        />
        <OptionGroup
          label="Priority"
          options={LABELS.options.PRIORITY}
          selected={f.priority}
          render={(v) => LABELS.priority[v]}
          onToggle={(v) => set({ ...f, priority: toggle(f.priority, v) })}
        />
        <OptionGroup
          label="Rating"
          options={LABELS.options.RATING}
          selected={f.rating}
          render={(v) => LABELS.rating[v]}
          onToggle={(v) => set({ ...f, rating: toggle(f.rating, v) })}
        />
        <OptionGroup
          label="Availability"
          options={LABELS.options.AVAILABILITY}
          selected={f.availability}
          render={(v) => LABELS.availability[v]}
          onToggle={(v) => set({ ...f, availability: toggle(f.availability, v) })}
        />
        <OptionGroup
          label="Release"
          options={LABELS.options.RELEASE}
          selected={f.release}
          render={(v) => LABELS.release[v]}
          onToggle={(v) => set({ ...f, release: toggle(f.release, v) })}
        />
        <div className="flex flex-wrap gap-x-6 gap-y-4">
          <label className="space-y-1.5">
            <span className="block font-mono text-[11px] tracking-wider text-faint uppercase">Minimum score</span>
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
            <span className="block font-mono text-[11px] tracking-wider text-faint uppercase">Year</span>
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
            <span className="block font-mono text-[11px] tracking-wider text-faint uppercase">Date added</span>
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
        <p className="text-[11px] text-faint">
          Availability: movies and TV on your Plex or your streaming services (Settings); games and books In Your
          Library. Score is on one 0–100 scale: IMDb × 10 for movies and TV, Steam % for games, Hardcover × 20 for books.
        </p>
      </Section>

      {f.type ? (
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
                    onToggle={(v) => set({ ...f, tvStatus: toggle(f.tvStatus, v) })}
                  />
                  <OptionGroup
                    label="Watch progress"
                    options={LABELS.options.TV_PROGRESS}
                    selected={f.tvProgress}
                    render={(v) => LABELS.tvProgress[v]}
                    onToggle={(v) => set({ ...f, tvProgress: toggle(f.tvProgress, v) })}
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
                onToggle={(v) => set({ ...f, coop: toggle(f.coop, v) })}
              />
              <OptionGroup
                label="Length (time to beat)"
                options={LABELS.options.LENGTH}
                selected={f.length}
                render={(v) => LABELS.length[v]}
                onToggle={(v) => set({ ...f, length: toggle(f.length, v) })}
              />
              <OptionGroup
                label="Steam Deck"
                options={LABELS.options.DECK}
                selected={f.deck}
                render={(v) => LABELS.deck[v]}
                onToggle={(v) => set({ ...f, deck: toggle(f.deck, v) })}
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
                onToggle={(v) => set({ ...f, deal: toggle(f.deal, v) })}
              />
              <label className="space-y-1.5">
                <span className="block font-mono text-[11px] tracking-wider text-faint uppercase">Max price</span>
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
      ) : (
        <p className="text-xs text-faint">Pick a type (Movies, TV, Games, Books) for its own filters.</p>
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
          'flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors',
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
        <div className="fixed inset-x-3 top-28 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-2xl shadow-black/40 sm:absolute sm:inset-x-auto sm:top-9 sm:left-0 sm:w-[32rem]">
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
            <p className="font-mono text-[11px] tracking-wider text-faint uppercase">Arrange</p>
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
        {LABELS.options.SORTS.filter((s) => (s !== 'price' && s !== 'length') || !f.type || f.type === 'game' || f.sort === s).map((s) => (
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
        <TypePills value={f.type} onChange={setType} />
        {isLibrary && (
          <>
            <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
            <FiltersButton f={f} set={set} />
            <ArrangeSelects f={f} set={set} />
          </>
        )}
      </div>
      <LabelsToggle />
    </div>
  )
}

/** Library URL for a type (used by the sidebar shortcuts). */
export const libraryHref = (type: MediaType | null) => `/library${type ? `?type=${type}` : ''}`
