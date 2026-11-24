import clsx from 'clsx'
import { useCallback, useMemo, useState, ViewTransition } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckSquare, Layers, Loader2, Sparkles, X } from 'lucide-react'
import { BulkBar, SelectableCard } from '../components/BulkBar'
import { PageHeader } from '../components/PageHeader'
import { PageSkeleton } from '../components/LazyPage'
import { PosterCard } from '../components/PosterCard'
import {
  LABELS,
  activeCount,
  applyFilters,
  clearFilters,
  groupItems,
  sortItems,
  type Filters,
  type TriKey,
  TRI_KEYS,
  DEFAULT_SORT,
} from '../lib/filters'
import { useItems } from '../lib/library'
import { statusLabel } from '../lib/statusLabels'
import type { Progress } from '../types'
import { rulesFrom, useFilters } from '../lib/useFilters'
import { useCollectionActions, useCollections } from '../lib/collections'

const grid =
  'grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]'

/** One removable pill per active filter value, plus Clear all. */
function ActiveFilters({ f, set }: { f: Filters; set: (next: Filters) => void }) {
  const pills: { key: string; label: string; remove: () => void }[] = []
  const without = <T,>(list: T[], v: T) => list.filter((x) => x !== v)
  f.status.forEach((v) => pills.push({ key: `s-${v}`, label: `Status: ${statusLabel(v, f.type)}`, remove: () => set({ ...f, status: without(f.status, v) }) }))
  f.priority.forEach((v) => pills.push({ key: `p-${v}`, label: `Priority: ${LABELS.priority[v]}`, remove: () => set({ ...f, priority: without(f.priority, v) }) }))
  f.rating.forEach((v) => pills.push({ key: `r-${v}`, label: LABELS.rating[v], remove: () => set({ ...f, rating: without(f.rating, v) }) }))
  f.availability.forEach((v) => pills.push({ key: `av-${v}`, label: LABELS.availability[v], remove: () => set({ ...f, availability: without(f.availability, v) }) }))
  if (f.minScore != null) pills.push({ key: 'score', label: `Score ${f.minScore}+`, remove: () => set({ ...f, minScore: null }) })
  f.release.forEach((v) => pills.push({ key: `rel-${v}`, label: LABELS.release[v], remove: () => set({ ...f, release: without(f.release, v) }) }))
  if (f.yearFrom != null || f.yearTo != null)
    pills.push({
      key: 'year',
      label: `Year ${f.yearFrom ?? '…'}–${f.yearTo ?? '…'}`,
      remove: () => set({ ...f, yearFrom: null, yearTo: null }),
    })
  if (f.archived !== 'hide')
    pills.push({ key: 'archived', label: `Archived: ${LABELS.archived[f.archived]}`, remove: () => set({ ...f, archived: 'hide' }) })
  if (f.added) pills.push({ key: 'added', label: `Added: ${LABELS.added[f.added]}`, remove: () => set({ ...f, added: null }) })
  f.genre.forEach((v) => pills.push({ key: `g-${v}`, label: v, remove: () => set({ ...f, genre: without(f.genre, v) }) }))
  f.tvStatus.forEach((v) => pills.push({ key: `ts-${v}`, label: LABELS.tvStatus[v], remove: () => set({ ...f, tvStatus: without(f.tvStatus, v) }) }))
  f.coop.forEach((v) => pills.push({ key: `co-${v}`, label: LABELS.coop[v], remove: () => set({ ...f, coop: without(f.coop, v) }) }))
  f.deck.forEach((v) => pills.push({ key: `dk-${v}`, label: LABELS.deck[v], remove: () => set({ ...f, deck: without(f.deck, v) }) }))
  f.access.forEach((v) => pills.push({ key: `ac-${v}`, label: LABELS.access[v], remove: () => set({ ...f, access: without(f.access, v) }) }))
  f.length.forEach((v) => pills.push({ key: `ln-${v}`, label: LABELS.length[v], remove: () => set({ ...f, length: without(f.length, v) }) }))
  f.deal.forEach((v) => pills.push({ key: `dl-${v}`, label: LABELS.deal[v], remove: () => set({ ...f, deal: without(f.deal, v) }) }))
  if (f.maxPrice != null) pills.push({ key: 'maxprice', label: `Under ${f.maxPrice}`, remove: () => set({ ...f, maxPrice: null }) })
  f.tvProgress.forEach((v) => pills.push({ key: `tp-${v}`, label: LABELS.tvProgress[v], remove: () => set({ ...f, tvProgress: without(f.tvProgress, v) }) }))
  // Exclusions ("not …") from 3-state groups.
  const name = (k: TriKey, v: string): string => {
    if (k === 'status') return statusLabel(v as Progress, f.type)
    const table = (LABELS as unknown as Record<string, Record<string, string> | undefined>)[k]
    return table?.[v] ?? v
  }
  for (const k of TRI_KEYS) {
    for (const v of f.not[k] ?? []) {
      pills.push({
        key: `not-${k}-${v}`,
        label: `Not: ${name(k, v)}`,
        remove: () => set({ ...f, not: { ...f.not, [k]: (f.not[k] ?? []).filter((x) => x !== v) } }),
      })
    }
  }
  if (pills.length === 0) return null

  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      {pills.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={p.remove}
          aria-label={`Remove filter ${p.label}`}
          className="flex h-7 items-center gap-1 rounded-full border border-accent/60 bg-accent/10 pr-2 pl-2.5 text-xs text-fg hover:border-accent"
        >
          {p.label}
          <X className="size-3 text-muted" />
        </button>
      ))}
      <button type="button" onClick={() => set(clearFilters(f))} className="ml-1 text-xs text-muted hover:text-fg">
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

