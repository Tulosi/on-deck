import { useSearchParams } from 'react-router-dom'
import { filtersToParams, parseFilters, type Filters } from './filters'

/** Library filters from the URL, plus a setter that writes them back (each change is a history entry). */
export function useFilters(): [Filters, (next: Filters) => void] {
  const [params, setParams] = useSearchParams()
  const filters = parseFilters(params)
  return [filters, (next) => setParams(filtersToParams(next))]
}
