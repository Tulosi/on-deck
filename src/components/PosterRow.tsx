import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { UserItem } from '../types'
import { PosterCard } from './PosterCard'

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
  if (items.length === 0) return null

  const scroll = (dir: 1 | -1) =>
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: 'smooth' })

  return (
    <section className="space-y-3">
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
        <div className="hidden gap-1 md:flex">
          <button type="button" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`} className="grid size-7 place-items-center rounded-full border border-line text-muted hover:border-accent hover:text-fg">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`} className="grid size-7 place-items-center rounded-full border border-line text-muted hover:border-accent hover:text-fg">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div ref={scroller} className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-1 md:-mx-6 md:scroll-px-6 md:px-6">
        {items.map((item) => (
          <div key={item.id} className="w-32 shrink-0 snap-start sm:w-36 lg:w-40">
            <PosterCard item={item} subline={subline?.(item)} morphKey={title} />
            {footer?.(item)}
          </div>
        ))}
      </div>
    </section>
  )
}
