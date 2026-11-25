import clsx from 'clsx'
import { useCallback, useMemo, useState, ViewTransition } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckSquare, Eye, EyeOff, Layers, LayoutGrid, Loader2, Rows3, Sparkles, X } from 'lucide-react'
import { BulkBar, SelectableCard } from '../components/BulkBar'
import { PageHeader } from '../components/PageHeader'
import { PageSkeleton } from '../components/LazyPage'
import { PosterCard } from '../components/PosterCard'
import { ProgressRows } from '../components/ProgressRows'
import {
  LABELS,
  typesLabel,
  activeCount,
  applyFilters,
  clearFilters,
  groupItems,
  sortItems,
  type Filters,
  DEFAULT_SORT,
} from '../lib/filters'
import { useItems } from '../lib/library'
import { useLibraryView } from '../lib/libraryView'
import { releaseInfo } from '../lib/release'
import { statusLabel } from '../lib/statusLabels'
import { rulesFrom, useFilters } from '../lib/useFilters'
import { useCollectionActions, useCollections } from '../lib/collections'

const grid =
  'grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] sm:gap-x-4 sm:gap-y-6'

/**
 * One removable pill per active filter value, plus Clear all. `covered`: settings a Show/Hide toggle below already
 * shows (archived, Released-only on Games), left out so they aren't shown twice.
 */
function ActiveFilters({
  f,
  set,
  covered = {},
}: {
  f: Filters
  set: (next: Filters) => void
  covered?: { archived?: boolean; released?: boolean }
}) {
  const pills: { key: string; label: string; remove: () => void }[] = []
  const without = <T,>(list: T[], v: T) => list.filter((x) => x !== v)
  // "Is not" groups read as "Not: …".
  const not = (key: 'status' | 'rating' | 'genre' | 'coop', label: string) => (f.neg[key] ? `Not: ${label}` : label)
  f.status.forEach((v) => pills.push({ key: `s-${v}`, label: not('status', statusLabel(v, f.type)), remove: () => set({ ...f, status: without(f.status, v) }) }))
  f.priority.forEach((v) => pills.push({ key: `p-${v}`, label: `Priority: ${LABELS.priority[v]}`, remove: () => set({ ...f, priority: without(f.priority, v) }) }))
  f.rating.forEach((v) => pills.push({ key: `r-${v}`, label: not('rating', LABELS.rating[v]), remove: () => set({ ...f, rating: without(f.rating, v) }) }))
  f.availability.forEach((v) =>
    pills.push({ key: `av-${v}`, label: v === 'available' ? 'Available to me' : LABELS.availability[v], remove: () => set({ ...f, availability: without(f.availability, v) }) }),
  )
  f.release.forEach((v) => !(covered.released && v === 'released') && pills.push({ key: `rel-${v}`, label: LABELS.release[v], remove: () => set({ ...f, release: without(f.release, v) }) }))
  f.genre.forEach((v) => pills.push({ key: `g-${v}`, label: not('genre', v), remove: () => set({ ...f, genre: without(f.genre, v) }) }))
  f.tvStatus.forEach((v) => pills.push({ key: `ts-${v}`, label: LABELS.tvStatus[v], remove: () => set({ ...f, tvStatus: without(f.tvStatus, v) }) }))
  f.coop.forEach((v) => pills.push({ key: `co-${v}`, label: not('coop', LABELS.coop[v]), remove: () => set({ ...f, coop: without(f.coop, v) }) }))
  f.deck.forEach((v) => pills.push({ key: `dk-${v}`, label: LABELS.deck[v], remove: () => set({ ...f, deck: without(f.deck, v) }) }))
  f.access.forEach((v) => pills.push({ key: `ac-${v}`, label: LABELS.access[v], remove: () => set({ ...f, access: without(f.access, v) }) }))
  f.length.forEach((v) => pills.push({ key: `ln-${v}`, label: LABELS.length[v], remove: () => set({ ...f, length: without(f.length, v) }) }))
  f.deal.forEach((v) => pills.push({ key: `dl-${v}`, label: LABELS.deal[v], remove: () => set({ ...f, deal: without(f.deal, v) }) }))
  if (f.maxPrice != null) pills.push({ key: 'maxprice', label: `Under ${f.maxPrice}`, remove: () => set({ ...f, maxPrice: null }) })
  // Filters that left the panel, still honoured when an older link or saved collection uses them: shown here so
  // they're visible and can be removed.
  if (f.minScore != null) pills.push({ key: 'score', label: `Score ${f.minScore}+`, remove: () => set({ ...f, minScore: null }) })
  if (f.yearFrom != null || f.yearTo != null)
    pills.push({
      key: 'year',
      label: `Year ${f.yearFrom ?? '…'}–${f.yearTo ?? '…'}`,
      remove: () => set({ ...f, yearFrom: null, yearTo: null }),
    })
  if (f.added) pills.push({ key: 'added', label: `Added: ${LABELS.added[f.added]}`, remove: () => set({ ...f, added: null }) })
  f.tvProgress.forEach((v) => pills.push({ key: `tp-${v}`, label: LABELS.tvProgress[v], remove: () => set({ ...f, tvProgress: without(f.tvProgress, v) }) }))
  // The Archive page is archived=only; that's the page itself, not a filter to remove.
  if (f.archived === 'include' && !covered.archived) pills.push({ key: 'archived', label: 'Including archived', remove: () => set({ ...f, archived: 'hide' }) })
  if (pills.length === 0) return null

  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      {pills.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={p.remove}
          aria-label={`Remove filter ${p.label}`}
          className="hit flex h-7 items-center gap-1.5 rounded-md bg-raised pr-2 pl-2.5 text-xs text-fg hover:bg-line"
        >
          {p.label}
          <X className="size-3 text-muted" />
        </button>
      ))}
      <button type="button" onClick={() => set(clearFilters(f))} className="hit ml-1 text-xs text-muted hover:text-fg">
        Clear all
      </button>
    </div>
  )
}

