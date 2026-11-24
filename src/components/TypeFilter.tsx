import { useCallback, useEffect, useRef } from 'react'
import clsx from 'clsx'
import { LABELS, TYPES } from '../lib/filters'
import type { MediaType } from '../types'
import { useSlidingIndicator } from '../lib/useSlidingIndicator'

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
  const pills = useRef<HTMLDivElement | null>(null)
  const slide = useSlidingIndicator<HTMLDivElement>(value)
  // Stable, so React doesn't detach and re-attach it (and re-measure) on every render.
  const setPills = useCallback(
    (n: HTMLDivElement | null) => {
      pills.current = n
      slide(n)
    },
    [slide],
  )
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
        <div
          ref={setPills}
          role="radiogroup" aria-label="Media type" className="no-scrollbar relative hidden gap-1 overflow-x-auto sm:flex">
          {/* The quiet raised selection used by the app's other segmented controls; lemon is for actions. */}
          <span aria-hidden="true" className="slide-ind rounded-full bg-raised shadow-[inset_0_0_0_1px_var(--color-line)]" />
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={value === o.value}
              onClick={() => onChange(o.value)}
              className={clsx(
                'relative h-7 shrink-0 rounded-full px-3 text-xs whitespace-nowrap transition-colors',
                value === o.value ? 'font-medium text-fg' : 'text-muted hover:text-fg',
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
