import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, ChevronDown, Gamepad2, LayoutGrid, List, Loader2, Search, Sparkles, Tv } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import { fetchCandidates, fetchSkips, importCandidates, type Candidate, type ImportResult, type ImportSource } from '../lib/importer'
import { useItems } from '../lib/library'

const SOURCE_NAME: Record<ImportSource, string> = { steam: 'Steam', plex: 'Plex' }
const btn = 'flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs text-fg hover:border-accent disabled:opacity-50'

/** Poster tile (grid view). */
function Tile({ c, on, inLib, skipped, onToggle }: { c: Candidate; on: boolean; inLib: boolean; skipped: boolean; onToggle: () => void }) {
  const Icon = c.mediaType === 'game' ? Gamepad2 : Tv
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={inLib}
      aria-pressed={on}
      title={inLib ? `${c.title} is already in your library` : c.title}
      className={clsx('group relative block text-left disabled:cursor-default', inLib && 'opacity-45')}
    >
      <div
        className={clsx(
          'relative aspect-[2/3] overflow-hidden rounded-lg border-2 bg-raised transition',
          on ? 'border-accent' : 'border-transparent group-hover:border-line',
        )}
      >
        {c.poster ? (
          <img src={c.poster} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center p-2 text-center text-xs text-muted">
            <Icon className="mb-1 size-4" />
            {c.title}
          </div>
        )}
        <span
          className={clsx(
            'absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full border-2 shadow',
            on ? 'border-accent bg-accent text-accent-fg' : 'border-white/70 bg-black/40 text-transparent',
          )}
        >
          <Check className="size-3.5" />
        </span>
        {(inLib || c.suggested || skipped) && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-white">
            {inLib ? 'IN LIBRARY' : skipped ? 'SKIPPED BEFORE' : 'SUGGESTED'}
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate text-xs font-medium text-fg">{c.title}</p>
      <p className="truncate text-xs text-faint">{c.detail}</p>
    </button>
  )
}

/** Compact row (list view). */
function Row({ c, on, inLib, skipped, onToggle }: { c: Candidate; on: boolean; inLib: boolean; skipped: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className={clsx('flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-raised/60', inLib && 'cursor-default opacity-45')}>
        <input type="checkbox" checked={on} disabled={inLib} onChange={onToggle} className="size-4 shrink-0 accent-[var(--color-accent)]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">
            {c.title} {c.year && <span className="text-faint">({c.year})</span>}
          </span>
          <span className="block truncate text-xs text-muted">{c.detail}</span>
        </span>
        {(inLib || c.suggested || skipped) && (
          <span className="shrink-0 text-xs text-faint">{inLib ? 'In library' : skipped ? 'Skipped before' : 'Suggested'}</span>
        )}
      </label>
    </li>
  )
}