/** One page for everything on deck — type, filters, sort and group all come from the URL. */
/**
 * Changing sort or filters glides posters to their new places. Each animated card is captured separately,
 * so very long lists skip it and simply re-lay out.
 */
const REORDER_MAX = 60
function Reorderable({ on, children }: { on: boolean; children: React.ReactNode }) {
  return on ? (
    <ViewTransition default="none" update="reorder" enter="card-in" exit="card-out">
      {children}
    </ViewTransition>
  ) : (
    children
  )
}

/** Progress view: status groups in the order you'd act on them. */
const ROW_ORDER = ['in_progress', 'caught_up', 'stalled', 'wanted', 'completed', 'dropped']

export function Library() {
  const { items, allItems, isLoading, isSample } = useItems()
  const [f, set] = useFilters()
  const [view, setView] = useLibraryView(f.type)
  const rows = view === 'rows'
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data: collections = [] } = useCollections()
  const { create, setRules } = useCollectionActions()
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  // Select mode: tap cards to pick several, then act on them from the bar at the bottom.
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const stopSelecting = useCallback(() => {
    setSelecting(false)
    setPicked(new Set())
  }, [])
  const togglePick = (id: string) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const smartId = params.get('smart')
  const editing = smartId ? collections.find((c) => c.id === smartId && c.rules != null) : undefined

  // Filtering, sorting and grouping a large library is the expensive part of this page:
  // only redo it when the library or the filters change.
  const { inType, results, archivedCount, preReleaseCount, groups } = useMemo(() => {
    const inType = f.types.length ? items.filter((i) => f.types.includes(i.title.mediaType)) : items
    // allItems, so the Archived filter can bring archived titles back (applyFilters hides them by default).
    const results = sortItems(applyFilters(allItems, f), f.sort)
    const archivedCount = allItems.filter((i) => i.archivedAt && (!f.types.length || f.types.includes(i.title.mediaType))).length
    // Games: how many aren't out yet, for the Hide/Show pre-release toggle.
    const preReleaseCount = f.type === 'game' ? inType.filter((i) => releaseInfo(i.title).preRelease).length : 0
    // Progress view: grouped by status unless another grouping is picked.
    const group = rows && f.group === 'none' ? 'status' : f.group
    return { inType, results, archivedCount, preReleaseCount, groups: groupItems(results, group, f.type) }
  }, [items, allItems, f, rows])

  const hidesPreRelease = f.release.length === 1 && f.release[0] === 'released'
  // "20 of 28" while filters narrow the list. Showing archived titles isn't narrowing, so it isn't counted, and the
  // total takes them in (it was "56 of 49").
  const total = inType.length + (f.archived === 'include' ? archivedCount : 0)
  const narrowing = activeCount(f) - (f.archived === 'include' ? 1 : 0)
  const meta = narrowing > 0 && f.archived !== 'only' ? `${results.length} of ${total}` : `${results.length}`

  if (isLoading) return <PageSkeleton />
  // Only what's on screen counts (a filter change can hide something you'd picked).
  const selected = selecting ? results.filter((i) => picked.has(i.id)) : []
  const card = (item: (typeof results)[number]) => (
    <SelectableCard selecting={selecting} selected={picked.has(item.id)} onToggle={() => togglePick(item.id)} label={item.title.title}>
      {/* Big libraries: the browser skips laying out and painting cards that are off screen. */}
      <PosterCard item={item} className={results.length > REORDER_MAX ? 'cv-auto' : undefined} showDeal={f.deal.length > 0} />
    </SelectableCard>
  )

  const shown = typesLabel(f.types)
  const title = f.archived === 'only' ? (shown ? `Archived ${typesLabel(f.types, true)}` : 'Archive') : (shown ?? 'Library')

  return (
    <div>
      <PageHeader title={title} meta={meta}>
        {/* Only once something differs from the defaults (choosing a type alone doesn't count). */}
        {!isSample && !editing && (activeCount(f) > 0 || f.sort !== DEFAULT_SORT) && (
          <button
            type="button"
            onClick={() => setSaving((v) => !v)}
            aria-expanded={saving}
            className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs text-fg hover:border-accent"
          >
            <Sparkles className="size-3.5" /> Save as smart collection
          </button>
        )}
        {/* Shown in both views, so the Covers/Progress switch never moves (or drops to its own line on narrower
            windows) when you flip views. Selecting works on covers, so from Progress it switches to Covers first. */}
        {!isSample && results.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (selecting) return stopSelecting()
              if (rows) setView('covers')
              setSelecting(true)
            }}
            aria-pressed={selecting}
            className={clsx(
              'hit flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs hover:border-accent',
              selecting ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg',
            )}
          >
            <CheckSquare className="size-3.5" /> {selecting ? 'Done' : 'Select'}
          </button>
        )}
        {/* Phones: Collections isn't in the tab bar, so it's reached from here. */}
        <Link
          to="/collections"
          className="hit flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs text-fg hover:border-accent md:hidden"
        >
          <Layers className="size-3.5" /> Collections
        </Link>
        {/* Last, so it keeps its place at the right edge whichever buttons are showing. */}
        <div role="radiogroup" aria-label="Show as" className="flex rounded-md border border-line p-0.5 text-xs">
          {[
            { on: false, label: 'Covers', icon: LayoutGrid },
            { on: true, label: 'Progress', icon: Rows3 },
          ].map((v) => (
            <button
              key={v.label}
              type="button"
              role="radio"
              aria-checked={rows === v.on}
              onClick={() => {
                if (v.on && selecting) stopSelecting()
                setView(v.on ? 'rows' : 'covers')
              }}
              className={clsx(
                'hit flex h-8 items-center gap-1.5 rounded px-2.5',
                rows === v.on ? 'bg-raised font-medium text-fg' : 'text-muted hover:text-fg',
              )}
            >
              <v.icon className="size-3.5" />
              {v.label}
            </button>
          ))}
        </div>
      </PageHeader>
      {editing && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/60 bg-accent/5 px-4 py-3">
          <p className="text-sm text-fg">
            Editing the rules of <b>{editing.name}</b>. Change the type, filters or sort, then save.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setRules.mutate({ id: editing.id, rules: rulesFrom(f) }, { onSuccess: () => navigate(`/collections/${editing.id}`) })
              }
              disabled={setRules.isPending}
              className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg disabled:opacity-60"
            >
              {setRules.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Save changes
            </button>
            <button
              type="button"
              onClick={() => navigate(`/collections/${editing.id}`)}
              className="h-8 rounded-md border border-line px-3 text-xs text-fg hover:border-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {saving && !editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!saveName.trim()) return
            create.mutate({ name: saveName, rules: rulesFrom(f) }, { onSuccess: (id) => navigate(`/collections/${id}`) })
          }}
          className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3"
        >
          <p className="w-full text-xs text-muted">
            A smart collection keeps these filters and sort, and updates itself as your library changes.
          </p>
          <input
            name="name"
            autoFocus
            autoComplete="off"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name, e.g. Quick wins…"
            maxLength={80}
            aria-label="Smart collection name"
            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint focus:border-accent"
          />
          <button
            type="submit"
            disabled={!saveName.trim() || create.isPending}
            className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </button>
        </form>
      )}
      <ActiveFilters f={f} set={set} covered={{ archived: archivedCount > 0, released: preReleaseCount > 0 && hidesPreRelease }} />
      {/* Quick show/hide switches for the two things people most often want out of the way. */}
      {(archivedCount > 0 || preReleaseCount > 0) && f.archived !== 'only' && (
        <div className="-mt-3 mb-4 flex flex-wrap gap-2">
          {archivedCount > 0 && (
            <ToggleChip
              on={f.archived === 'hide'}
              onClick={() => set({ ...f, archived: f.archived === 'hide' ? 'include' : 'hide' })}
              hide="Hide archived"
              show={`Show archived (${archivedCount})`}
            />
          )}
          {preReleaseCount > 0 && (
            <ToggleChip
              on={hidesPreRelease}
              onClick={() => set({ ...f, release: hidesPreRelease ? [] : ['released'] })}
              hide={`Hide pre-release (${preReleaseCount})`}
              show="Show pre-release"
            />
          )}
        </div>
      )}

      {inType.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          {!isSample && (f.type === 'game' || f.type === 'book')
            ? f.type === 'book'
              ? 'No books yet. Use the search bar to add one.'
              : 'No games yet. Use the search bar to add one.'
            : 'Nothing here yet. Use the search bar to add something.'}
        </p>
      ) : results.length === 0 && f.archived === 'only' && narrowing <= 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          Nothing archived{shown ? ` in ${typesLabel(f.types, true)}` : ''}. Archive a title from its page to keep it off
          Home and the Library without losing it.
        </p>
      ) : results.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          Nothing matches these filters.{' '}
          <button type="button" onClick={() => set(clearFilters(f))} className="text-accent-ink hover:underline">
            Clear filters
          </button>
        </p>
      ) : rows ? (
        <div className="max-w-5xl space-y-8">
          {/* What you're in the middle of leads; then what's next to start; finished last. */}
          {(f.group === 'none' ? [...groups].sort((x, y) => ROW_ORDER.indexOf(x.key) - ROW_ORDER.indexOf(y.key)) : groups).map((g) => (
            <section key={g.key} className="space-y-2">
              {g.label && (
                <h2 className="flex items-baseline gap-3 text-base font-semibold tracking-tight text-fg">
                  {g.label}
                  <span className="font-mono text-xs font-normal text-faint">{g.items.length}</span>
                </h2>
              )}
              <ProgressRows items={g.items} />
            </section>
          ))}
        </div>
      ) : f.group === 'none' ? (
        <div className={grid}>
          {results.map((item) => (
            <Reorderable key={item.id} on={results.length <= REORDER_MAX}>
              {card(item)}
            </Reorderable>
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map((g) => (
            <section key={g.key} className="space-y-3">
              <h2 className="flex items-baseline gap-3 text-lg font-semibold tracking-tight text-fg">
                {g.label}
                <span className="font-mono text-xs font-normal text-faint">{g.items.length}</span>
              </h2>
              <div className={grid}>
                {g.items.map((item) => (
                  <Reorderable key={item.id} on={results.length <= REORDER_MAX}>
                    {card(item)}
                  </Reorderable>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selecting && (
        <BulkBar
          selected={selected}
          visible={results.length}
          archivedView={f.archived === 'only'}
          onSelectAll={() => setPicked(new Set(results.map((i) => i.id)))}
          onClear={() => setPicked(new Set())}
          pageType={f.type}
          onDone={stopSelecting}
        />
      )}
      {selecting && <div className="h-24" aria-hidden />}

      {isSample && (
        <p className="mt-10 text-center text-xs text-faint">
          A sample library to try out. <Link to="/login" className="hit text-accent-ink hover:underline">Sign in</Link> to keep your own.
        </p>
      )}
    </div>
  )
}

/**
 * A show/hide switch: `on` means the things are hidden, so it offers to show them (and the reverse). The label says
 * what tapping it does.
 */
function ToggleChip({ on, onClick, hide, show }: { on: boolean; onClick: () => void; hide: string; show: string }) {
  const Icon = on ? Eye : EyeOff
  return (
    <button
      type="button"
      onClick={onClick}
      className="hit flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-muted hover:border-accent hover:text-fg"
    >
      <Icon className="size-3.5" />
      {on ? show : hide}
    </button>
  )
}
