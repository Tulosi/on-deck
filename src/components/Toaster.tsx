import clsx from 'clsx'
import { X } from 'lucide-react'
import { dismiss, pauseToast, resumeToast, useToasts, type Toast } from '../lib/toast'
import { useSwipe } from '../lib/useSwipe'

/** Bottom of the screen, above the phone tab bar. Up to three, newest at the bottom. */
export function Toaster() {
  const toasts = useToasts()
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem+var(--bulk-h,0px))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-[calc(1.5rem+var(--bulk-h,0px))] md:left-56"
    >
      {toasts.map((t) => (
        <ToastView key={t.id} t={t} />
      ))}
    </div>
  )
}

/** One toast. Swipe it sideways to dismiss (the × does the same). */
function ToastView({ t }: { t: Toast }) {
  const swipe = useSwipe<HTMLDivElement>({ dir: 'both', after: 'away', onCommit: () => dismiss(t.id) })
  return (
    <div
      ref={swipe}
      role={t.tone === 'error' ? 'alert' : 'status'}
      inert={t.leaving}
      // Reading it, or about to press Undo: the clock stops.
      onPointerEnter={() => pauseToast(t.id)}
      onPointerLeave={() => resumeToast(t.id)}
      onFocus={() => pauseToast(t.id)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && resumeToast(t.id)}
      className={clsx(
        t.leaving && 'toast-leave',
        'toast-enter pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border bg-raised py-2 pr-2 pl-4 text-sm shadow-2xl shadow-black/40',
        t.tone === 'error' ? 'border-bad/60 text-fg' : 'border-line text-fg',
      )}
    >
      <span className="min-w-0 flex-1">{t.message}</span>
      {t.action && (
        <button
          type="button"
          onClick={() => {
            // Done: it goes, so it's clear the action ran (and can't be pressed twice).
            t.action!.onClick()
            dismiss(t.id)
          }}
          className="hit rounded-md px-2.5 py-1 font-medium text-accent-ink hover:bg-accent/10"
        >
          {t.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="hit grid size-7 place-items-center rounded-md text-muted hover:text-fg">
        <X className="size-4" />
      </button>
    </div>
  )
}
