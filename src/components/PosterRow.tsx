import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { UserItem } from '../types'
import { PosterCard } from './PosterCard'
import { useLeaving } from '../lib/useLeaving'
import clsx from 'clsx'

/** Plex-style horizontal row of posters with a heading and scroll buttons. */
export function PosterRow({
  title,
  items,
  hint,
  href,
  subline,
  action,
  footer,
}: {
  title: string
  items: UserItem[]
  hint?: string
  /** Header links here (e.g. the matching Library view). */
  href?: string
  /** Per-card line under the year. */
  subline?: (item: UserItem) => string | undefined
  /** Extra control in the header, e.g. "Clear". */
  action?: ReactNode
  /** Optional control under a card (e.g. Continue's one-tap "Watched E5"). */
  footer?: (item: UserItem) => ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const shown = useLeaving(items, (i) => i.id)
  // Which ways the row can still scroll: an arrow shows only where there's more to see.
  const [can, setCan] = useState({ left: false, right: false })
  const hasRow = shown.length > 0
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const update = () => {
      const left = el.scrollLeft > 4
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
      setCan((c) => (c.left === left && c.right === right ? c : { left, right }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [hasRow, shown.length])
  if (!hasRow) return null
  const emptying = items.length === 0

  const scroll = (dir: 1 | -1) =>
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: 'smooth' })

  return (
    <section className={clsx('space-y-3', emptying && 'leave-y')}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-fg">
            {href ? (
              <Link to={href} className="hit hover:text-accent-ink">
                {title}
              </Link>
            ) : (
              title
            )}
          </h2>
          <span className="font-mono text-xs text-faint">{items.length}</span>
          {hint && <span className="hidden text-xs text-faint sm:inline">{hint}</span>}
          {action}
        </div>
      </div>
      <div className="group/row relative">
      <div ref={scroller} className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-1 md:-mx-6 md:scroll-px-6 md:px-6">
        {shown.map(({ item, key, leaving }) => (
          <div key={key} className={clsx('w-32 shrink-0 snap-start sm:w-36 lg:w-40', leaving && 'leave-x')} inert={leaving}>
            <PosterCard item={item} subline={subline?.(item)} morphKey={title} />
            {footer?.(item)}
          </div>
        ))}
      </div>
      {(['left', 'right'] as const).map((side) => (
        <button
          key={side}
          type="button"
          onClick={() => scroll(side === 'left' ? -1 : 1)}
          aria-label={`Scroll ${title} ${side}`}
          tabIndex={can[side] ? 0 : -1}
          className={clsx(
            // Over the row's edge, beside the posters it moves; only where there's more, and only with a mouse.
            'absolute top-[calc(50%-1.5rem)] z-10 hidden size-9 place-items-center rounded-full border border-line bg-surface/90 text-fg shadow-md backdrop-blur transition-opacity pointer-fine:grid hover:border-accent',
            side === 'left' ? '-left-2' : '-right-2',
            can[side] ? 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          {side === 'left' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      ))}
      </div>
    </section>
  )
}
