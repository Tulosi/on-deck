import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Check, SlidersHorizontal, Tag, TagX, X } from 'lucide-react'
import { useChipModeControl } from '../lib/chips'
import {
  LABELS,
  activeCount,
  applyFilters,
  clearFilters,
  toggleValue,
  withType,
  type Filters,
  type NegKey,
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
 * One on/off button for the chips on posters (scores, Plex, prices, dates). Off hides them, but on a computer
 * they still appear while you hover a poster, so there the off state reads "Hover only". A saved "on hover"
 * setting from the old three-way switch counts as off.
 */
function LabelsButton() {
  const [mode, setMode] = useChipModeControl()
  const on = mode === 'show'
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="Poster labels"
      title={on ? 'Hide poster labels (on a computer they still show when you hover a poster)' : 'Always show poster labels'}
      onClick={() => setMode(on ? 'hide' : 'show')}
      className={clsx(
        'hit flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
        on ? 'border-line bg-raised text-fg' : 'border-line text-muted hover:text-fg',
      )}
    >
      {on ? <Tag className="size-3.5" /> : <TagX className="size-3.5" />}
      {on ? (
        <span className="hidden sm:inline">Labels on</span>
      ) : (
        <>
          {/* Devices that can hover get the chips back on hover; touch screens don't. */}
          <span className="hidden sm:inline [@media(hover:hover)]:sm:hidden">Labels off</span>
          <span className="hidden [@media(hover:hover)]:sm:inline">Hover only</span>
        </>
      )}
    </button>
  )
}

// ─── Type pills (Layer 1) ──────────────────────────────────────────────────

const selectClass = 'h-7 rounded-md border border-line bg-surface px-2 text-xs text-fg outline-none focus:border-accent'

// ─── Filters panel ─────────────────────────────────────────────────────────
//
// One panel, no hidden section: what's on your list (status, priority, rating), what's out and available, then the
// selected type's own filters. Tapping an option always selects it. A few groups have an "is / is not" switch
// instead of the old tap-twice-to-exclude chips. Each option shows how many titles it would leave.

/** Small "is / is not" switch beside a group's label. */
function NegSwitch({ label, neg, onChange }: { label: string; neg: boolean; onChange: (neg: boolean) => void }) {
  const opt = (on: boolean, text: string, value: boolean) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(value)}
      className={clsx('rounded px-1.5 py-0.5 transition-colors', on ? 'bg-raised text-fg' : 'text-faint hover:text-fg')}
    >
      {text}
    </button>
  )
  return (
    <span role="group" aria-label={`${label}: include or exclude`} className="inline-flex rounded-md border border-line p-px text-[11px]">
      {opt(!neg, 'is', false)}
      {opt(neg, 'is not', true)}
    </span>
  )
}

function OptionGroup<T extends string>({
  label,
  hint,
  options,
  selected,
  render,
  onToggle,
  count,
  neg,
  children,
}: {
  label: string
  /** Shown as a tooltip on the label. */
  hint?: string
  options: readonly T[]
  selected: readonly T[]
  render: (v: T) => string
  onToggle: (v: T) => void
  /** Titles this option would leave, given the other filters. */
  count?: (v: T) => number
  /** Groups that can exclude: whether they're set to "is not", and how to switch. */
  neg?: { value: boolean; set: (neg: boolean) => void }
  /** Extra controls on the same row (e.g. Max price). */
  children?: ReactNode
}) {
  if (options.length === 0) return null
  const excluding = !!neg?.value
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-muted" title={hint}>
          {label}
        </p>
        {neg && <NegSwitch label={label} neg={neg.value} onChange={neg.set} />}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o)
          const name = render(o)
          const n = count?.(o)
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              aria-label={`${excluding ? 'Not ' : ''}${name}${n != null ? `, ${n}` : ''}`}
              onClick={() => onToggle(o)}
              className={clsx(
                'flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs transition-colors',
                on
                  ? excluding
                    ? 'border-bad/70 bg-bad/10 text-fg'
                    : 'border-accent bg-accent/15 text-fg'
                  : 'border-line text-muted hover:border-faint hover:text-fg',
                !on && n === 0 && 'opacity-50',
              )}
            >
              {on && (excluding ? <X className="size-3 text-bad" /> : <Check className="size-3" />)}
              {name}
              {n != null && <span className="font-mono text-[10px] text-faint">{n}</span>}
            </button>
          )
        })}
        {children}
      </div>
    </div>
  )
}

