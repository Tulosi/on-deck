import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** How long a removed entry stays to animate out (matches `.leave-x` / `.leave-y` in index.css). */
export const LEAVE_MS = 240

export interface Shown<T> {
  item: T
  key: string
  leaving: boolean
}

/**
 * Keeps entries that just left `list` on screen for LEAVE_MS, flagged `leaving`, at the place they had, so they
 * can shrink away while the rest close the gap. Entries that come back while leaving simply stay.
 */
export function useLeaving<T>(list: T[], keyOf: (item: T) => string): Shown<T>[] {
  const prev = useRef<T[]>(list)
  const [leaving, setLeaving] = useState<{ item: T; key: string; index: number }[]>([])
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useLayoutEffect(() => {
    const now = new Set(list.map(keyOf))
    const gone = prev.current
      .map((item, index) => ({ item, key: keyOf(item), index }))
      .filter((e) => !now.has(e.key))
    prev.current = list
    if (gone.length === 0) return
    setLeaving((cur) => [...cur.filter((c) => !now.has(c.key) && !gone.some((g) => g.key === c.key)), ...gone])
    const keys = new Set(gone.map((g) => g.key))
    // Not cleared when the list changes again: the parent re-renders often, and the entry must still go.
    timers.current.push(window.setTimeout(() => setLeaving((cur) => cur.filter((c) => !keys.has(c.key))), LEAVE_MS))
    // keyOf is expected to be stable in meaning; only the list drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list])

  const shown: Shown<T>[] = list.map((item) => ({ item, key: keyOf(item), leaving: false }))
  const present = new Set(shown.map((s) => s.key))
  for (const l of [...leaving].sort((a, b) => a.index - b.index)) {
    if (present.has(l.key)) continue
    shown.splice(Math.min(l.index, shown.length), 0, { item: l.item, key: l.key, leaving: true })
  }
  return shown
}
