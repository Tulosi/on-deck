import { useCallback, useState } from 'react'
import type { MediaType } from '../types'

/**
 * Covers or Progress, remembered per Library page (All, Movies, TV, Games, Books) on this device. Covers until you
 * pick otherwise.
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
  const set = useCallback(
    (v: LibraryView) => {
      const next = { ...readAll(), [page]: v }
      setSaved(next)
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Private mode or storage off: it still switches, just isn't remembered.
      }
    },
    [page],
  )
  return [saved[page] === 'rows' ? 'rows' : 'covers', set]
}
