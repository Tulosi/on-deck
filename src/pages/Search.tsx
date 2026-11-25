import { useEffect, useRef, useState } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { useDialog } from '../lib/useDialog'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Loader2, Search as SearchIcon, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { isSearchType, Preview, ResultRow, SampleSearch, SEARCH_TYPES, saveType, SearchResultsBody, useAdder } from '../components/SearchResults'
import { useAuth } from '../lib/auth'
import { resultKey, type SearchResult } from '../lib/library'
import { useDebounced, useSearch, type SearchType } from '../lib/search'

/** Full search page (/search?q=…&type=…): more results per source, near matches and year ranking. */
export function SearchPage() {
  const { user, loading } = useAuth()
  const [params, setParams] = useSearchParams()
  const urlType = params.get('type')
  // No ?type= means All types, so a shared link always shows the same thing.
  const type: SearchType = isSearchType(urlType) ? urlType : 'all'
  const [text, setText] = useState(params.get('q') ?? '')
  usePageTitle(params.get('q') ? `Search: ${params.get('q')}` : 'Search')
  const query = useDebounced(text.trim(), 350)
  const [preview, setPreview] = useState<SearchResult | null>(null)
  const previewPanel = useDialog<HTMLDivElement>(!!preview, () => setPreview(null))
  const { addStates, add, onDeck, libraryIdOf } = useAdder()
  const s = useSearch(query, type, 40)
  // "/" or ⌘K / Ctrl+K: this page's box (the top bar doesn't show its own here).
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      const cmdK = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey
      const slash = e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey
      if ((!cmdK && !slash) || document.querySelector('[aria-modal="true"]')) return
      e.preventDefault()
      box.current?.focus()
      box.current?.select()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Keep the URL in step (replace, so typing doesn't flood the back button).
  useEffect(() => {
    const next = new URLSearchParams()
    if (query) next.set('q', query)
    if (type !== 'all') next.set('type', type)
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
    if (t === 'all') next.delete('type')
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

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Search" meta={s.ready && !s.fetching ? `${s.total} result${s.total === 1 ? '' : 's'}` : undefined} />

      <label className="flex h-12 items-center gap-3 rounded-md border border-line bg-surface px-4 text-muted focus-within:border-accent">
        {s.fetching ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <SearchIcon className="size-5 shrink-0" />}
        <input
          ref={box}
          name="q"
          autoComplete="off"
          // Focus straight away with a mouse/trackpad; on phones it would pop the keyboard over the page.
          autoFocus={typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={current.placeholder}
          aria-label={current.placeholder.replace('…', '')}
          enterKeyHint="search"
          className="field-bare w-full bg-transparent text-base text-fg outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:appearance-none"
        />
        {text && (
          <button type="button" onClick={() => {
              setText('')
              box.current?.focus()
            }} aria-label="Clear search" className="hit text-muted hover:text-fg">
            <X className="size-4" />
          </button>
        )}
      </label>

      <div role="radiogroup" aria-label="Search for" className="mt-3 flex gap-1 sm:flex-wrap sm:gap-1.5">
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
                // Phones: the five share the width (no icons), so none is cut off at the edge.
                'flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors max-sm:min-w-0 max-sm:flex-1 sm:h-8 sm:px-3',
                active ? 'border-line bg-raised text-fg' : 'border-transparent text-muted hover:text-fg',
              )}
            >
              <Icon className="size-3.5 max-sm:hidden" />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
        {!loading && !user ? (
          <SampleSearch text={text} type={type} onAll={() => setType('all')} />
        ) : s.text.length < 2 ? (
          <p className="px-4 py-6 text-sm text-faint">
            Type a title. Typos are OK, since close spellings are suggested. Add a year (“dresden files 2026”) to see
            that year first.
          </p>
        ) : (
          <SearchResultsBody s={s} row={row} onSuggest={(t) => setText(t)} onAll={type !== 'all' ? () => setType('all') : undefined} />
        )}
      </div>

      {preview &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={preview.title}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setPreview(null)} aria-hidden="true" />
            <div ref={previewPanel} tabIndex={-1} className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface shadow-2xl outline-none">
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
