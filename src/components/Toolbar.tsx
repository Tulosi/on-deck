import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ArrowDownUp, Check, Search, SlidersHorizontal, Tag, TagX, X } from 'lucide-react'
import { useChipModeControl } from '../lib/chips'
import {
  LABELS,
  activeCount,
  applyFilters,
  clearFilters,
  type AvailabilityFilter,
  toggleValue,
  withTypes,
  type Filters,
  type NegKey,
  type GroupKey,
  type SortKey,
} from '../lib/filters'
import { useItems } from '../lib/library'
import { statusFilterOptionsFor, statusLabelFor, statusWords } from '../lib/statusLabels'
import { useFilters } from '../lib/useFilters'
import { TypesFilter } from './TypeFilter'
import { PickButton } from './PickForMe'
import type { MediaType } from '../types'

// ─── Poster details button ──────────────────────────────────────────────────

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
      title={on ? 'Show poster details only on hover (scores, prices, dates)' : 'Always show poster details (scores, prices, dates)'}
      onClick={() => setMode(on ? 'hide' : 'show')}
      className={clsx(
        // Phones: the same outline button as the type menu and Pick beside it.
        'hit flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-xs transition-colors sm:h-7 sm:rounded-md sm:px-2',
        on ? 'text-fg sm:bg-raised' : 'text-muted hover:text-fg',
      )}
    >
      {on ? <Tag className="size-3.5" aria-hidden="true" /> : <TagX className="size-3.5" aria-hidden="true" />}
      {/* Its name is the words it shows (no separate label), so voice control users can say what they see. */}
      {/* Says what the chips on posters do now: always there, only on hover, or off (touch screens can't hover). */}
      {/* Phones: a word, not just the icon ("Details" alone read like the cards' own Details buttons). */}
      {/* Up to wide screens too, where the Library's toolbar row is tight (the shading still shows on or off). */}
      <span className="xl:hidden">Poster info</span>
      <span className="hidden xl:inline">
        <span className="text-muted">Poster details:</span>{' '}
        {on ? (
          'Always'
        ) : (
          <>
            <span className="[@media(hover:hover)]:hidden">Off</span>
            <span className="hidden [@media(hover:hover)]:inline">On hover</span>
          </>
        )}
      </span>
    </button>
  )
}

// ─── Type pills (Layer 1) ──────────────────────────────────────────────────

const selectClass = 'h-11 sm:h-7 rounded-md border border-line bg-surface px-2 text-xs text-fg outline-none focus:border-accent'
/** A select as wide as the option showing (not its longest option), so the toolbar row fits. */
const fitTo = (text: string) => ({ width: `calc(${text.length * 0.82}ch + 1.875rem)` })

// ─── Filters panel ─────────────────────────────────────────────────────────
//
// One panel, no hidden section: what's on your list (status, priority, rating), what's out and available, then the
// selected type's own filters. Tapping an option always selects it. A few groups have an "is / is not" switch
// instead of the old tap-twice-to-exclude chips. Each option shows how many titles it would leave.

/** "Want to watch or play", "Watched it, Beat it or Read it". */
const orList = (ws: string[]) => (ws.length < 2 ? ws.join('') : `${ws.slice(0, -1).join(', ')} or ${ws.at(-1)}`)

/** Explains the statuses people ask about, for the ones this view has. */
function statusHint(opts: readonly string[], types: readonly MediaType[]): string | undefined {
  const wanted = statusWords('wanted', types)
  const done = statusWords('completed', types)
  const caughtUp = statusWords('caught_up', types)
  const parts = [
    // Mixed types get general words; say what they stand for on title pages.
    wanted.length > 1 && `Wanted = Want to ${orList(wanted.map((w) => w.replace('Want to ', '')))}.`,
    done.length > 1 && `Done = ${orList(done)}.`,
    opts.includes('stalled') && 'Stalled: started, then set aside.',
    opts.includes('caught_up') &&
      (caughtUp.length === 1 && caughtUp[0] === 'Waiting for 1.0'
        ? 'Waiting for 1.0: played the Early Access so far.'
        : caughtUp.length > 1
          ? 'Caught up: seen everything out so far (for games, waiting for 1.0).'
          : 'Caught up: seen everything out so far.'),
  ].filter(Boolean)
  return parts.length ? parts.join(' ') : undefined
}

