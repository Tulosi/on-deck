// Search results UI shared by the top-bar dropdown (SearchBox) and the full search page (pages/Search.tsx).
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { ArrowLeft, BookOpen, Check, ChevronRight, Film, Gamepad2, Layers, Loader2, Plus, Sparkles, Star, Tv, type LucideIcon } from 'lucide-react'
import { resultKey, useAddFromTmdb, useItems, type SearchResult } from '../lib/library'
import type { SearchSection, SearchType, useSearch } from '../lib/search'

export type AddState = 'adding' | 'added' | { error: string }

/** What the search looks for. One type at a time keeps results relevant; "All" is there when unsure. */
export const SEARCH_TYPES: { value: SearchType; label: string; icon: LucideIcon; placeholder: string }[] = [
  { value: 'movie', label: 'Movies', icon: Film, placeholder: 'Search movies…' },
  { value: 'tv', label: 'TV', icon: Tv, placeholder: 'Search TV shows…' },
  { value: 'game', label: 'Games', icon: Gamepad2, placeholder: 'Search PC games…' },
  { value: 'book', label: 'Books', icon: BookOpen, placeholder: 'Search books…' },
  { value: 'all', label: 'All', icon: Layers, placeholder: 'Search movies, TV, games and books…' },
]
export const TYPE_KEY = 'ondeck.searchType'
export const isSearchType = (v: unknown): v is SearchType => SEARCH_TYPES.some((t) => t.value === v)

export function savedType(): SearchType {
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

export function Cover({ result, className }: { result: SearchResult; className: string }) {
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
export function AddButton({ added, state, onAdd, large }: { added: boolean; state?: AddState; onAdd: () => void; large?: boolean }) {
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

export function ResultRow({
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
export function Preview({
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


/** Remembers the picked search type (shared by the dropdown and the full page). */
export function saveType(t: SearchType) {
  try {
    localStorage.setItem(TYPE_KEY, t)
  } catch {
    // remembering is optional
  }
}

/** Add-to-library state for search results, plus "already in your library" lookups. */
export function useAdder() {
  const { allItems: items, isSample } = useItems()
  const addFromTmdb = useAddFromTmdb()
  const [addStates, setAddStates] = useState<Record<string, AddState>>({})
  const onDeck = new Set(isSample ? [] : items.map((i) => i.title.sourceKey))
  const libraryIdOf = new Map(isSample ? [] : items.map((i) => [i.title.sourceKey, i.title.id]))
  async function add(r: SearchResult) {
    const key = resultKey(r)
    setAddStates((s) => ({ ...s, [key]: 'adding' }))
    try {
      await addFromTmdb(r)
      setAddStates((s) => ({ ...s, [key]: 'added' }))
    } catch (err) {
      setAddStates((s) => ({ ...s, [key]: { error: err instanceof Error ? err.message : 'Could not add' } }))
    }
  }
  return { addStates, add, onDeck, libraryIdOf }
}

/** One labelled block of results (its own loading / error / empty state). */
function ResultSection({ section, empty, render }: { section: SearchSection; empty: string; render: (r: SearchResult) => ReactNode }) {
  return (
    <section className="border-b border-line last:border-b-0">
      <p className="px-4 pt-3 pb-1 font-mono text-[11px] tracking-wider text-faint uppercase">{section.title}</p>
      {section.error ? (
        <p className="px-4 pb-3 text-sm text-bad">Search failed: {(section.error as Error).message}</p>
      ) : section.isLoading ? (
        <p className="px-4 pb-3 text-sm text-muted">Searching…</p>
      ) : section.results.length === 0 ? (
        <p className="px-4 pb-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line pb-1">{section.results.map(render)}</ul>
      )}
    </section>
  )
}

const EMPTY: Record<SearchSection['key'], string> = { screen: 'movies or shows', games: 'PC games', books: 'books' }

/**
 * Everything under the search box: a note when a year is ranked first, "Did you mean …?", each source's
 * results, and near matches when the search came back thin.
 */
export function SearchResultsBody({
  s,
  row,
  onSuggest,
}: {
  s: ReturnType<typeof useSearch>
  row: (r: SearchResult) => ReactNode
  /** Search again for a suggested title. */
  onSuggest: (title: string) => void
}) {
  return (
    <>
      {s.year && (
        <p className="border-b border-line px-4 py-2 text-xs text-muted">
          Showing <b className="text-fg">{s.year}</b> first for “{s.text}”.
        </p>
      )}
      {s.didYouMean && (
        <p className="border-b border-line px-4 py-2 text-sm text-muted">
          Did you mean{' '}
          <button type="button" onClick={() => onSuggest(s.didYouMean!)} className="font-medium text-accent-ink hover:underline">
            {s.didYouMean}
          </button>
          ?
        </p>
      )}
      {s.sections.map((sec) => (
        <ResultSection key={sec.key} section={sec} empty={`No ${EMPTY[sec.key]} match “${s.text}”.`} render={row} />
      ))}
      {(s.near.length > 0 || s.nearLoading) && (
        <section className="border-t border-line">
          <p className="flex items-center gap-1.5 px-4 pt-3 pb-1 font-mono text-[11px] tracking-wider text-faint uppercase">
            <Sparkles className="size-3" /> Close matches
          </p>
          {s.nearLoading ? (
            <p className="px-4 pb-3 text-sm text-muted">Looking for close spellings…</p>
          ) : (
            <ul className="divide-y divide-line pb-1">{s.near.map(row)}</ul>
          )}
        </section>
      )}
    </>
  )
}