export function Library() {
  const { items, allItems, isLoading, isSample } = useItems()
  const [f, set] = useFilters()
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
  const { inType, results, hiddenArchived, groups } = useMemo(() => {
    const inType = f.type ? items.filter((i) => i.title.mediaType === f.type) : items
    // allItems, so the Archived filter can bring archived titles back (applyFilters hides them by default).
    const results = sortItems(applyFilters(allItems, f), f.sort)
    const hiddenArchived =
      f.archived === 'hide' ? allItems.filter((i) => i.archivedAt && (!f.type || i.title.mediaType === f.type)).length : 0
    return { inType, results, hiddenArchived, groups: groupItems(results, f.group) }
  }, [items, allItems, f])

  if (isLoading) return <PageSkeleton />
  // Only what's on screen counts (a filter change can hide something you'd picked).
  const selected = selecting ? results.filter((i) => picked.has(i.id)) : []
  const card = (item: (typeof results)[number]) => (
    <SelectableCard selecting={selecting} selected={picked.has(item.id)} onToggle={() => togglePick(item.id)} label={item.title.title}>
      <PosterCard item={item} />
    </SelectableCard>
  )

  const title = f.archived === 'only' ? (f.type ? `Archived ${LABELS.type[f.type]}` : 'Archive') : f.type ? LABELS.type[f.type] : 'Library'

  return (
    <div>
      <PageHeader title={title} meta={activeCount(f) ? `${results.length} of ${inType.length}` : `${inType.length}`}>
        {/* Only once something differs from the defaults (choosing a type alone doesn't count). */}
        {!isSample && !editing && (activeCount(f) > 0 || f.sort !== DEFAULT_SORT) && (
          <button
            type="button"
            onClick={() => setSaving((v) => !v)}
            aria-expanded={saving}
            className="flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-fg hover:border-accent"
          >
            <Sparkles className="size-3.5" /> Save as smart collection
          </button>
        )}
        {!isSample && results.length > 0 && (
          <button
            type="button"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            aria-pressed={selecting}
            className={clsx(
              'flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs hover:border-accent',
              selecting ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg',
            )}
          >
            <CheckSquare className="size-3.5" /> {selecting ? 'Done' : 'Select'}
          </button>
        )}
        {/* Phones: Collections isn't in the tab bar, so it's reached from here. */}
        <Link
          to="/collections"
          className="flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-fg hover:border-accent md:hidden"
        >
          <Layers className="size-3.5" /> Collections
        </Link>
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
              className="flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg disabled:opacity-60"
            >
              {setRules.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Save changes
            </button>
            <button
              type="button"
              onClick={() => navigate(`/collections/${editing.id}`)}
              className="h-8 rounded-full border border-line px-3 text-xs text-fg hover:border-accent"
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
            autoFocus
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name, e.g. Quick wins"
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
      <ActiveFilters f={f} set={set} />
      {hiddenArchived > 0 && (
        <p className="-mt-3 mb-4 text-xs text-faint">
          {hiddenArchived} archived title{hiddenArchived === 1 ? ' is' : 's are'} hidden by default ·{' '}
          <button type="button" onClick={() => set({ ...f, archived: 'include' })} className="text-accent-ink hover:underline">
            Show
          </button>
        </p>
      )}

      {inType.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          {!isSample && (f.type === 'game' || f.type === 'book')
            ? f.type === 'book'
              ? 'No books yet — use the search bar to add one.'
              : 'No games yet — use the search bar to add one.'
            : 'Nothing here yet — use the search bar to add something.'}
        </p>
      ) : results.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          Nothing matches these filters.{' '}
          <button type="button" onClick={() => set(clearFilters(f))} className="text-accent-ink hover:underline">
            Clear filters
          </button>
        </p>
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
          onDone={stopSelecting}
        />
      )}
      {selecting && <div className="h-24" aria-hidden />}

      {isSample && (
        <p className="mt-10 text-center text-xs text-faint">
          Sample data — <Link to="/login" className="text-accent-ink hover:underline">sign in</Link> to filter your own library.
        </p>
      )}
    </div>
  )
}
