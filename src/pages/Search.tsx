import { useEffect, useState } from 'react'
import { useDialog } from '../lib/useDialog'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Loader2, Search as SearchIcon, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { isSearchType, Preview, ResultRow, SEARCH_TYPES, saveType, savedType, SearchResultsBody, useAdder } from '../components/SearchResults'
import { useAuth } from '../lib/auth'
import { resultKey, type SearchResult } from '../lib/library'
import { useDebounced, useSearch, type SearchType } from '../lib/search'

/** Full search page (/search?q=…&type=…): more results per source, near matches and year ranking. */
export function SearchPage() {
  const { user, loading } = useAuth()
  const [params, setParams] = useSearchParams()
  const urlType = params.get('type')
  const type: SearchType = isSearchType(urlType) ? urlType : savedType()
  const [text, setText] = useState(params.get('q') ?? '')
  const query = useDebounced(text.trim(), 350)
  const [preview, setPreview] = useState<SearchResult | null>(null)
  const previewPanel = useDialog<HTMLDivElement>(!!preview, () => setPreview(null))
  const { addStates, add, onDeck, libraryIdOf } = useAdder()
  const s = useSearch(query, type, 40)

  // Keep the URL in step (replace, so typing doesn't flood the back button).
  useEffect(() => {
    const next = new URLSearchParams()
    if (query) next.set('q', query)
    if (type !== 'movie') next.set('type', type)
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, type])
  // Arriving with a new ?q= (e.g. from the top bar) updates the box.
  useEffect(() => {
    const q = params.get('q') ?? ''
    if (q && q !== query) setText(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('q')])

  const setType = (t: SearchType) => {
    saveType(t)
    const next = new URLSearchParams(params)
    if (t === 'movie') next.delete('type')
    else next.set('type', t)
    setParams(next, { replace: true })
  }

  const row = (r: SearchResult) => (
    <ResultRow
      key={resultKey(r)}
      result={r}
      onDeck={onDeck.has(resultKey(r))}
      state={addStates[resultKey(r)]}
      onAdd={() => add(r)}
      onPreview={() => setPreview(r)}
    />
  )
  const current = SEARCH_TYPES.find((t) => t.value === type)!

  if (!loading && !user) {
    return (
      <div>
        <PageHeader title="Search" />
        <p className="py-16 text-center text-sm text-muted">
          <Link to="/login" className="text-accent-ink hover:underline">
            Sign in
          </Link>{' '}
          to search and add titles.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Search" meta={s.ready && !s.fetching ? `${s.total} result${s.total === 1 ? '' : 's'}` : undefined} />

      <label className="flex h-12 items-center gap-3 rounded-xl border border-line bg-surface px-4 text-muted focus-within:border-accent">
        {s.fetching ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <SearchIcon className="size-5 shrink-0" />}
        <input
          autoFocus
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={current.placeholder}
          aria-label={current.placeholder.replace('…', '')}
          enterKeyHint="search"
          className="w-full bg-transparent text-base text-fg outline-none placeholder:text-faint"
        />
        {text && (
          <button type="button" onClick={() => setText('')} aria-label="Clear search" className="text-muted hover:text-fg">
            <X className="size-4" />
          </button>
        )}
      </label>

      <div role="radiogroup" aria-label="Search for" className="mt-3 flex flex-wrap gap-1.5">
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
                'flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                active ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted hover:text-fg',
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
        {s.text.length < 2 ? (
          <p className="px-4 py-6 text-sm text-faint">
            Type a title. Typos are OK, since close spellings are suggested. Add a year (“dresden files 2026”) to see
            that year first.
          </p>
        ) : (
          <SearchResultsBody s={s} row={row} onSuggest={(t) => setText(t)} />
        )}
      </div>

      {preview &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={preview.title}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setPreview(null)} />
            <div ref={previewPanel} tabIndex={-1} className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl outline-none">
              <Preview
                result={preview}
                added={onDeck.has(resultKey(preview)) || addStates[resultKey(preview)] === 'added'}
                state={addStates[resultKey(preview)]}
                libraryId={libraryIdOf.get(resultKey(preview))}
                onAdd={() => add(preview)}
                onBack={() => setPreview(null)}
                onOpen={() => setPreview(null)}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
