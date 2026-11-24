import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RollingText } from './RollingText'
import { useLeaving } from '../lib/useLeaving'
import { useSwipe } from '../lib/useSwipe'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import type { MediaType, UserItem } from '../types'
import { continueStat, episodeCode, nextWatchable, weekDay, type Upcoming } from '../lib/home'
import { coverProps } from '../lib/images'
import { useUpdateItem } from '../lib/library'
import { useAuth } from '../lib/auth'
import { toast } from '../lib/toast'

const KIND: Record<MediaType, string> = { movie: 'Movie', tv: 'TV show', game: 'Game', book: 'Book' }

/** Section heading shared by Home's lists: title (a link when there's a matching view) and a count link. */
function ListHeader({ id, title, href, more }: { id: string; title: string; href?: string; more?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-lg font-semibold tracking-tight text-fg">
        {title}
      </h2>
      {href && more && (
        <Link to={href} className="hit text-sm text-accent-ink hover:underline">
          {more}
        </Link>
      )}
    </div>
  )
}

const MAX_ROWS = 5

/** Continue, after the Up next card: compact rows with the next step's number on the right. */
export function ContinueList({ items, total, href }: { items: UserItem[]; total: number; href: string }) {
  const shown = useLeaving(items.slice(0, MAX_ROWS), (i) => i.id)
  if (shown.length === 0) return null
  return (
    <section aria-labelledby="continue" className="max-w-xl space-y-3">
      <ListHeader id="continue" title="Continue" href={href} more={`All ${total}`} />
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {shown.map(({ item, key, leaving }) => (
          <ContinueRow key={key} item={item} leaving={leaving} />
        ))}
      </ul>
    </section>
  )
}

function ContinueRow({ item, leaving }: { item: UserItem; leaving: boolean }) {
  const { user } = useAuth()
  const update = useUpdateItem()
  const { title } = item
  const stat = continueStat(item)
  const ep = user ? nextWatchable(item) : null
  const mark = () => {
    if (ep) update(item, { tvProgress: ep }).catch(() => toast({ message: 'Couldn’t save that. Try again.', tone: 'error' }))
  }
  // Swipe left to mark the next episode (the check button does the same for keyboard, mouse and screen readers).
  const swipe = useSwipe<HTMLDivElement>({ dir: 'left', after: 'return', onCommit: mark, disabled: !ep })
  return (
    <li className={clsx('relative overflow-hidden', leaving && 'leave-y')} inert={leaving}>
      {ep && (
        <div aria-hidden="true" className="swipe-action absolute inset-0 flex items-center justify-end gap-2 bg-accent pr-5 text-sm font-medium text-accent-fg">
          <Check className="size-[18px]" />
          {episodeCode(ep)}
        </div>
      )}
      <div ref={swipe} className="relative flex items-center bg-surface">
        <Link to={`/title/${title.id}`} draggable={false} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 hover:bg-raised">
          <div className="h-[42px] w-7 flex-none overflow-hidden rounded bg-raised">
            {title.coverUrl && <img {...coverProps(title.coverUrl, '28px')} alt="" loading="lazy" draggable={false} className="size-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">{title.title}</p>
            <p className="mt-0.5 text-xs text-muted">{KIND[title.mediaType]}</p>
          </div>
          {(stat.num || stat.sub) && (
            <div className="flex-none text-right">
              {stat.num && <p className="font-mono text-sm text-fg"><RollingText text={stat.num} /></p>}
              {stat.sub && <p className="mt-0.5 text-xs text-muted">{stat.sub}</p>}
            </div>
          )}
        </Link>
        {ep && (
          <button
            type="button"
            onClick={mark}
            aria-label={`Mark ${episodeCode(ep)} of ${title.title} watched`}
            title={`Mark ${episodeCode(ep)} watched`}
            className="mr-2 grid size-11 flex-none place-items-center rounded-md text-muted hover:bg-raised hover:text-accent-ink"
          >
            <Check className="size-[18px]" />
          </button>
        )}
      </div>
    </li>
  )
}

/** Next 7 days: a dated list of releases, premieres and new episodes. */
export function WeekList({ upcoming, href }: { upcoming: Upcoming[]; href: string }) {
  if (upcoming.length === 0) return null
  return (
    <section aria-labelledby="week" className="max-w-xl space-y-2">
      <ListHeader id="week" title="Next 7 days" href={href} more="Calendar" />
      <ul>
        {upcoming.map((u) => (
          <li key={u.item.id} className="border-b border-line last:border-b-0">
            <Link to={`/title/${u.item.title.id}`} className="flex items-baseline gap-3 py-2 hover:text-accent-ink">
              <span className="w-20 flex-none font-mono text-xs text-muted">{weekDay(u)}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{u.item.title.title}</span>
              <span className={/^S\d/.test(u.label) ? 'font-mono text-xs text-accent-ink' : 'text-xs text-accent-ink'}>{u.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
