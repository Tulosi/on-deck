// Small pieces shared by the title page's tracking controls (StatusControls, TvProgress, MovieProgress).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useDialog } from '../lib/useDialog'
import clsx from 'clsx'
import { useSlidingIndicator } from '../lib/useSlidingIndicator'
import { createPortal } from 'react-dom'
import { Archive, ArchiveRestore, Loader2, RefreshCw } from 'lucide-react'
import { useUpdateItem, type ItemPatch } from '../lib/library'
import { type UserItem } from '../types'
import { plainError } from '../lib/errors'

export const labelClass = 'text-xs font-medium text-muted'

/** Segmented control: one option active at a time. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  aside,
  fit,
  numberKeys,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  /** Extra control to the right of the options (e.g. Archive). */
  aside?: ReactNode
  /** Size to the labels instead of stretching across the card (short options like Priority). */
  fit?: boolean
  /** Options answer the number keys 1, 2, 3… (announced to screen readers; the handler lives with the caller). */
  numberKeys?: boolean
}) {
  // Laid out by the space the control actually has (a container query), not the window width: on desktop the
  // card sits in a narrower column. Narrow: 2 per row for 4 options, 3 + 2 for 5 (never a lone option on its
  // own line), with `aside` (Archive) on its own line. Wide enough: one row, with `aside` beside it.
  const five = options.length === 5
  const cols = five ? 'grid-cols-3 @[36rem]/status:grid-cols-5' : 'grid-cols-2 @[30rem]/status:grid-cols-4'
  const row = five
    ? 'basis-full @[36rem]/status:basis-auto @[36rem]/status:flex-1'
    : 'basis-full @[30rem]/status:basis-auto @[30rem]/status:flex-1'
  const group = useSlidingIndicator<HTMLDivElement>(value)
  return (
    <div className="space-y-1.5">
      <p className={labelClass}>{label}</p>
      <div className="@container/status flex flex-wrap items-stretch gap-2">
      <div
        ref={group}
        role="radiogroup"
        aria-label={label}
        className={clsx('relative grid min-w-0 gap-1 rounded-lg border border-line bg-bg p-1', fit ? 'w-fit grid-flow-col auto-cols-fr' : [row, cols])}
      >
        <span aria-hidden="true" className="slide-ind rounded-md bg-raised shadow-[inset_0_0_0_1px_var(--color-line)]" />
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            aria-keyshortcuts={numberKeys ? String(i + 1) : undefined}
            title={numberKeys ? `${o.label} (${i + 1})` : undefined}
            onClick={() => onChange(o.value)}
            className={clsx(
              // Labels wrap inside their button (never overrun it) when space is tight.
              'relative min-h-11 rounded-md px-2 py-1.5 text-sm leading-tight text-balance transition-colors sm:min-h-0',
              value === o.value ? 'font-medium text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {aside}
      </div>
    </div>
  )
}

/** Archive: confirm, then hide the title everywhere by default. Archived titles show a notice to bring them back. */
export function ArchiveButton({ item, save }: { item: UserItem; save: (patch: ItemPatch) => Promise<unknown> }) {
  const [confirming, setConfirming] = useState(false)
  const panel = useDialog<HTMLDivElement>(confirming, () => setConfirming(false))
  if (item.archivedAt) {
    return (
      <button
        type="button"
        onClick={() => void save({ archived: false })}
        className="flex h-11 items-center gap-1.5 self-start rounded-lg border sm:h-9 border-accent/60 bg-accent/10 px-3 text-sm text-fg hover:border-accent @[30rem]/status:h-auto @[30rem]/status:self-stretch"
        title="Take this title out of the archive"
      >
        <ArchiveRestore className="size-4" /> Unarchive
      </button>
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-11 items-center gap-1.5 self-start rounded-lg border sm:h-9 border-line px-3 text-sm text-muted hover:border-faint hover:text-fg @[30rem]/status:h-auto @[30rem]/status:self-stretch"
        title="Archive this title"
      >
        <Archive className="size-4" /> Archive
      </button>
      {confirming &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="archive-title">
            <div className="absolute inset-0 bg-black/60" onClick={() => setConfirming(false)} aria-hidden="true" />
            <div ref={panel} tabIndex={-1} className="relative w-full max-w-sm space-y-3 rounded-xl border border-line bg-surface p-5 shadow-2xl outline-none">
              <p id="archive-title" className="text-base font-semibold text-fg">
                Archive “{item.title.title}”?
              </p>
              <p className="text-sm text-muted">For things you're done with but want a record of. Archiving:</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                <li>Hides it from Home, the Library, the Calendar and collections</li>
                <li>Stops its alerts and leaves it out of share links and calendar feeds</li>
                <li>Keeps its status, rating and notes exactly as they are</li>
              </ul>
              <p className="text-xs text-faint">
                Find it again any time with the <b>Archived</b> filter in the Library, and unarchive it from its page.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setConfirming(false)} className="h-9 rounded-md border border-line px-3 text-sm text-fg hover:border-accent">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false)
                    void save({ archived: true })
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:brightness-95"
                >
                  <Archive className="size-4" /> Archive
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/** On/off pill with an icon. */
export function Toggle({
  on,
  onClick,
  children,
  activeClass,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
  activeClass: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        'flex h-11 items-center gap-2 rounded-md border px-3.5 text-sm whitespace-nowrap transition-colors sm:h-9',
        on ? activeClass : 'border-line text-muted hover:border-faint hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

export const selectClass =
  'h-11 rounded-lg border border-line bg-bg px-2.5 text-sm text-fg outline-none focus:border-accent sm:h-9'

export const pillButton =
  'hit flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-muted hover:border-accent hover:text-fg disabled:opacity-60'

/** Shown while a title is actively synced from Plex: a green status (tap to check Plex again). */
export function SyncedPill({ loading, onRefresh, server }: { loading: boolean; onRefresh: () => void; server?: string | null }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={loading}
      title={`Synced from Plex${server ? ` (${server})` : ''}. Tap to check again.`}
      className="hit group flex h-8 items-center gap-1.5 rounded-md px-1 text-xs text-muted hover:text-fg disabled:opacity-80"
    >
      {loading ? <RefreshCw className="size-3 animate-spin" /> : <span className="size-1.5 rounded-full bg-good" aria-hidden="true" />}
      {loading ? 'Syncing…' : 'Synced from Plex'}
      {!loading && <RefreshCw className="size-3 opacity-50 group-hover:opacity-100" aria-hidden="true" />}
    </button>
  )
}

/** Notes box that saves itself shortly after you stop typing (and on blur). */
export function Notes({ initial, onSave }: { initial: string; onSave: (text: string) => Promise<void> }) {
  const id = useId()
  const [text, setText] = useState(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const lastSaved = useRef(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function save(value: string) {
    if (value === lastSaved.current) return
    setState('saving')
    try {
      await onSave(value)
      lastSaved.current = value
      setState('saved')
    } catch {
      setState('error')
    }
  }

  // The latest text, for the page-leave handlers below (they're set up once).
  const latest = useRef(initial)
  latest.current = text
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    const flush = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      void saveRef.current(latest.current)
    }
    // Switching tabs or apps, or closing the tab: save now rather than waiting for the pause.
    const onHide = () => document.visibilityState === 'hidden' && flush()
    // Closing the tab with typing not yet saved: the browser asks first.
    const onLeave = (e: BeforeUnloadEvent) => {
      if (latest.current !== lastSaved.current) {
        flush()
        e.preventDefault()
      }
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onLeave)
      // Leaving the title page mid-pause still saves.
      if (timer.current) flush()
    }
  }, [])

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={`notes-${id}`} className={labelClass}>
          Notes
        </label>
        <span className="text-xs text-faint" aria-live="polite">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? (
            <span className="text-bad">Couldn’t save. Try again.</span>
          ) : null}
        </span>
      </div>
      <textarea
        name="notes"
        autoComplete="off"
        id={`notes-${id}`}
        value={text}
        rows={3}
        placeholder="Anything to remember, like who recommended it or where you left off…"
        onChange={(e) => {
          const value = e.target.value
          setText(value)
          setState('idle')
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => save(value), 800)
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current)
          void save(text)
        }}
        className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg outline-none placeholder:text-faint focus:border-accent"
      />
    </div>
  )
}

/** Saves a patch to one item, with a pending count and the last error for a "Saving" / error line. */
export function useSaver(item: UserItem) {
  const update = useUpdateItem()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  /** Resolves true once saved; a failure shows beside the Tracking heading and resolves false. */
  async function save(patch: ItemPatch): Promise<boolean> {
    setError(null)
    setPending((n) => n + 1)
    try {
      await update(item, patch)
      return true
    } catch (err) {
      setError(plainError(err, 'Couldn’t save that change.'))
      return false
    } finally {
      setPending((n) => n - 1)
    }
  }
  return { save, update, pending, error }
}

export function SaveState({ pending, error }: { pending: number; error: string | null }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-faint" aria-live="polite">
      {pending > 0 ? (
        <>
          <Loader2 className="size-3.5 animate-spin" /> Saving
        </>
      ) : error ? (
        <span className="text-bad">{error}</span>
      ) : null}
    </span>
  )
}
