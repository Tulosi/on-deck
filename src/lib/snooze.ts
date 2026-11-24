import { useState } from 'react'
import { undoable } from './toast'

const DAY = 86_400_000

type Until = Record<string, number>

function read(key: string): Until {
  try {
    const all = JSON.parse(localStorage.getItem(key) ?? '{}') as Until
    // Drop the ones whose time is up, so the list doesn't grow forever.
    return Object.fromEntries(Object.entries(all).filter(([, t]) => typeof t === 'number' && t > Date.now()))
  } catch {
    return {}
  }
}

/**
 * Titles put away from one Home row for a while, on this device. `hidden(id)` is true until that title's time runs
 * out; `snooze(id, name)` hides it now, with an Undo toast.
 */
export function useSnoozed(row: string, days: number) {
  const key = `ondeck.snooze.${row}`
  const [until, setUntil] = useState<Until>(() => read(key))
  const hidden = (id: string) => (until[id] ?? 0) > Date.now()
  const snooze = (id: string, name: string) => {
    const t = Date.now() + days * DAY
    undoable({
      message: `${name} won’t show here for a month`,
      hide: () => setUntil((u) => ({ ...u, [id]: t })),
      commit: async () => {
        try {
          localStorage.setItem(key, JSON.stringify({ ...read(key), [id]: t }))
        } catch {
          // Storage blocked: it stays hidden until the page reloads.
        }
      },
      restore: () =>
        setUntil((u) => {
          const { [id]: _, ...rest } = u
          return rest
        }),
    })
  }
  return { hidden, snooze }
}
