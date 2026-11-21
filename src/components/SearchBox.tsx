import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowLeft, BookOpen, Check, ChevronRight, Film, Gamepad2, Layers, Loader2, Plus, Search, Star, Tv, X, type LucideIcon } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { resultKey, searchBooks, searchGames, searchTmdb, useAddFromTmdb, useItems, type SearchResult } from '../lib/library'

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
  { value: 'all', label: 'All', icon: Layers, placeholder: 'Search movies, TV, games and books…' },
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

const typeIcon = (t: SearchResult['mediaType']): LucideIcon =>
  t === 'movie' ? Film : t === 'game' ? Gamepad2 : t === 'book' ? BookOpen : Tv
const typeName = (t: SearchResult['mediaType']) => (t === 'movie' ? 'Movie' : t === 'game' ? 'Game' : t === 'book' ? 'Book' : 'TV')

function Cover({ result, className }: { result: SearchResult; className: string }) {
  const Icon = typeIcon(result.mediaType)
  return (
    <div className={clsx('shrink-0 overflow-hidden rounded bg-raised', className)}>
      {result.posterUrl ? (
        <img src={result.posterUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center">
          <Icon className="size-4 text-faint" />
        </div>
      )}
    </div>
  )
}

/** Add / Added button, shared by result rows and the preview. */
function AddButton({ added, state, onAdd, large }: { added: boolean; state?: AddState; onAdd: () => void; large?: boolean }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={added || state === 'adding'}
      className={clsx(
        'flex shrink-0 items-center gap-1 rounded-full font-medium',
        large ? 'h-10 px-5 text-sm' : 'h-8 px-3 text-xs',
        added ? 'text-good' : 'bg-accent text-accent-fg hover:brightness-95 disabled:opacity-60',
      )}
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
  )
}

function ResultRow({
  result,
  onDeck,
  state,
  onAdd,
  onPreview,
}: {
  result: SearchResult
  onDeck: boolean
  state?: AddState
  onAdd: () => void
  onPreview: () => void
}) {
  const TypeIcon = typeIcon(result.mediaType)
  const added = onDeck || state === 'added'
  const credit = result.author ?? result.developer
  return (
    <li className="flex items-center gap-3 px-3 py-2 hover:bg-raised/60">
      {/* Tap the cover or title for a quick synopsis before adding. */}
      <button
        type="button"
        onClick={onPreview}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={`${result.title}: show details`}
      >
        <Cover result={result} className="h-[60px] w-10" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{result.title}</span>
          {/* One line that never wraps: fixed bits keep their size, the credit is cut short. */}
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden font-mono text-xs whitespace-nowrap text-muted">
            <TypeIcon className="size-3 shrink-0" />
            <span className="shrink-0">{typeName(result.mediaType)}</span>
            {result.year && <span className="shrink-0 text-faint">· {result.year}</span>}
            {result.rating != null && <span className="shrink-0 text-faint">· ★ {result.rating.toFixed(1)}</span>}
            {credit && <span className="min-w-0 truncate text-faint">· {credit}</span>}
          </span>
          {typeof state === 'object' && <span className="block truncate text-xs text-bad">{state.error}</span>}
        </span>
        <ChevronRight className="size-4 shrink-0 text-faint max-sm:hidden" />
      </button>
      <AddButton added={added} state={state} onAdd={onAdd} />
    </li>
  )
}