/** /import/steam and /import/plex: pick which titles to add (Suggested pre-ticked; everything stays editable). */
export function ImportPage() {
  const { source: raw } = useParams()
  const source: ImportSource = raw === 'plex' ? 'plex' : 'steam'
  const { user, loading } = useAuth()
  const { allItems } = useItems()
  const queryClient = useQueryClient()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const cands = useQuery({ queryKey: ['import-candidates', source, user?.id], enabled: !!user, queryFn: () => fetchCandidates(source), staleTime: 5 * 60_000 })
  const skips = useQuery({ queryKey: ['import-skips', user?.id], enabled: !!user, queryFn: fetchSkips })

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Section headings stick just under the top bar (3.5rem) and the controls row, whose height varies
  // (it wraps on phones), so it's measured.
  const controlsRef = useRef<HTMLDivElement>(null)
  const [controlsH, setControlsH] = useState(49)
  useEffect(() => {
    const el = controlsRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setControlsH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [cands.data])
  const stickyTop = 56 + controlsH

  /**
   * Collapse or expand a section. Collapsing while scrolled inside it brings its heading back to where it was
   * stuck, so the next section's heading follows straight after.
   */
  const toggleSection = (group: string, section: HTMLElement | null) => {
    const next = new Set(collapsed)
    const collapsing = !next.has(group)
    if (collapsing) next.add(group)
    else next.delete(group)
    setCollapsed(next)
    if (collapsing && section && section.getBoundingClientRect().top < stickyTop) {
      requestAnimationFrame(() => window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - stickyTop }))
    }
  }

  const inLibrary = useMemo(() => new Set(allItems.map((i) => i.title.sourceKey)), [allItems])
  const list = useMemo(() => cands.data?.candidates ?? [], [cands.data])
  const pickable = useMemo(() => list.filter((c) => !inLibrary.has(c.key)), [list, inLibrary])

  // Start with the suggestions ticked (minus anything skipped before or already in the library).
  const suggestedSet = () => new Set(pickable.filter((c) => c.suggested && !skips.data?.has(c.key)).map((c) => c.key))
  useEffect(() => {
    if (selected === null && cands.data && skips.data) setSelected(suggestedSet())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cands.data, skips.data])

  const sel = selected ?? new Set<string>()
  const toggle = (key: string) => {
    const next = new Set(sel)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
  }
  const q = filter.trim().toLowerCase()
  const groups = useMemo(() => {
    const m = new Map<string, Candidate[]>()
    for (const c of list) {
      if (q && !c.title.toLowerCase().includes(q)) continue
      if (!m.has(c.group)) m.set(c.group, [])
      m.get(c.group)!.push(c)
    }
    // Suggested first, then by the source's order value (playtime, episodes, most recent).
    for (const v of m.values()) v.sort((a, b) => Number(b.suggested) - Number(a.suggested) || b.sortValue - a.sortValue)
    return [...m.entries()]
  }, [list, q])

  const doImport = async () => {
    const chosen = pickable.filter((c) => sel.has(c.key))
    const notChosen = pickable.filter((c) => !sel.has(c.key))
    setResult(null)
    setProgress({ done: 0, total: chosen.length })
    const r = await importCandidates(user!.id, chosen, notChosen, (done, total) => setProgress({ done, total }))
    setProgress(null)
    setResult(r)
    // Anything that failed stays ticked, so "Add" right away retries just those.
    setSelected(new Set(r.failed.map((f) => f.key)))
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['library'] }),
      queryClient.invalidateQueries({ queryKey: ['import-skips'] }),
    ])
  }

  if (!loading && !user) {
    return (
      <div>
        <PageHeader title={`Import from ${SOURCE_NAME[source]}`} />
        <p className="py-16 text-center text-sm text-muted">
          <Link to="/login" className="text-accent-ink hover:underline">
            Sign in
          </Link>{' '}
          to import.
        </p>
      </div>
    )
  }

  const count = [...sel].filter((k) => !inLibrary.has(k)).length
  return (
    <div className="pb-24">
      <PageHeader title={`Import from ${SOURCE_NAME[source]}`} meta={cands.data ? `${list.length} found` : undefined} />

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-accent/50 bg-accent/5 px-4 py-3">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-ink" />
        <p className="text-sm text-fg">
          Only pick what you think you’ll actually get to. On Deck is for cutting out the noise, not cataloguing everything
          you’ve ever touched. We’ve ticked some suggestions to start; change anything you like.
        </p>
      </div>

      {cands.isLoading ? (
        <p className="flex items-center gap-2 py-12 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Reading your {SOURCE_NAME[source]} {source === 'steam' ? 'library and wishlist' : 'watch history'}…
          {source === 'plex' && ' (this can take ~20 seconds)'}
        </p>
      ) : cands.error ? (
        <p className="py-12 text-sm text-bad">Couldn’t read your {SOURCE_NAME[source]} account. Please try again.</p>
      ) : cands.data?.note === 'not_linked' ? (
        <p className="py-12 text-sm text-muted">
          Link your {SOURCE_NAME[source]} account first in{' '}
          <Link to="/settings#accounts" className="text-accent-ink hover:underline">
            Settings
          </Link>
          .
        </p>
      ) : cands.data?.note === 'private' ? (
        <p className="py-12 text-sm text-muted">
          Your Steam game details are private. In Steam, set <b>Profile → Privacy → Game details</b> to Public, then try again.
        </p>
      ) : (
        <>
          {/* Controls */}
          <div ref={controlsRef} className="sticky top-14 z-20 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
            <button type="button" className={btn} onClick={() => setSelected(new Set(pickable.map((c) => c.key)))}>
              All
            </button>
            <button type="button" className={btn} onClick={() => setSelected(new Set())}>
              None
            </button>
            <button type="button" className={btn} onClick={() => setSelected(suggestedSet())}>
              <Sparkles className="size-3.5" /> Suggested
            </button>
            <label className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-line px-3 text-xs text-muted focus-within:border-accent sm:max-w-xs">
              <Search className="size-3.5 shrink-0" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by title"
                aria-label="Filter by title"
                className="w-full bg-transparent text-fg outline-none placeholder:text-faint"
              />
            </label>
            <div className="ml-auto flex rounded-md border border-line p-0.5" role="radiogroup" aria-label="View">
              {(['grid', 'list'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  aria-label={v === 'grid' ? 'Posters' : 'List'}
                  onClick={() => setView(v)}
                  className={clsx('grid size-7 place-items-center rounded-full', view === v ? 'bg-raised text-fg' : 'text-muted')}
                >
                  {v === 'grid' ? <LayoutGrid className="size-3.5" /> : <List className="size-3.5" />}
                </button>
              ))}
            </div>
          </div>

          {groups.map(([group, items]) => {
            const picked = items.filter((c) => sel.has(c.key) && !inLibrary.has(c.key)).length
            const isCollapsed = collapsed.has(group)
            const bodyId = `import-${group.replace(/\W+/g, '-').toLowerCase()}`
            return (
              <section key={group} className="mb-6">
                {/* Sticks under the controls while you scroll its section; tap to collapse and jump to the next. */}
                <h2 className="sticky z-10 -mx-4 border-b border-line bg-bg/90 px-4 backdrop-blur md:-mx-6 md:px-6" style={{ top: stickyTop }}>
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    aria-controls={bodyId}
                    onClick={(e) => toggleSection(group, e.currentTarget.closest('section'))}
                    className="no-press flex w-full items-baseline gap-2 py-2.5 text-left text-base font-semibold text-fg"
                  >
                    {group}
                    <span className="font-mono text-xs font-normal text-faint">
                      {picked} of {items.length} picked
                    </span>
                    <span className="ml-auto flex items-center gap-1 self-center text-xs font-normal text-muted">
                      {isCollapsed ? 'Show' : 'Collapse'}
                      <ChevronDown className={clsx('size-4 transition-transform', isCollapsed && '-rotate-90')} />
                    </span>
                  </button>
                </h2>
                {!isCollapsed && (
                  <div id={bodyId} className="pt-3">
                    {view === 'grid' ? (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]">
                        {items.map((c) => (
                          <Tile key={c.key} c={c} on={sel.has(c.key)} inLib={inLibrary.has(c.key)} skipped={!!skips.data?.has(c.key)} onToggle={() => toggle(c.key)} />
                        ))}
                      </div>
                    ) : (
                      <ul className="divide-y divide-line rounded-lg border border-line">
                        {items.map((c) => (
                          <Row key={c.key} c={c} on={sel.has(c.key)} inLib={inLibrary.has(c.key)} skipped={!!skips.data?.has(c.key)} onToggle={() => toggle(c.key)} />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            )
          })}
          {!!cands.data?.unmatched && (
            <p className="text-xs text-faint">{cands.data.unmatched} Steam apps aren’t in IGDB (On Deck’s game source) and can’t be added.</p>
          )}
        </>
      )}

      {/* Sticky action bar */}
      {cands.data && !cands.data.note && (
        <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-56">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
            {progress ? (
              <>
                <Loader2 className="size-4 animate-spin text-muted" />
                <span className="text-sm text-fg">
                  Adding… {progress.done} / {progress.total}
                </span>
                <div className="h-1.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-faint/40">
                  <div className="h-full bg-accent-ink transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%` }} />
                </div>
              </>
            ) : result ? (
              <p className="text-sm text-fg">
                Added <b>{result.added}</b> to your library
                {result.failed.length ? (
                  <span className="text-bad" title={result.failed.map((f) => f.title).join(', ')}>
                    {' '}{result.failed.length} couldn’t be added. They’re still ticked, so add again to retry.
                  </span>
                ) : (
                  ''
                )}
                .{' '}
                <Link to="/library" className="text-accent-ink hover:underline">
                  Open Library
                </Link>
              </p>
            ) : (
              <p className="text-sm text-muted">
                <b className="text-fg">{count}</b> selected. Unticked titles are remembered and stay unticked next time
              </p>
            )}
            {!progress && (
              <button
                type="button"
                onClick={() => void doImport()}
                disabled={count === 0}
                className="ml-auto flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:brightness-95 disabled:opacity-50"
              >
                Add {count} to library
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
