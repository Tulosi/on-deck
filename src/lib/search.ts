// Search shared by the top-bar dropdown and the full search page (docs/ROADMAP.md → Group D).
//  - A year in the query ("dresden files 2026") is searched without the year, and that year's results rank first.
//  - Few results → a looser search (words trimmed, so typos at the end of words still match) supplies near matches,
//    ranked by how similar their titles are, and a "Did you mean …?" suggestion.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './auth'
import { resultKey, searchBooks, searchGames, searchTmdb, type SearchResult } from './library'

export type SearchType = 'movie' | 'tv' | 'game' | 'book' | 'all'

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** "dresden files 2026" → { text: "dresden files", year: 2026 }. A query that's only a year stays as text ("2012"). */
export function parseQuery(raw: string): { text: string; year: number | null } {
  const q = raw.trim()
  // Only realistic years count (1900 → five years from now), so "Blade Runner 2049" keeps its title.
  const maxYear = new Date().getFullYear() + 5
  const m = [...q.matchAll(/\b(19\d{2}|20\d{2})\b/g)].filter((x) => Number(x[0]) <= maxYear).pop()
  if (!m) return { text: q, year: null }
  const text = (q.slice(0, m.index) + q.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').trim()
  return text.length >= 2 ? { text, year: Number(m[0]) } : { text: q, year: null }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/**
 * 0–1: how close a title is to what was typed. Compares against the whole title and against its start (so
 * "intersteller" ≈ "Interstellar" and "dresdn files" ≈ "The Dresden Files: Storm Front").
 */
export function similarity(query: string, title: string): number {
  const q = norm(query)
  const t = norm(title).replace(/^the /, '')
  if (!q || !t) return 0
  const whole = 1 - levenshtein(q, t) / Math.max(q.length, t.length)
  const head = t.slice(0, q.length)
  const start = 1 - levenshtein(q, head) / Math.max(q.length, head.length)
  return Math.max(whole, start * 0.95)
}

/** Each longer word trimmed to its first ~60%, so a typo near the end of a word still finds it. */
export function loosen(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => (w.length > 4 ? w.slice(0, Math.max(4, Math.ceil(w.length * 0.6))) : w))
    .join(' ')
}

/** That year first, then a year either side, then the rest (each group keeps the source's order). */
function rankByYear(results: SearchResult[], year: number | null): SearchResult[] {
  if (!year) return results
  const score = (r: SearchResult) => (r.year === year ? 0 : r.year != null && Math.abs(r.year - year) === 1 ? 1 : 2)
  return results.map((r, i) => ({ r, i })).sort((a, b) => score(a.r) - score(b.r) || a.i - b.i).map((x) => x.r)
}

export interface SearchSection {
  key: 'screen' | 'games' | 'books'
  title: string
  results: SearchResult[]
  isLoading: boolean
  error: unknown
}

const STALE = 10 * 60_000

/**
 * Runs the search for one type (or all). `limit` per source: 12 in the dropdown, up to 40 on the full page.
 * Returns ranked sections, near matches (only when there are few results), and a "Did you mean" title.
 */
export function useSearch(rawQuery: string, type: SearchType, limit = 12) {
  const { user } = useAuth()
  const { text, year } = parseQuery(rawQuery)
  const ready = !!user && text.length >= 2
  const screenType = type === 'movie' || type === 'tv' ? type : undefined
  const wantScreen = type === 'movie' || type === 'tv' || type === 'all'
  const wantGames = type === 'game' || type === 'all'
  const wantBooks = type === 'book' || type === 'all'

  const screen = useQuery({
    queryKey: ['tmdb-search', text, screenType ?? 'both', limit],
    queryFn: () => searchTmdb(text, screenType, limit),
    enabled: ready && wantScreen,
    staleTime: STALE,
  })
  const games = useQuery({
    queryKey: ['igdb-search', text, limit],
    queryFn: () => searchGames(text, limit),
    enabled: ready && wantGames,
    staleTime: STALE,
  })
  const books = useQuery({
    queryKey: ['hardcover-search', text, limit],
    queryFn: () => searchBooks(text, limit),
    enabled: ready && wantBooks,
    staleTime: STALE,
  })

  const sections: SearchSection[] = []
  if (wantScreen)
    sections.push({
      key: 'screen',
      title: type === 'movie' ? 'Movies' : type === 'tv' ? 'TV shows' : 'Movies & TV',
      results: rankByYear(screen.data ?? [], year),
      isLoading: screen.isLoading,
      error: screen.error,
    })
  if (wantGames) sections.push({ key: 'games', title: 'Games', results: rankByYear(games.data ?? [], year), isLoading: games.isLoading, error: games.error })
  if (wantBooks) sections.push({ key: 'books', title: 'Books', results: rankByYear(books.data ?? [], year), isLoading: books.isLoading, error: books.error })

  // ── Near matches: only when the real search came back thin ──
  const loaded = sections.every((s) => !s.isLoading)
  const total = sections.reduce((n, s) => n + s.results.length, 0)
  const loose = loosen(text)
  const needLoose = ready && loaded && total < 3 && text.length >= 4 && loose !== text
  const looseScreen = useQuery({
    queryKey: ['tmdb-search', loose, screenType ?? 'both', 20],
    queryFn: () => searchTmdb(loose, screenType, 20),
    enabled: needLoose && wantScreen,
    staleTime: STALE,
  })
  // Games: IGDB needs whole words, so its near matches come from a "name contains" lookup on the typed text.
  const looseGames = useQuery({
    queryKey: ['igdb-fuzzy', text, 20],
    queryFn: () => searchGames(text, 20, true),
    enabled: needLoose && wantGames,
    staleTime: STALE,
  })
  const looseBooks = useQuery({
    queryKey: ['hardcover-search', loose, 20],
    queryFn: () => searchBooks(loose, 20),
    enabled: needLoose && wantBooks,
    staleTime: STALE,
  })
  const seen = new Set(sections.flatMap((s) => s.results.map(resultKey)))
  const near = needLoose
    ? [...(looseScreen.data ?? []), ...(looseGames.data ?? []), ...(looseBooks.data ?? [])]
        .filter((r) => !seen.has(resultKey(r)))
        .map((r) => ({ r, s: similarity(text, r.title) }))
        .filter((x) => x.s >= 0.6)
        .sort((a, b) => b.s - a.s)
        .slice(0, 6)
    : []
  const didYouMean = near[0] && near[0].s >= 0.6 ? near[0].r.title : null

  const fetching =
    screen.isFetching || games.isFetching || books.isFetching || looseScreen.isFetching || looseGames.isFetching || looseBooks.isFetching
  return {
    text,
    year,
    ready,
    sections,
    near: near.map((x) => x.r),
    didYouMean,
    nearLoading: needLoose && (looseScreen.isLoading || looseGames.isLoading || looseBooks.isLoading),
    fetching,
    total,
  }
}
