import { useSyncExternalStore } from 'react'

/**
 * Tiny toast store: `toast()` shows a message at the bottom of the screen, `undoable()` makes a destructive
 * action reversible instead of asking "Are you sure?" first.
 *
 * Up to three show at once (newest at the bottom), so a second action doesn't take away the first one's Undo.
 * A toast's timer pauses while it's hovered or has focus, and so does an Undo's save (WCAG 2.2.1).
 */

export interface Toast {
  id: number
  message: string
  tone?: 'default' | 'error'
  action?: { label: string; onClick: () => void }
  /** Milliseconds before it goes away by itself. */
  duration: number
  /** On its way out: fading for a moment before it's removed. */
  leaving?: boolean
  /** Called when its timer pauses (hover, focus) and starts again: an Undo pauses its save with it. */
  onPause?: () => void
  onResume?: () => void
  /** What it's about (e.g. one title). A newer toast with the same key replaces it, so only the latest Undo for
   * a title is on screen and an older one can't put back a state from before newer changes. */
  key?: string
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const timers = new Map<number, ReturnType<typeof setTimeout>>()
/** Time left on each toast, and when its timer last started (or that it's paused). */
const clocks = new Map<number, { left: number; started: number; paused: boolean }>()
const MAX_SHOWN = 3

/** How long a dismissed toast takes to fade out (matches .toast-leave). */
const LEAVE_MS = 160

function remove(id: number) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  // Pushed out while paused: whatever it was holding (an Undo's save) carries on.
  const c = clocks.get(id)
  if (c?.paused) toasts.find((t) => t.id === id)?.onResume?.()
  clocks.delete(id)
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** Timed out, ×, swiped or acted on: it fades out the way it came, then goes. */
export function dismiss(id: number) {
  const t = toasts.find((x) => x.id === id)
  if (!t || t.leaving) return
  clearTimeout(timers.get(id))
  const c = clocks.get(id)
  if (c?.paused) t.onResume?.()
  clocks.delete(id)
  toasts = toasts.map((x) => (x.id === id ? { ...x, leaving: true } : x))
  emit()
  timers.set(id, setTimeout(() => remove(id), LEAVE_MS))
}

export function toast(t: Omit<Toast, 'id' | 'duration'> & { duration?: number }): number {
  const id = nextId++
  const full: Toast = { duration: 5000, ...t, id }
  // The oldest goes when there are too many (an Undo's save carries on regardless).
  if (t.key) for (const old of toasts.filter((x) => x.key === t.key && !x.leaving)) dismiss(old.id)
  const shown = toasts.filter((x) => !x.leaving)
  for (const old of shown.slice(0, Math.max(0, shown.length - (MAX_SHOWN - 1)))) remove(old.id)
  toasts = [...toasts, full]
  clocks.set(id, { left: full.duration, started: Date.now(), paused: false })
  timers.set(id, setTimeout(() => dismiss(id), full.duration))
  emit()
  return id
}

/** Hovered or focused: hold the timer (and anything tied to it). */
export function pauseToast(id: number) {
  const c = clocks.get(id)
  if (!c || c.paused) return
  clearTimeout(timers.get(id))
  c.left = Math.max(1000, c.left - (Date.now() - c.started))
  c.paused = true
  toasts.find((t) => t.id === id)?.onPause?.()
}

export function resumeToast(id: number) {
  const c = clocks.get(id)
  if (!c || !c.paused) return
  c.paused = false
  c.started = Date.now()
  timers.set(id, setTimeout(() => dismiss(id), c.left))
  toasts.find((t) => t.id === id)?.onResume?.()
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

const UNDO_MS = 10_000
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
  key: about,
}: {
  message: string
  hide: () => void
  commit: () => Promise<void>
  restore: () => void
  failMessage?: string
  /** See Toast.key. */
  key?: string
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
  // The save waits as long as the toast does, pausing with it.
  let left = UNDO_MS
  let started = Date.now()
  let timer = setTimeout(run, left)
  pending.set(key, run)
  const toastId = toast({
    message,
    key: about,
    duration: UNDO_MS,
    onPause: () => {
      clearTimeout(timer)
      left = Math.max(1000, left - (Date.now() - started))
    },
    onResume: () => {
      if (done) return
      clearTimeout(timer)
      started = Date.now()
      timer = setTimeout(run, left)
    },
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
