import { useState } from 'react'
import { useAuth } from './auth'
import { useUpdateItem } from './library'
import { undoable } from './toast'
import type { UserItem } from '../types'

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
 * Titles put away from Home's "Pick it back up?" row for a while. `hidden(item)` is true until that title's time runs
 * out; `snooze(item)` hides it now, with an Undo toast. Signed in, the time is saved on the item (`snoozed_until`), so
 * it holds on every device; signed out (the sample library) it's kept on this device. Titles hidden on this device
 * before the column existed stay hidden until their month is up.
 */
export function useSnoozed(row: string, days: number) {
  const { user } = useAuth()
  const update = useUpdateItem()
  const key = `ondeck.snooze.${row}`
  const [until, setUntil] = useState<Until>(() => read(key))
  const hidden = (item: UserItem) =>
    (until[item.id] ?? 0) > Date.now() || (!!item.snoozedUntil && Date.parse(item.snoozedUntil) > Date.now())
  const snooze = (item: UserItem) => {
    const t = Date.now() + days * DAY
    undoable({
      message: `${item.title.title} won’t show here for a month`,
      hide: () => setUntil((u) => ({ ...u, [item.id]: t })),
      commit: async () => {
        if (user) return update(item, { snoozedUntil: new Date(t).toISOString() })
        try {
          localStorage.setItem(key, JSON.stringify({ ...read(key), [item.id]: t }))
        } catch {
          // Storage blocked: it stays hidden until the page reloads.
        }
      },
      restore: () =>
        setUntil((u) => {
          const { [item.id]: _, ...rest } = u
          return rest
        }),
    })
  }
  return { hidden, snooze }
}
