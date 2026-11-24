import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { LABELS, TYPES } from '../lib/filters'
import type { MediaType } from '../types'

const selectClass = 'h-9 sm:h-7 rounded-md border border-line bg-surface px-2 text-xs text-fg outline-none focus:border-accent'

/**
 * The one media-type picker (All · Movies · TV Shows · Games · Books), used by the toolbar and Calendar so the
 * labels and options match everywhere. Pills on wider screens, a compact dropdown on phones.
 *
 * `navOwned`: the page's type is already set by the navigation (Library: sidebar on desktop). Then only the
 * phone dropdown shows, and only below the width where the sidebar appears.
 */
export function TypeFilter({
  value,
  onChange,
  navOwned = false,
}: {
  value: MediaType | null
  onChange: (t: MediaType | null) => void
  navOwned?: boolean
}) {
  const options: { value: MediaType | null; label: string }[] = [
    { value: null, label: 'All' },
    ...TYPES.map((t) => ({ value: t, label: LABELS.type[t] })),
  ]
  // When the pills overflow and scroll sideways, keep the selected one in view.
  const pills = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = pills.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (el && pills.current) pills.current.scrollLeft = el.offsetLeft - pills.current.offsetLeft - 8
  }, [value])
  return (
    <>
      <select
        aria-label="Media type"
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as MediaType | null)}
        className={clsx(selectClass, 'shrink-0', navOwned ? 'md:hidden' : 'sm:hidden')}
      >
        {options.map((o) => (
          <option key={o.label} value={o.value ?? ''}>
            {o.label}
          </option>
        ))}
      </select>
      {!navOwned && (
        <div ref={pills} role="radiogroup" aria-label="Media type" className="no-scrollbar hidden gap-1 overflow-x-auto sm:flex">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={value === o.value}
              onClick={() => onChange(o.value)}
              className={clsx(
                'h-7 shrink-0 rounded-full px-3 text-xs whitespace-nowrap transition-colors',
                value === o.value ? 'bg-accent font-medium text-accent-fg' : 'text-muted hover:bg-raised hover:text-fg',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
