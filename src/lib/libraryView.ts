import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { MediaType } from '../types'

/**
 * Covers or Progress, remembered per Library page (All, Movies, TV, Games, Books) on this device. Covers until you
 * pick otherwise. The address says it too (`?view=progress` or `?view=covers`), so a bookmark or shared link opens the
 * same view; when the address names one, it wins.
 */
export type LibraryView = 'covers' | 'rows'

const KEY = 'ondeck.libraryView'

function readAll(): Record<string, LibraryView> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function useLibraryView(type: MediaType | null): [LibraryView, (v: LibraryView) => void] {
  const page = type ?? 'all'
  const [saved, setSaved] = useState(readAll)
  const [params, setParams] = useSearchParams()
  const inUrl = params.get('view')
  const set = useCallback(
    (v: LibraryView) => {
      const next = { ...readAll(), [page]: v }
      setSaved(next)
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Private mode or storage off: it still switches, just isn't remembered.
      }
      // Swapping views isn't a place to go Back to, so it replaces the current history entry.
      setParams(
        (p) => {
          const q = new URLSearchParams(p)
          q.set('view', v === 'rows' ? 'progress' : 'covers')
          return q
        },
        { replace: true },
      )
    },
    [page, setParams],
  )
  const view: LibraryView =
    inUrl === 'progress' ? 'rows' : inUrl === 'covers' ? 'covers' : saved[page] === 'rows' ? 'rows' : 'covers'
  return [view, set]
}
