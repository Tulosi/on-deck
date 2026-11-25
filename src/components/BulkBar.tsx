import { useEffect } from 'react'
import clsx from 'clsx'
import { Archive, ArchiveRestore, Check, Layers, Trash2, X } from 'lucide-react'
import { useBulkItems } from '../lib/library'
import { useCollectionActions, useCollections } from '../lib/collections'
import { statusLabel } from '../lib/statusLabels'
import { toast } from '../lib/toast'
import type { Progress, UserItem } from '../types'

/** In select mode, a card toggles instead of opening the title. Covers the card so its link can't be followed. */
export function SelectableCard({
  selecting,
  selected,
  onToggle,
  label,
  children,
}: {
  selecting: boolean
  selected: boolean
  onToggle: () => void
  label: string
  children: React.ReactNode
}) {
  if (!selecting) return <>{children}</>
  return (
    <div className="relative">
      <div className={clsx('transition-opacity', !selected && 'opacity-70')}>{children}</div>
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={label}
        onClick={onToggle}
        className={clsx(
          'no-press absolute inset-0 rounded-lg outline-offset-2',
          selected && 'ring-2 ring-accent ring-offset-2 ring-offset-bg',
        )}
      >
        <span
          className={clsx(
            'absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full border-2',
            selected ? 'border-accent bg-accent text-accent-fg' : 'border-white/80 bg-black/40',
          )}
        >
          {selected && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      </button>
    </div>
  )
}

const selectClass = 'h-8 rounded-md border border-line bg-surface px-2 text-xs text-fg outline-none focus:border-accent'

/**
 * Bottom bar while selecting in the Library: change status, add to a collection, archive or remove the chosen
 * titles. Sits above the phone tab bar, where the thumb is.
 */
export function BulkBar({
  selected,
  visible,
  archivedView,
  onSelectAll,
  onClear,
  onDone,
}: {
  selected: UserItem[]
  /** Everything currently shown, for "Select all". */
  visible: number
  archivedView: boolean
  onSelectAll: () => void
  /** Untick everything but stay in select mode. */
  onClear: () => void
  onDone: () => void
}) {
  const { setStatus, archive, remove } = useBulkItems()
  const { data: collections = [] } = useCollections()
  const { toggleItem } = useCollectionActions()
  const n = selected.length
  const types = new Set(selected.map((i) => i.title.mediaType))
  const one = types.size === 1 ? [...types][0] : null
  const statuses: Progress[] = [
    'wanted',
    'in_progress',
    ...(selected.every((i) => i.title.mediaType === 'game' || i.title.mediaType === 'book') ? (['stalled'] as const) : []),
    'completed',
    'dropped',
  ]
  const manual = collections.filter((c) => c.rules == null) // smart collections fill themselves

  // Escape leaves select mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDone])

  const addTo = async (id: string) => {
    const c = manual.find((x) => x.id === id)
    if (!c) return
    try {
      for (const item of selected) {
        if (!c.itemIds.includes(item.id)) await toggleItem.mutateAsync({ collectionId: id, itemId: item.id, add: true })
      }
      toast({ message: `Added ${n} to “${c.name}”` })
    } catch {
      toast({ message: `Couldn’t add them all to “${c.name}”. Try again.`, tone: 'error' })
    }
  }

  return (
    <div
      role="toolbar"
      aria-label="Selected titles"
      className="toast-enter fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-40 flex justify-center px-3 md:bottom-6 md:left-56"
    >
      <div className="flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2 shadow-2xl shadow-black/40">
        <p className="min-w-16 text-sm font-medium text-fg" aria-live="polite">
          {n} selected
        </p>
        {n < visible && (
          <button type="button" onClick={onSelectAll} className="hit text-xs text-accent-ink hover:underline">
            Select all {visible}
          </button>
        )}
        {n > 0 && (
          <button type="button" onClick={onClear} className="hit text-xs text-muted hover:text-fg hover:underline">
            Clear
          </button>
        )}
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <select
          aria-label="Set status"
          disabled={n === 0}
          value=""
          onChange={(e) => {
            // Your picks stay, so you can follow up (archive them, add them to a collection) without picking again.
            void setStatus(selected, e.target.value as Progress)
          }}
          className={selectClass}
        >
          <option value="" disabled>
            Status…
          </option>
          {statuses.map((p) => (
            <option key={p} value={p}>
              {statusLabel(p, one)}
            </option>
          ))}
        </select>
        {manual.length > 0 && (
          <label className="flex items-center gap-1 text-muted">
            <Layers className="size-4" aria-hidden />
            <select aria-label="Add to collection" disabled={n === 0} value="" onChange={(e) => void addTo(e.target.value)} className={selectClass}>
              <option value="" disabled>
                Add to…
              </option>
              {manual.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          disabled={n === 0}
          onClick={() => {
            archive(selected, !archivedView)
            onDone()
          }}
          className="flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-fg hover:border-accent disabled:opacity-50"
        >
          {archivedView ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
          {archivedView ? 'Unarchive' : 'Archive'}
        </button>
        <button
          type="button"
          disabled={n === 0}
          onClick={() => {
            remove(selected)
            onDone()
          }}
          className="flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-bad hover:border-bad disabled:opacity-50"
        >
          <Trash2 className="size-3.5" /> Remove
        </button>
        <button type="button" onClick={onDone} aria-label="Stop selecting" className="grid size-8 place-items-center rounded-md text-muted hover:text-fg">
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
