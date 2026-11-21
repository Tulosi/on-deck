import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, Film, Gamepad2, Loader2, Plus, Search, Tv } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { resultKey, searchGames, searchTmdb, useAddFromTmdb, useItems, type SearchResult } from '../lib/library'

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

type AddState = 'adding' | 'added' | { error: string }

function ResultRow({
  result,
  onDeck,
  state,
  onAdd,
}: {
  result: SearchResult
  onDeck: boolean
  state?: AddState
  onAdd: () => void
}) {
  const TypeIcon = result.mediaType === 'movie' ? Film : result.mediaType === 'game' ? Gamepad2 : Tv
  const added = onDeck || state === 'added'
  return (
    <li className="flex items-center gap-3 px-3 py-2 hover:bg-raised/60">
      <div className="h-[60px] w-10 shrink-0 overflow-hidden rounded bg-raised">
        {result.posterUrl ? (
          <img src={result.posterUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center">
            <TypeIcon className="size-4 text-faint" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{result.title}</p>
        <p className="flex items-center gap-1.5 font-mono text-xs text-muted">
          <TypeIcon className="size-3" />
          {result.mediaType === 'movie' ? 'Movie' : result.mediaType === 'game' ? 'Game' : 'TV'}
          {result.year && <span className="text-faint">· {result.year}</span>}
          {result.rating != null && <span className="text-faint">· ★ {result.rating.toFixed(1)}</span>}
          {result.developer && <span className="truncate text-faint">· {result.developer}</span>}
        </p>
        {typeof state === 'object' && <p className="truncate text-xs text-bad">{state.error}</p>}
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={added || state === 'adding'}
        className={
          added
            ? 'flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium text-good'
            : 'flex h-8 shrink-0 items-center gap-1 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg hover:brightness-95 disabled:opacity-60'
        }
      >
        {state === 'adding' ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : added ? (
          <Check className="size-3.5" />
        ) : (
          <Plus className="size-3.5" />
        )}
        {added ? 'On deck' : 'Add'}
      </button>
    </li>
  )
}

/** One labelled block of results (its own loading / error / empty state). */
function ResultSection({
  title,
  q,
  empty,
  render,
}: {
  title: string
  q: { data?: SearchResult[]; error: unknown; isLoading: boolean }
  empty: string
  render: (r: SearchResult) => ReactNode
}) {
  return (
    <section className="border-b border-line last:border-b-0">
      <p className="px-4 pt-3 pb-1 font-mono text-[10px] tracking-wider text-faint uppercase">{title}</p>
      {q.error ? (
        <p className="px-4 pb-3 text-sm text-bad">Search failed: {(q.error as Error).message}</p>
      ) : q.isLoading || !q.data ? (
        <p className="px-4 pb-3 text-sm text-muted">Searching…</p>
      ) : q.data.length === 0 ? (
        <p className="px-4 pb-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line pb-1">{q.data.map(render)}</ul>
      )}
    </section>
  )
}

/** Top-bar search: movies + TV (TMDB) and PC games (IGDB), searched in parallel, with one-click Add. */
export function SearchBox() {
  const { user } = useAuth()
  const { items, isSample } = useItems()
  const addFromTmdb = useAddFromTmdb()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [addStates, setAddStates] = useState<Record<string, AddState>>({})
  const wrapper = useRef<HTMLDivElement>(null)
  const query = useDebounced(text.trim(), 300)

  const screen = useQuery({
    queryKey: ['tmdb-search', query],
    queryFn: () => searchTmdb(query),
    enabled: !!user && query.length >= 2,
    staleTime: 10 * 60_000,
  })
  const games = useQuery({
    queryKey: ['igdb-search', query],
    queryFn: () => searchGames(query),
    enabled: !!user && query.length >= 2,
    staleTime: 10 * 60_000,
  })
  const fetching = screen.isFetching || games.isFetching

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const onDeck = new Set(isSample ? [] : items.map((i) => i.title.sourceKey))
  const keyOf = resultKey

  async function add(r: SearchResult) {
    const key = keyOf(r)
    setAddStates((s) => ({ ...s, [key]: 'adding' }))
    try {
      await addFromTmdb(r)
      setAddStates((s) => ({ ...s, [key]: 'added' }))
    } catch (err) {
      setAddStates((s) => ({ ...s, [key]: { error: err instanceof Error ? err.message : 'Could not add' } }))
    }
  }

  const showPanel = open && text.trim().length >= 2

  return (
    <div ref={wrapper} className="relative max-w-md flex-1">
      <label className="flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm text-muted focus-within:border-accent">
        {fetching ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Search className="size-4 shrink-0" />}
        <input
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder="Add a movie, show or game…"
          className="w-full bg-transparent text-fg outline-none placeholder:text-faint"
        />
      </label>

      {showPanel && (
        <div className="absolute inset-x-0 top-11 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl shadow-black/40 max-sm:fixed max-sm:inset-x-3 max-sm:top-14">
          {!user ? (
            <p className="px-4 py-5 text-sm text-muted">
              <Link to="/login" onClick={() => setOpen(false)} className="text-accent-ink hover:underline">
                Sign in
              </Link>{' '}
              to search and add titles.
            </p>
          ) : (
            <>
              <ResultSection
                title="Movies & TV"
                q={screen}
                empty={`No movies or shows match “${query}”.`}
                render={(r) => (
                  <ResultRow key={keyOf(r)} result={r} onDeck={onDeck.has(keyOf(r))} state={addStates[keyOf(r)]} onAdd={() => add(r)} />
                )}
              />
              <ResultSection
                title="Games"
                q={games}
                empty={`No PC games match “${query}”.`}
                render={(r) => (
                  <ResultRow key={keyOf(r)} result={r} onDeck={onDeck.has(keyOf(r))} state={addStates[keyOf(r)]} onAdd={() => add(r)} />
                )}
              />
            </>
          )}
          <p className="border-t border-line px-4 py-2 font-mono text-[10px] text-faint">
            Movies &amp; TV from TMDB · games from IGDB · books coming soon
          </p>
        </div>
      )}
    </div>
  )
}
