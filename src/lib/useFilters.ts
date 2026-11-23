import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { filtersToParams, parseFilters, type Filters } from './filters'

/**
 * Library filters from the URL, plus a setter that writes them back (each change is a history entry).
 * `smart=<collection id>` (editing a smart collection's rules) survives filter changes.
 */
export function useFilters(): [Filters, (next: Filters) => void] {
  const [params, setParams] = useSearchParams()
  // Parsed once per URL, so pages can memoise work that depends on the filters.
  const filters = useMemo(() => parseFilters(params), [params])
  return [
    filters,
    (next) => {
      const p = filtersToParams(next)
      const smart = params.get('smart')
      if (smart) p.set('smart', smart)
      setParams(p)
    },
  ]
}

/** A smart collection's rules from filters: the Library URL minus grouping and the editing marker. */
export function rulesFrom(f: Filters): string {
  const p = filtersToParams(f)
  p.delete('group')
  p.delete('smart')
  return p.toString()
}
