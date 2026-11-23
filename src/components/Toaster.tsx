import clsx from 'clsx'
import { X } from 'lucide-react'
import { dismiss, useToasts } from '../lib/toast'

/** Bottom of the screen, above the phone tab bar. One toast at a time. */
export function Toaster() {
  const toasts = useToasts()
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-50 flex justify-center px-4 md:bottom-6 md:left-56"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={clsx(
            'toast-enter pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border bg-raised py-2 pr-2 pl-4 text-sm shadow-2xl shadow-black/40',
            t.tone === 'error' ? 'border-bad/60 text-fg' : 'border-line text-fg',
          )}
        >
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={t.action.onClick}
              className="rounded-md px-2.5 py-1 font-medium text-accent-ink hover:bg-accent/10"
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="grid size-7 place-items-center rounded-md text-muted hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
