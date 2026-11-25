import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Loader2, Maximize2, Search, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { resultKey, type SearchResult } from '../lib/library'
import { useDebounced, useSearch, type SearchType } from '../lib/search'
import { isSearchType, Preview, ResultRow, SampleSearch, SEARCH_TYPES, saveType, savedType, SearchResultsBody, useAdder } from './SearchResults'

/** Full search page URL for a query and type. */
export const fullSearchHref = (q: string, type: SearchType) =>
  `/search?q=${encodeURIComponent(q)}${type !== 'all' ? `&type=${type}` : ''}`

/**
 * Top-bar search with a type picker (Movies · TV · Games · Books · All). Only the chosen type's source is
 * searched: TMDB for movies / TV, IGDB for PC games, Hardcover for books. The type follows the Library page
 * page you're on (?type=), else your last choice. "Open full results" (or Enter) goes to the full search page.
 */
export function SearchBox() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<SearchResult | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const query = useDebounced(text.trim(), 300)
  const input = useRef<HTMLInputElement>(null)
  const { addStates, add, onDeck, libraryIdOf } = useAdder()

  // Type: the page's type filter when it has one (Home, Library and Calendar use ?type=; no ?type there means All
  // types, so search covers everything too), otherwise your last pick.
  const { pathname, search } = useLocation()
  const filterPage = pathname === '/' || pathname === '/library' || pathname === '/calendar'
  const pageType = new URLSearchParams(search).get('type') ?? (filterPage ? 'all' : null)
  const [type, setTypeState] = useState<SearchType>(() => (isSearchType(pageType) ? pageType : savedType()))
  // Moving to a page with a different type switches to it, set during render so there's no frame with the old one.
  const [seenPageType, setSeenPageType] = useState(pageType)
  if (pageType !== seenPageType) {
    setSeenPageType(pageType)
    if (isSearchType(pageType)) setTypeState(pageType)
  }
  const setType = (t: SearchType) => {
    setTypeState(t)
    saveType(t)
    input.current?.focus()
  }

  const s = useSearch(query, type, 12)
  const current = SEARCH_TYPES.find((t) => t.value === type)!

  const close = () => {
    setOpen(false)
    setPreview(null)
    input.current?.blur()
  }
  const openFull = () => {
    if (text.trim().length < 2) return
    close()
    navigate(fullSearchHref(text.trim(), type))
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
  // "/" or ⌘K / Ctrl+K from anywhere jumps to search (not while you're typing in another field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      const cmdK = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey
      const slash = e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey
      if (!cmdK && !slash) return
      if (document.querySelector('[aria-modal="true"]')) return // a dialog is open
      e.preventDefault()
      input.current?.focus()
      input.current?.select()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  // A new search goes back to the results.
  useEffect(() => setPreview(null), [query, type])

  const hasQuery = text.trim().length >= 2
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

  return (
    <div
      ref={wrapper}
      className="relative max-w-md flex-1"
      // Focus moving elsewhere (Tab past the end, a shortcut opening a dialog) closes the results; the text stays.
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false)
          setPreview(null)
        }
      }}
    >
      <label className="flex h-11 items-center gap-2 rounded-md sm:h-9 border border-line bg-surface px-3 text-sm text-muted focus-within:border-accent">
        {s.fetching ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Search className="size-4 shrink-0" />}
        <input
          name="q"
          autoComplete="off"
          ref={input}
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              openFull()
              return
            }
            if (e.key !== 'Escape') return
            if (preview) setPreview(null)
            else close()
          }}
          placeholder={current.placeholder}
          aria-label={current.placeholder.replace('…', '')}
          enterKeyHint="search"
          aria-keyshortcuts="/ Meta+K Control+K"
          className="field-bare w-full bg-transparent text-fg outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:appearance-none"
        />
        {text && (
          <button
            type="button"
            onClick={() => {
              setText('')
              input.current?.focus()
            }}
            aria-label="Clear search"
            className="hit shrink-0 text-muted hover:text-fg"
          >
            <X className="size-4" />
          </button>
        )}
        {/* Keyboard hint, only with a mouse/trackpad and while the box is empty and unfocused. */}
        {!text && !open && (
          <kbd className="hidden shrink-0 rounded border border-line px-1.5 font-mono text-[11px] text-faint pointer-fine:sm:block">
            /
          </kbd>
        )}
      </label>

      {/* Phones: dim the page behind the panel; tapping it closes search. */}
      {/* (Rendered on <body>: the top bar's backdrop blur would otherwise trap a fixed element inside the bar.) */}
      {open &&
        createPortal(
          <div className="fixed inset-x-0 top-14 bottom-0 z-10 bg-black/60 sm:hidden" onClick={close} aria-hidden="true" />,
          document.body,
        )}
      {open && (
        <div className="absolute inset-x-0 top-11 z-40 max-h-[70vh] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface shadow-2xl shadow-black/40 max-sm:fixed max-sm:inset-x-3 max-sm:top-14">
          {/* Type picker + close */}
          <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-surface py-2 pr-2 pl-3">
            <div role="radiogroup" aria-label="Search for" className="flex min-w-0 flex-1 gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
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
                      // The quiet raised selection, as on the full search page and the type pills.
                      'flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors sm:px-3',
                      active ? 'border-line bg-raised font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
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
            <SampleSearch text={text} type={type} onOpen={close} onAll={() => setType('all')} />
          ) : preview ? (
            <Preview
              result={preview}
              added={onDeck.has(resultKey(preview)) || addStates[resultKey(preview)] === 'added'}
              state={addStates[resultKey(preview)]}
              libraryId={libraryIdOf.get(resultKey(preview))}
              onAdd={() => add(preview)}
              onBack={() => setPreview(null)}
              onOpen={close}
            />
          ) : !hasQuery ? (
            <p className="px-4 py-4 text-sm text-faint">
              Type a title to search {current.label === 'All' ? 'everything' : current.label.toLowerCase()}. Add a year
              (“dune 2021”) to see that year first.
            </p>
          ) : (
            <SearchResultsBody s={s} row={row} onSuggest={(t) => setText(t)} onAll={type !== 'all' ? () => setType('all') : undefined} />
          )}

          {user && (
          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-surface px-4 py-2">
            <p className="text-xs text-faint">
              {type === 'game'
                ? 'PC games from IGDB'
                : type === 'book'
                  ? 'Books from Hardcover'
                  : type === 'all'
                    ? 'From TMDB, IGDB and Hardcover'
                    : 'From TMDB'}
            </p>
            {user && hasQuery && !preview && (
              <button type="button" onClick={openFull} className="flex items-center gap-1.5 text-xs text-accent-ink hover:underline">
                <Maximize2 className="size-3.5" /> Open full results
              </button>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  )
}