/** Short synopsis of a search result, to check it's the right title before adding. */
function Preview({
  result,
  added,
  state,
  libraryId,
  onAdd,
  onBack,
  onOpen,
}: {
  result: SearchResult
  added: boolean
  state?: AddState
  libraryId?: string
  onAdd: () => void
  onBack: () => void
  onOpen: () => void
}) {
  const [more, setMore] = useState(false)
  const credit = result.author ?? result.developer
  const rating =
    result.rating == null
      ? null
      : result.mediaType === 'book'
        ? `★ ${result.rating.toFixed(1)} / 5 on Hardcover`
        : result.mediaType === 'game'
          ? null
          : `★ ${result.rating.toFixed(1)} / 10 on TMDB`
  const overview = result.overview?.trim()
  const long = (overview?.length ?? 0) > 420
  return (
    <div className="p-4">
      <button type="button" onClick={onBack} className="mb-3 flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Results
      </button>
      <div className="flex gap-4">
        <Cover result={result} className="h-36 w-24 rounded-md" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-base leading-snug font-semibold text-fg">{result.title}</p>
          <p className="font-mono text-xs text-muted">
            {[typeName(result.mediaType), result.year, result.pages ? `${result.pages} pages` : null].filter(Boolean).join(' · ')}
          </p>
          {credit && <p className="text-sm text-muted">{result.mediaType === 'book' ? 'by ' : ''}{credit}</p>}
          {result.series && <p className="text-xs text-faint">{result.series}</p>}
          {rating && (
            <p className="flex items-center gap-1 font-mono text-xs text-faint">
              <Star className="size-3" /> {rating.replace('★ ', '')}
            </p>
          )}
        </div>
      </div>
      {overview ? (
        <div className="mt-4">
          <p className={clsx('text-sm leading-relaxed whitespace-pre-line text-fg/90', !more && long && 'line-clamp-6')}>{overview}</p>
          {long && (
            <button type="button" onClick={() => setMore((m) => !m)} className="mt-1 text-xs text-accent-ink hover:underline">
              {more ? 'Less' : 'More'}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-faint">No synopsis available.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {libraryId ? (
          <Link
            to={`/title/${libraryId}`}
            onClick={onOpen}
            className="flex h-10 items-center gap-1.5 rounded-full border border-line px-5 text-sm text-fg hover:border-accent"
          >
            <Check className="size-4 text-good" /> In your library — open
          </Link>
        ) : (
          <AddButton added={added} state={state} onAdd={onAdd} large />
        )}
        {typeof state === 'object' && <p className="text-xs text-bad">{state.error}</p>}
      </div>
    </div>
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
  const [preview, setPreview] = useState<SearchResult | null>(null)
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
  const books = useQuery({
    queryKey: ['hardcover-search', query],
    queryFn: () => searchBooks(query),
    enabled: ready && (type === 'book' || type === 'all'),
    staleTime: 10 * 60_000,
  })
  const fetching = screen.isFetching || games.isFetching || books.isFetching
  const current = SEARCH_TYPES.find((t) => t.value === type)!

  const close = () => {
    setOpen(false)
    setPreview(null)
    input.current?.blur()
  }

  // Close on a click / tap outside, and whenever you go to another page.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) {
        setOpen(false)
        setPreview(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])
  useEffect(() => {
    setOpen(false)
    setPreview(null)
  }, [pathname])
  // A new search goes back to the results.
  useEffect(() => setPreview(null), [query, type])

  const onDeck = new Set(isSample ? [] : items.map((i) => i.title.sourceKey))
  const libraryIdOf = new Map(isSample ? [] : items.map((i) => [i.title.sourceKey, i.title.id]))
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
    <ResultRow
      key={keyOf(r)}
      result={r}
      onDeck={onDeck.has(keyOf(r))}
      state={addStates[keyOf(r)]}
      onAdd={() => add(r)}
      onPreview={() => setPreview(r)}
    />
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
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            if (preview) setPreview(null)
            else close()
          }}
          placeholder={current.placeholder}
          aria-label={current.placeholder.replace('…', '')}
          className="w-full bg-transparent text-fg outline-none placeholder:text-faint"
        />
      </label>

      {/* Phones: dim the page behind the panel; tapping it closes search. */}
      {/* (Rendered on <body>: the top bar's backdrop blur would otherwise trap a fixed element inside the bar.) */}
      {showPanel &&
        createPortal(
          <div className="fixed inset-x-0 top-14 bottom-0 z-10 bg-black/60 sm:hidden" onClick={close} aria-hidden="true" />,
          document.body,
        )}
      {showPanel && (
        <div className="absolute inset-x-0 top-11 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl shadow-black/40 max-sm:fixed max-sm:inset-x-3 max-sm:top-14">
          {/* Type picker + close */}
          <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-surface py-2 pr-2 pl-3">
          <div role="radiogroup" aria-label="Search for" className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
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
            <button
              type="button"
              onClick={close}
              aria-label="Close search"
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-raised hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>

          {!user ? (
            <p className="px-4 py-5 text-sm text-muted">
              <Link to="/login" onClick={() => setOpen(false)} className="text-accent-ink hover:underline">
                Sign in
              </Link>{' '}
              to search and add titles.
            </p>
          ) : preview ? (
            <Preview
              result={preview}
              added={onDeck.has(keyOf(preview)) || addStates[keyOf(preview)] === 'added'}
              state={addStates[keyOf(preview)]}
              libraryId={libraryIdOf.get(keyOf(preview))}
              onAdd={() => add(preview)}
              onBack={() => setPreview(null)}
              onOpen={close}
            />
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
              {(type === 'book' || type === 'all') && (
                <ResultSection title="Books" q={books} empty={`No books match “${query}”.`} render={row} />
              )}
            </>
          )}
          <p className="border-t border-line px-4 py-2 font-mono text-[10px] text-faint">
            {type === 'game'
              ? 'PC games from IGDB'
              : type === 'book'
                ? 'Books from Hardcover'
                : type === 'all'
                  ? 'Movies & TV from TMDB · games from IGDB · books from Hardcover'
                  : 'From TMDB'}
          </p>
        </div>
      )}
    </div>
  )
}
