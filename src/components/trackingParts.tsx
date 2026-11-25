// Small pieces shared by the title page's tracking controls (StatusControls, TvProgress, MovieProgress).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { toast } from '../lib/toast'
import { useSlidingIndicator } from '../lib/useSlidingIndicator'
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
  // own line), and `aside` (Archive) moves up beside the label rather than sitting alone under the options.
  // Wide enough: one row, with `aside` beside it.
  const five = options.length === 5
  const cols = five ? 'grid-cols-3 @[36rem]/status:grid-cols-5' : 'grid-cols-2 @[30rem]/status:grid-cols-4'
  const wide = five
    ? { group: '@[36rem]/status:col-span-1', aside: '@[36rem]/status:row-start-2 @[36rem]/status:[&>*]:h-full' }
    : { group: '@[30rem]/status:col-span-1', aside: '@[30rem]/status:row-start-2 @[30rem]/status:[&>*]:h-full' }
  const group = useSlidingIndicator<HTMLDivElement>(value)
  return (
    <div className="@container/status grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5">
      <p className={clsx(labelClass, 'col-start-1 row-start-1')}>{label}</p>
      <div
        ref={group}
        role="radiogroup"
        aria-label={label}
        className={clsx(
          'relative col-span-2 col-start-1 row-start-2 grid min-w-0 gap-1 rounded-lg border border-line bg-bg p-1',
          fit ? 'w-fit grid-flow-col auto-cols-fr' : [cols, aside && wide.group],
        )}
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
      {/* Narrow: a quiet text action at the end of the label row ("Status … Archive"). Wide: a full button beside the
          options. */}
      {aside && (
        <div
          className={clsx(
            'col-start-2 row-start-1 flex',
            '[&>button]:-my-3 [&>button]:border-transparent [&>button]:px-1 [&>button]:text-xs [&>button]:hover:border-transparent',
            wide.aside,
            five
              ? '@[36rem]/status:[&>button]:my-0 @[36rem]/status:[&>button]:border-line @[36rem]/status:[&>button]:px-3 @[36rem]/status:[&>button]:text-sm'
              : '@[30rem]/status:[&>button]:my-0 @[30rem]/status:[&>button]:border-line @[30rem]/status:[&>button]:px-3 @[30rem]/status:[&>button]:text-sm',
          )}
        >
          {aside}
        </div>
      )}
    </div>
  )
}

/**
 * Archive: straight away, with Undo (it's reversible, so no "Are you sure?"). The toast says what it does and where
 * to find the title again. Archived titles show a notice on their page to bring them back.
 */
export function ArchiveButton({ item, save }: { item: UserItem; save: (patch: ItemPatch) => Promise<unknown> }) {
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
  const archive = () =>
    void save({ archived: true }).then(
      (ok) =>
        ok !== false &&
        toast({
          message: `Archived “${item.title.title}”. It’s off Home, the Library and alerts, and kept under Archive.`,
          action: { label: 'Undo', onClick: () => void save({ archived: false }) },
          duration: 10_000,
        }),
    )
  return (
    <button
      type="button"
      onClick={archive}
      className="flex h-11 items-center gap-1.5 self-start rounded-lg border sm:h-9 border-line px-3 text-sm text-muted hover:border-faint hover:text-fg @[30rem]/status:h-auto @[30rem]/status:self-stretch"
      title="Archive: hide it everywhere but Archive, keeping its status, rating and notes"
    >
      <Archive className="size-4" /> Archive
    </button>
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