function FilterPanel({ f, set }: { f: Filters; set: (next: Filters) => void }) {
  const { allItems } = useItems()
  const genres = useMemo(
    () =>
      f.type === 'movie' || f.type === 'tv' || f.type === 'game'
        ? [...new Set(allItems.filter((i) => i.title.mediaType === f.type).flatMap((i) => i.title.genres))].sort()
        : [],
    [allItems, f.type],
  )
  /** How many titles picking just this value would leave, with every other filter as it is. */
  const count = <K extends keyof Filters>(key: K) => (v: string) =>
    applyFilters(allItems, { ...f, [key]: [v], neg: { ...f.neg, [key]: false } }).length
  const tog = <K extends keyof Filters>(key: K) => (v: string) => set(toggleValue(f, key, v))
  const negOf = (key: NegKey) => ({ value: !!f.neg[key], set: (neg: boolean) => set({ ...f, neg: { ...f.neg, [key]: neg } }) })
  const available = f.availability.includes('available')

  return (
    <div className="space-y-5">
      <Section title="Your list">
        <OptionGroup
          label="Status"
          options={statusFilterOptions(f.type)}
          selected={f.status}
          render={(v) => statusLabel(v, f.type)}
          onToggle={tog('status')}
          count={count('status')}
          neg={negOf('status')}
        />
        <OptionGroup label="Priority" options={LABELS.options.PRIORITY} selected={f.priority} render={(v) => LABELS.priority[v]} onToggle={tog('priority')} count={count('priority')} />
        <OptionGroup
          label="Your rating"
          options={LABELS.options.RATING}
          selected={f.rating}
          render={(v) => LABELS.rating[v]}
          onToggle={tog('rating')}
          count={count('rating')}
          neg={negOf('rating')}
        />
      </Section>

      <Section title="Out and available">
        <OptionGroup label="Release" options={LABELS.options.RELEASE} selected={f.release} render={(v) => LABELS.release[v]} onToggle={tog('release')} count={count('release')}>
          <button
            type="button"
            aria-pressed={available}
            title="Movies and TV on your Plex or streaming services (set in Settings). Games and books you own."
            onClick={() => set({ ...f, availability: available ? [] : ['available'] })}
            className={clsx(
              'ml-2 flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs transition-colors',
              available ? 'border-accent bg-accent/15 text-fg' : 'border-line text-muted hover:border-faint hover:text-fg',
            )}
          >
            {available && <Check className="size-3" />}
            Available to me
            <span className="font-mono text-[10px] text-faint">{count('availability')('available')}</span>
          </button>
        </OptionGroup>
      </Section>

      {f.type && f.type !== 'book' && (
        <Section title={LABELS.type[f.type]}>
          <OptionGroup
            label={f.type === 'game' ? 'Genre & tags' : 'Genre'}
            options={genres}
            selected={f.genre}
            render={(v) => v}
            onToggle={tog('genre')}
            count={count('genre')}
            neg={negOf('genre')}
          />
          {f.type === 'tv' && (
            <OptionGroup label="Show status" options={LABELS.options.TV_STATUS} selected={f.tvStatus} render={(v) => LABELS.tvStatus[v]} onToggle={tog('tvStatus')} count={count('tvStatus')} />
          )}
          {f.type === 'game' && (
            <>
              <OptionGroup label="Co-op & multiplayer" options={LABELS.options.COOP} selected={f.coop} render={(v) => LABELS.coop[v]} onToggle={tog('coop')} count={count('coop')} neg={negOf('coop')} />
              <OptionGroup label="Length" hint="Time to beat at a normal pace" options={LABELS.options.LENGTH} selected={f.length} render={(v) => LABELS.length[v]} onToggle={tog('length')} count={count('length')} />
              <OptionGroup label="Steam Deck" options={LABELS.options.DECK} selected={f.deck} render={(v) => LABELS.deck[v]} onToggle={tog('deck')} count={count('deck')} />
              <OptionGroup label="Early access" options={LABELS.options.ACCESS} selected={f.access} render={(v) => LABELS.access[v]} onToggle={tog('access')} count={count('access')} />
              <OptionGroup
                label="Price & deals"
                hint="The cheapest of Steam-key stores and key shops, in your region's currency"
                options={LABELS.options.DEAL}
                selected={f.deal}
                render={(v) => LABELS.deal[v]}
                onToggle={tog('deal')}
                count={count('deal')}
              >
                <select
                  aria-label="Max price"
                  value={f.maxPrice ?? ''}
                  onChange={(e) => set({ ...f, maxPrice: e.target.value ? Number(e.target.value) : null })}
                  className={clsx(selectClass, 'ml-2')}
                >
                  <option value="">Any price</option>
                  {[5, 10, 20, 30, 50].map((n) => (
                    <option key={n} value={n}>
                      Under {n}
                    </option>
                  ))}
                </select>
              </OptionGroup>
            </>
          )}
        </Section>
      )}
      {!f.type && <p className="text-xs text-faint">Pick movies, TV shows or games for their own filters.</p>}
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
        {/* Grouping by type only means something across types (Library), not inside Movies, TV and so on. */}
        {LABELS.options.GROUPS.filter((g) => g !== 'type' || !f.type).map((g) => (
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

