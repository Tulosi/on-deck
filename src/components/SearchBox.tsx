import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { BookOpen, Check, Film, Gamepad2, Layers, Loader2, Plus, Search, Tv, type LucideIcon } from 'lucide-react'
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

/** What the search looks for. One type at a time keeps results relevant; "All" is there when unsure. */
type SearchType = 'movie' | 'tv' | 'game' | 'book' | 'all'
const SEARCH_TYPES: { value: SearchType; label: string; icon: LucideIcon; placeholder: string }[] = [
  { value: 'movie', label: 'Movies', icon: Film, placeholder: 'Search movies…' },
  { value: 'tv', label: 'TV', icon: Tv, placeholder: 'Search TV shows…' },
  { value: 'game', label: 'Games', icon: Gamepad2, placeholder: 'Search PC games…' },
  { value: 'book', label: 'Books', icon: BookOpen, placeholder: 'Search books…' },
  { value: 'all', label: 'All', icon: Layers, placeholder: 'Search movies, TV and games…' },
]
const TYPE_KEY = 'ondeck.searchType'
const isSearchType = (v: unknown): v is SearchType => SEARCH_TYPES.some((t) => t.value === v)

function savedType(): SearchType {
  try {
    const v = localStorage.getItem(TYPE_KEY)
    return isSearchType(v) ? v : 'movie'
  } catch {
    return 'movie'
  }
}

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
        {added ? 'Added' : 'Add'}
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

/**
 * Top-bar search with a type picker (Movies · TV · Games · Books · All). Only the chosen type's source is
 * searched: TMDB for movies / TV, IGDB for PC games. The type follows the Library page you're on, else your
 * last choice.
 */
export function SearchBox() {
  const { user } = useAuth()
  const { items, isSample } = useItems()
  const addFromTmdb = useAddFromTmdb()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [addStates, setAddStates] = useState<Record<string, AddState>>({})
  const wrapper = useRef<HTMLDivElement>(null)
  const query = useDebounced(text.trim(), 300)
  const input = useRef<HTMLInputElement>(null)

  // Type: the Library's type when you're browsing one, otherwise your last pick.
  const { pathname, search } = useLocation()
  const pageType = pathname === '/library' ? new URLSearchParams(search).get('type') : null
  const [type, setTypeState] = useState<SearchType>(savedType)
  useEffect(() => {
    if (isSearchType(pageType)) setTypeState(pageType)
  }, [pageType])
  const setType = (t: SearchType) => {
    setTypeState(t)
    try {
      localStorage.setItem(TYPE_KEY, t)
    } catch {
      // remembering is optional
    }
    input.current?.focus()
  }

  const ready = !!user && query.length >= 2
  const screenType = type === 'movie' || type === 'tv' ? type : undefined
  const screen = useQuery({
    queryKey: ['tmdb-search', query, screenType ?? 'both'],
    queryFn: () => searchTmdb(query, screenType),
    enabled: ready && (type === 'movie' || type === 'tv' || type === 'all'),
    staleTime: 10 * 60_000,
  })
  const games = useQuery({
    queryKey: ['igdb-search', query],
    queryFn: () => searchGames(query),
    enabled: ready && (type === 'game' || type === 'all'),
    staleTime: 10 * 60_000,
  })
  const fetching = screen.isFetching || games.isFetching
  const current = SEARCH_TYPES.find((t) => t.value === type)!

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

  const hasQuery = text.trim().length >= 2
  const showPanel = open
  const row = (r: SearchResult) => (
    <ResultRow key={keyOf(r)} result={r} onDeck={onDeck.has(keyOf(r))} state={addStates[keyOf(r)]} onAdd={() => add(r)} />
  )

  return (
    <div ref={wrapper} className="relative max-w-md flex-1">
      <label className="flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm text-muted focus-within:border-accent">
        {fetching ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Search className="size-4 shrink-0" />}
        <input
          ref={input}
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder={current.placeholder}
          aria-label={current.placeholder.replace('…', '')}
          className="w-full bg-transparent text-fg outline-none placeholder:text-faint"
        />
      </label>

      {showPanel && (
        <div className="absolute inset-x-0 top-11 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl shadow-black/40 max-sm:fixed max-sm:inset-x-3 max-sm:top-14">
          {/* Type picker */}
          <div role="radiogroup" aria-label="Search for" className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 [scrollbar-width:none]">
            {SEARCH_TYPES.map((t) => {
              const Icon = t.icon
              const active = t.value === type
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setType(t.value)}
                  className={clsx(
                    'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors sm:px-3',
                    active ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted hover:text-fg',
                  )}
                >
                  <Icon className="size-3.5 max-sm:hidden" />
                  {t.label}
                </button>
              )
            })}
          </div>

          {!user ? (
            <p className="px-4 py-5 text-sm text-muted">
              <Link to="/login" onClick={() => setOpen(false)} className="text-accent-ink hover:underline">
                Sign in
              </Link>{' '}
              to search and add titles.
            </p>
          ) : type === 'book' ? (
            <p className="px-4 py-5 text-sm text-muted">Books are coming soon. For now you can add movies, TV and games.</p>
          ) : !hasQuery ? (
            <p className="px-4 py-4 text-sm text-faint">Type a title to search {current.label === 'All' ? 'everything' : current.label.toLowerCase()}.</p>
          ) : (
            <>
              {(type === 'movie' || type === 'tv' || type === 'all') && (
                <ResultSection
                  title={type === 'movie' ? 'Movies' : type === 'tv' ? 'TV shows' : 'Movies & TV'}
                  q={screen}
                  empty={`No ${type === 'movie' ? 'movies' : type === 'tv' ? 'shows' : 'movies or shows'} match “${query}”.`}
                  render={row}
                />
              )}
              {(type === 'game' || type === 'all') && (
                <ResultSection title="Games" q={games} empty={`No PC games match “${query}”.`} render={row} />
              )}
            </>
          )}
          <p className="border-t border-line px-4 py-2 font-mono text-[10px] text-faint">
            {type === 'game' ? 'PC games from IGDB' : type === 'all' ? 'Movies & TV from TMDB · games from IGDB' : type === 'book' ? 'Books coming soon' : 'From TMDB'}
          </p>
        </div>
      )}
    </div>
  )
}
