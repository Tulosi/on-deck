import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useKeys } from '../lib/shortcuts'
import { useDialog } from '../lib/useDialog'

const ROWS: { keys: string[]; what: string; where?: string }[] = [
  { keys: ['/'], what: 'Search' },
  { keys: ['1', '–', '5'], what: 'Set the status', where: 'On a title' },
  { keys: ['W'], what: 'Mark the next episode watched', where: 'On a show' },
  { keys: ['?'], what: 'Show these shortcuts' },
]

const kbd = 'grid h-6 min-w-6 place-items-center rounded border border-line bg-bg px-1.5 font-mono text-xs text-fg'

/** Keyboard shortcuts, listed when you press ? anywhere (not while typing). */
export function ShortcutsSheet() {
  const [open, setOpen] = useState(false)
  const panel = useDialog<HTMLDivElement>(open, () => setOpen(false))
  useKeys((key) => {
    if (key !== '?') return
    setOpen(true)
    return true
  })
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden="true" />
      <div ref={panel} tabIndex={-1} className="pop-in relative w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-2xl outline-none">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-base font-semibold text-fg">
            Keyboard shortcuts
          </h2>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="hit text-muted hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
        <dl className="divide-y divide-line">
          {ROWS.map((r) => (
            <div key={r.what} className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-sm text-fg">
                {r.what}
                {r.where && <span className="block text-xs text-muted">{r.where}</span>}
              </dt>
              <dd className="flex items-center gap-1 text-xs text-muted">
                {r.keys.map((k) => (k === '–' ? <span key={k}>to</span> : <kbd key={k} className={kbd}>{k}</kbd>))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  )
}
