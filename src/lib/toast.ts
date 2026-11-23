import { useSyncExternalStore } from 'react'

/**
 * Tiny toast store: `toast()` shows a message at the bottom of the screen, `undoable()` makes a destructive
 * action reversible instead of asking "Are you sure?" first.
 */

export interface Toast {
  id: number
  message: string
  tone?: 'default' | 'error'
  action?: { label: string; onClick: () => void }
  /** Milliseconds before it goes away by itself. */
  duration: number
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export function dismiss(id: number) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function toast(t: Omit<Toast, 'id' | 'duration'> & { duration?: number }): number {
  const id = nextId++
  const full: Toast = { duration: 5000, ...t, id }
  // One at a time: a new toast replaces the old one (each action's own commit timer keeps running).
  for (const old of toasts) dismiss(old.id)
  toasts = [full]
  timers.set(id, setTimeout(() => dismiss(id), full.duration))
  emit()
  return id
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
}

// ─── Undo ──────────────────────────────────────────────────────────────────

const UNDO_MS = 6000
/** Actions waiting to be saved. Flushed straight away if the page is hidden or closed. */
const pending = new Map<number, () => void>()

/**
 * Do a destructive action with an Undo instead of a confirm dialog:
 * `hide` takes it off the screen now, `commit` saves it after a few seconds, and Undo calls `restore` instead.
 * If saving fails, `restore` puts it back and an error toast says so.
 */
export function undoable({
  message,
  hide,
  commit,
  restore,
  failMessage = 'Couldn’t save that. It’s been put back.',
}: {
  message: string
  hide: () => void
  commit: () => Promise<void>
  restore: () => void
  failMessage?: string
}) {
  const key = nextId++
  let done = false
  const run = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    pending.delete(key)
    commit().catch(() => {
      restore()
      toast({ message: failMessage, tone: 'error' })
    })
  }
  hide()
  const timer = setTimeout(run, UNDO_MS)
  pending.set(key, run)
  const toastId = toast({
    message,
    duration: UNDO_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        if (done) return
        done = true
        clearTimeout(timer)
        pending.delete(key)
        restore()
        dismiss(toastId)
      },
    },
  })
}

// Leaving the page or switching apps: save now rather than lose the action.
if (typeof document !== 'undefined') {
  const flush = () => [...pending.values()].forEach((run) => run())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
  window.addEventListener('pagehide', flush)
}
