import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Layers, Loader2, Sparkles, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PosterCard } from '../components/PosterCard'
import {
  LABELS,
  activeCount,
  applyFilters,
  clearFilters,
  groupItems,
  sortItems,
  type Filters,
} from '../lib/filters'
import { useItems } from '../lib/library'
import { rulesFrom, useFilters } from '../lib/useFilters'
import { useCollectionActions, useCollections } from '../lib/collections'

const grid =
  'grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]'

/** One removable pill per active filter value, plus Clear all. */
function ActiveFilters({ f, set }: { f: Filters; set: (next: Filters) => void }) {
  const pills: { key: string; label: string; remove: () => void }[] = []
  const without = <T,>(list: T[], v: T) => list.filter((x) => x !== v)
  f.status.forEach((v) => pills.push({ key: `s-${v}`, label: `Status: ${LABELS.status[v]}`, remove: () => set({ ...f, status: without(f.status, v) }) }))
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
export function Library() {
  const { items, isLoading, isSample } = useItems()
  const [f, set] = useFilters()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data: collections = [] } = useCollections()
  const { create, setRules } = useCollectionActions()
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const smartId = params.get('smart')
  const editing = smartId ? collections.find((c) => c.id === smartId && c.rules != null) : undefined

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24 text-muted">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const inType = f.type ? items.filter((i) => i.title.mediaType === f.type) : items
  const results = sortItems(applyFilters(items, f), f.sort)
  const groups = groupItems(results, f.group)
  const title = f.type ? LABELS.type[f.type] : 'Library'

  return (
    <div>
      <PageHeader title={title} meta={activeCount(f) ? `${results.length} of ${inType.length}` : `${inType.length}`}>
        {!isSample && !editing && (f.type || activeCount(f) > 0) && (
          <button
            type="button"
            onClick={() => setSaving((v) => !v)}
            aria-expanded={saving}
            className="flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-fg hover:border-accent"
          >
            <Sparkles className="size-3.5" /> Save as smart collection
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
            <PosterCard key={item.id} item={item} />
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
                  <PosterCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {isSample && (
        <p className="mt-10 text-center text-xs text-faint">
          Sample data — <Link to="/login" className="text-accent-ink hover:underline">sign in</Link> to filter your own library.
        </p>
      )}
    </div>
  )
}
