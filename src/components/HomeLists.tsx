import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
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
  if (items.length === 0) return null
  return (
    <section aria-labelledby="continue" className="max-w-xl space-y-3">
      <ListHeader id="continue" title="Continue" href={href} more={`All ${total}`} />
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {items.slice(0, MAX_ROWS).map((item) => (
          <ContinueRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  )
}

function ContinueRow({ item }: { item: UserItem }) {
  const { user } = useAuth()
  const update = useUpdateItem()
  const { title } = item
  const stat = continueStat(item)
  const ep = user ? nextWatchable(item) : null
  return (
    <li className="flex items-center">
      <Link to={`/title/${title.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 hover:bg-raised">
        <div className="h-[42px] w-7 flex-none overflow-hidden rounded bg-raised">
          {title.coverUrl && <img {...coverProps(title.coverUrl, '28px')} alt="" loading="lazy" className="size-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{title.title}</p>
          <p className="mt-0.5 text-xs text-muted">{KIND[title.mediaType]}</p>
        </div>
        {(stat.num || stat.sub) && (
          <div className="flex-none text-right">
            {stat.num && <p className="font-mono text-sm text-fg">{stat.num}</p>}
            {stat.sub && <p className="mt-0.5 text-xs text-muted">{stat.sub}</p>}
          </div>
        )}
      </Link>
      {ep && (
        <button
          type="button"
          onClick={() =>
            update(item, { tvProgress: ep }).catch(() => toast({ message: 'Couldn’t save that. Try again.', tone: 'error' }))
          }
          aria-label={`Mark ${episodeCode(ep)} of ${title.title} watched`}
          title={`Mark ${episodeCode(ep)} watched`}
          className="mr-2 grid size-11 flex-none place-items-center rounded-md text-muted hover:bg-raised hover:text-accent-ink"
        >
          <Check className="size-[18px]" />
        </button>
      )}
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