/** Small "is / is not" switch beside a group's label. */
function NegSwitch({ label, neg, onChange }: { label: string; neg: boolean; onChange: (neg: boolean) => void }) {
  const opt = (on: boolean, text: string, value: boolean) => (
    <button
      type="button"
      aria-pressed={on}
      title={value ? `Everything except the ${label.toLowerCase()} picked below` : `Only the ${label.toLowerCase()} picked below`}
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
  /** One short line under the label (visible, so it works on touch screens too). */
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
        <p className="text-xs font-medium text-muted">{label}</p>
        {neg && <NegSwitch label={label} neg={neg.value} onChange={neg.set} />}
      </div>
      {hint && <p className="-mt-1 text-[11px] text-faint">{hint}</p>}
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
  // Most common first, so the few shown before a search are the ones that matter in this library.
  const genres = useMemo(() => {
    if (f.type !== 'movie' && f.type !== 'tv' && f.type !== 'game') return []
    const n = new Map<string, number>()
    for (const i of allItems) if (i.title.mediaType === f.type) for (const g of i.title.genres) n.set(g, (n.get(g) ?? 0) + 1)
    return [...n.keys()].sort((a, b) => n.get(b)! - n.get(a)! || a.localeCompare(b))
  }, [allItems, f.type])
  /** How many titles picking just this value would leave, with every other filter as it is. */
  const count = <K extends keyof Filters>(key: K) => (v: string) =>
    applyFilters(allItems, { ...f, [key]: [v], neg: { ...f.neg, [key]: false } }).length
  const tog = <K extends keyof Filters>(key: K) => (v: string) => set(toggleValue(f, key, v))
  const negOf = (key: NegKey) => ({ value: !!f.neg[key], set: (neg: boolean) => set({ ...f, neg: { ...f.neg, [key]: neg } }) })
  /** Only options some title of this type in the library has (with the other filters cleared), plus any already picked. */
  const base = clearFilters(f)
  const present = <K extends keyof Filters, T extends string>(key: K, options: readonly T[]) =>
    options.filter((v) => (f[key] as unknown as string[]).includes(v) || applyFilters(allItems, { ...base, [key]: [v] }).length > 0)
  const avail = (v: AvailabilityFilter) => f.availability.includes(v)
  const toggleAvail = (v: AvailabilityFilter) => set({ ...f, availability: avail(v) ? [] : [v] })
  // Games and books: available means owned, so Unowned is the other half (movies and TV have no such thing).
  const owns = f.type === 'game' || f.type === 'book'
  // Movies and TV: not on Plex or any of your services (titles not checked yet match neither).
  const unavailable = count('availability')('unavailable')

  return (
    <div className="space-y-5">
      <Section title="Your list">
        <OptionGroup
          label="Status"
          options={present('status', statusFilterOptionsFor(f.types))}
          selected={f.status}
          render={(v) => statusLabelFor(v, f.types)}
          hint={statusHint(present('status', statusFilterOptionsFor(f.types)), f.types)}
          onToggle={tog('status')}
          count={count('status')}
          neg={negOf('status')}
        />
        <OptionGroup label="Priority" options={present('priority', LABELS.options.PRIORITY)} selected={f.priority} render={(v) => LABELS.priority[v]} onToggle={tog('priority')} count={count('priority')} />
        <OptionGroup
          label="Your rating"
          options={present('rating', LABELS.options.RATING)}
          selected={f.rating}
          render={(v) => LABELS.rating[v]}
          onToggle={tog('rating')}
          count={count('rating')}
          neg={negOf('rating')}
        />
      </Section>

      <Section title="Out and available">
        <OptionGroup label="Release" options={present('release', LABELS.options.RELEASE)} selected={f.release} render={(v) => LABELS.release[v]} onToggle={tog('release')} count={count('release')} />
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted">{owns ? 'Owned' : 'Availability'}</p>
          <div className="flex flex-wrap gap-1.5">
            <AvailButton
              on={avail('available')}
              title="Movies and TV on your Plex or streaming services (set in Settings). Games and books you own."
              onClick={() => toggleAvail('available')}
              n={count('availability')('available')}
            >
              {owns ? 'Owned' : 'Available to me'}
            </AvailButton>
            {(unavailable > 0 || avail('unavailable')) && (
              <AvailButton on={avail('unavailable')} onClick={() => toggleAvail('unavailable')} n={unavailable}>
                {owns ? 'Unowned' : 'Not available'}
              </AvailButton>
            )}
          </div>
        </div>
      </Section>

      {f.type && f.type !== 'book' && (
        <Section title={LABELS.type[f.type]}>
          <GenreGroup
            label={f.type === 'game' ? 'Genre & tags' : 'Genre'}
            options={genres}
            selected={f.genre}
            onToggle={tog('genre')}
            count={count('genre')}
            neg={negOf('genre')}
          />
          {f.type === 'tv' && (
            <OptionGroup label="Show status" options={present('tvStatus', LABELS.options.TV_STATUS)} selected={f.tvStatus} render={(v) => LABELS.tvStatus[v]} onToggle={tog('tvStatus')} count={count('tvStatus')} />
          )}
          {f.type === 'game' && (
            <>
              <OptionGroup label="Players" options={present('coop', LABELS.options.COOP)} selected={f.coop} render={(v) => LABELS.coop[v]} onToggle={tog('coop')} count={count('coop')} neg={negOf('coop')} />
              <OptionGroup label="Length" hint="Time to beat at a normal pace" options={present('length', LABELS.options.LENGTH)} selected={f.length} render={(v) => LABELS.length[v]} onToggle={tog('length')} count={count('length')} />
              <OptionGroup label="Steam Deck" options={present('deck', LABELS.options.DECK)} selected={f.deck} render={(v) => LABELS.deck[v]} onToggle={tog('deck')} count={count('deck')} />
              <OptionGroup label="Early access" options={present('access', LABELS.options.ACCESS)} selected={f.access} render={(v) => LABELS.access[v]} onToggle={tog('access')} count={count('access')} />
              <OptionGroup
                label="Price & deals"
                hint="Cheapest of the Steam-key stores and key shops, in your currency"
                options={present('deal', LABELS.options.DEAL)}
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

function AvailButton({ on, n, title, onClick, children }: { on: boolean; n: number; title?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={clsx(
        'flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs transition-colors',
        on ? 'border-accent bg-accent/15 text-fg' : 'border-line text-muted hover:border-faint hover:text-fg',
      )}
    >
      {on && <Check className="size-3" />}
      {children}
      <span className="font-mono text-[10px] text-faint">{n}</span>
    </button>
  )
}

/** How many genres show before a search. Games carry dozens of IGDB genres and themes. */
const GENRES_SHOWN = 8

/** Genres and tags: the most common few, anything picked, and a search for the rest. */
function GenreGroup({
  label,
  options,
  selected,
  onToggle,
  count,
  neg,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
  count: (v: string) => number
  neg: { value: boolean; set: (neg: boolean) => void }
}) {
  const [q, setQ] = useState('')
  if (options.length === 0) return null
  const long = options.length > GENRES_SHOWN + 2
  const query = q.trim().toLowerCase()
  const top = options.slice(0, GENRES_SHOWN)
  const found = query ? options.filter((o) => o.toLowerCase().includes(query)) : []
  // No match keeps the usual few in view, so the group doesn't jump.
  const shown = !long ? options : found.length ? found : [...selected.filter((s) => !top.includes(s)), ...top]
  return (
    <div className="space-y-2">
      <OptionGroup label={label} options={shown} selected={selected} render={(v) => v} onToggle={onToggle} count={count} neg={neg} />
      {long && (
        <div className="flex items-center gap-2">
          <label className="relative block w-full max-w-60">
            <span className="sr-only">Find a {label === 'Genre' ? 'genre' : 'genre or tag'}</span>
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
            <input
              name="filter-options"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Find one of ${options.length}`}
              autoComplete="off"
              className="h-11 w-full rounded-md border border-line bg-surface pr-2 pl-7 text-xs text-fg outline-none placeholder:text-faint focus:border-accent sm:h-7"
            />
          </label>
          {query && found.length === 0 && <p className="text-xs text-faint">No match</p>}
        </div>
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
  // From small tablets up the panel hangs off the button, 32rem wide. When the button sits far enough right that it
  // would run off the window (the type chips have room on mid-size screens), it moves left to stay 12px inside.
  const [shift, setShift] = useState(0)
  useLayoutEffect(() => {
    if (!open) return
    const fit = () => {
      const left = wrap.current?.getBoundingClientRect().left ?? 0
      setShift(Math.min(0, window.innerWidth - 12 - 512 - left))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [open])

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
          'hit flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors sm:h-7 sm:rounded-md sm:px-2.5',
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
        <div className="vt-chrome-filters pop-in origin-top fixed inset-x-3 top-28 z-40 max-h-[70vh] overflow-y-auto overscroll-contain rounded-xl sm:origin-top-left border border-line bg-surface p-4 shadow-2xl shadow-black/40 sm:absolute sm:inset-x-auto sm:top-9 sm:left-(--shift) sm:w-[32rem]"
          style={{ '--shift': `${shift}px` } as CSSProperties}
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-fg">Filters</p>
            <div className="flex items-center gap-3">
              {count > 0 && (
                <button type="button" onClick={() => set(clearFilters(f))} className="hit text-xs text-muted hover:text-fg">
                  Clear all
                </button>
              )}
              <button type="button" aria-label="Close filters" onClick={() => setOpen(false)} className="hit text-muted hover:text-fg">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <FilterPanel f={f} set={set} />
          {/* Phones: sorting and grouping live here (the toolbar has no room for them); mid-size screens, grouping. */}
          <div className="mt-5 space-y-2 border-t border-line pt-4 lg:hidden">
            <p className="text-xs font-medium text-muted">Arrange</p>
            <ArrangeSelects f={f} set={set} stacked />
          </div>
        </div>
      )}
    </div>
  )
}

/** Flips the sort or the groups. Lit while reversed. */
function ReverseButton({ on, label, onClick, className }: { on: boolean; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      title={on ? `${label} (on)` : label}
      className={clsx(
        'grid size-11 shrink-0 place-items-center rounded-md border transition-colors sm:size-7',
        on ? 'border-accent bg-accent/10 text-accent-ink' : 'border-line bg-surface text-muted hover:text-fg',
        className,
      )}
    >
      <ArrowDownUp className="size-3.5" aria-hidden="true" />
    </button>
  )
}

function ArrangeSelects({ f, set, stacked }: { f: Filters; set: (next: Filters) => void; stacked?: boolean }) {
  return (
    <div className={stacked ? 'flex flex-wrap items-center gap-2' : 'hidden items-center gap-1.5 sm:flex'}>
      {/* Each dropdown keeps its reverse button beside it, so they wrap as pairs on phones. Sort is in the toolbar
          from small tablets up; Group only from wide screens up (below that it's in the Filters panel). */}
      <div className={clsx('shrink-0 items-center gap-1', stacked ? 'flex sm:hidden' : 'flex')}>
        <select
          aria-label="Sort by"
          value={f.sort}
          onChange={(e) => set({ ...f, sort: e.target.value as SortKey })}
          className={selectClass}
          style={stacked ? undefined : fitTo(`Sort: ${LABELS.sort[f.sort]}`)}
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
        <ReverseButton on={f.sortRev} label="Reverse sort order" onClick={() => set({ ...f, sortRev: !f.sortRev })} />
      </div>
      <div className={clsx('shrink-0 items-center gap-1', stacked ? 'flex' : 'hidden lg:flex')}>
        <select
          aria-label="Group by"
          value={f.group}
          onChange={(e) => set({ ...f, group: e.target.value as GroupKey })}
          className={selectClass}
          style={stacked ? undefined : fitTo(f.group === 'none' ? 'No grouping' : `Group: ${LABELS.group[f.group]}`)}
        >
          {/* Grouping by type only means something across types (Library), not inside Movies, TV and so on. */}
          {LABELS.options.GROUPS.filter((g) => g !== 'type' || !f.type).map((g) => (
            <option key={g} value={g}>
              {g === 'none' ? 'No grouping' : `Group: ${LABELS.group[g]}`}
            </option>
          ))}
        </select>
        {f.group !== 'none' && (
          <ReverseButton on={f.groupRev} label="Reverse group order" onClick={() => set({ ...f, groupRev: !f.groupRev })} />
        )}
      </div>
    </div>
  )
}

// ─── Toolbar ───────────────────────────────────────────────────────────────

/**
 * The row under the search bar on browsing pages.
 * Library: type chips (any mix) · Filters · Sort · Group · labels switch. Home: type pills · labels switch.
 */
export function Toolbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [f, set] = useFilters()
  const isLibrary = pathname === '/library'

  const setTypes = (ts: MediaType[]) => {
    if (isLibrary) set(withTypes(f, ts))
    else navigate({ pathname, search: ts.length ? `?type=${ts.join(',')}` : '' })
  }

  return (
    <div className="vt-chrome-toolbar sticky top-14 z-10 flex h-12 items-center gap-3 border-b sm:h-11 border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* Any mix of types: "Games", or "Games and movies". */}
        <TypesFilter value={f.types} onChange={setTypes} />
        {isLibrary && (
          <>
            <FiltersButton f={f} set={set} />
            <ArrangeSelects f={f} set={set} />
          </>
        )}
      </div>
      {pathname === '/' && <PickButton />}
      <LabelsButton />
    </div>
  )
}

/** Library URL for a type (used by the sidebar shortcuts). */
export const libraryHref = (type: MediaType | null) => `/library${type ? `?type=${type}` : ''}`

