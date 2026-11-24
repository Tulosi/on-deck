import { Link } from 'react-router-dom'
import type { UserItem } from '../types'
import { episodeCode, upNext } from '../lib/home'
import { coverProps } from '../lib/images'
import { useUpdateItem } from '../lib/library'
import { useAuth } from '../lib/auth'
import { toast } from '../lib/toast'
import type { MediaType } from '../types'

const NOUN: Record<MediaType, string> = { movie: 'movie', tv: 'show', game: 'game', book: 'book' }
const KIND: Record<MediaType, string> = { movie: 'Movie', tv: 'TV show', game: 'Game', book: 'Book' }

/**
 * The top of Home: the one thing you're most likely to pick up next, with its next step set large and one
 * bold action. Everything else on Home stays quieter than this.
 */
export function UpNextCard({ item }: { item: UserItem }) {
  const { user } = useAuth()
  const update = useUpdateItem()
  const { title } = item
  const next = upNext(item)
  const canMark = !!user && !!next.watchable

  return (
    <section aria-labelledby="up-next" className="space-y-3">
      <h1 id="up-next" className="text-xl font-semibold tracking-tight text-fg">
        Up next
      </h1>
      <div className="max-w-xl overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex gap-4 p-4">
          <Link to={`/title/${title.id}`} className="hit block w-20 flex-none sm:w-24" aria-label={title.title}>
            <div className="aspect-[2/3] overflow-hidden rounded-md border border-line bg-raised">
              {title.coverUrl && <img {...coverProps(title.coverUrl, '96px')} alt="" className="size-full object-cover" />}
            </div>
          </Link>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Link to={`/title/${title.id}`} className="truncate text-base font-semibold text-fg hover:underline">
              {title.title}
            </Link>
            {next.value ? (
              <p className="font-mono text-3xl leading-tight font-medium tracking-tight text-fg">{next.value}</p>
            ) : (
              <p className="text-sm text-muted">{KIND[title.mediaType]}</p>
            )}
            {next.note && <p className="text-sm text-muted">{next.note}</p>}
            {next.bar && (
              <div className="mt-auto pt-2">
                <div className="h-1 rounded-full bg-raised" role="img" aria-label={next.bar.label}>
                  <div
                    className="h-1 rounded-full bg-accent-ink"
                    style={{ width: `${Math.round((next.bar.done / Math.max(1, next.bar.total)) * 100)}%` }}
                  />
                </div>
                <p className="mt-1 font-mono text-xs text-muted" aria-hidden="true">
                  {next.bar.text}
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 border-t border-line px-4 py-3">
          {canMark && next.watchable && (
            <button
              type="button"
              onClick={() =>
                update(item, { tvProgress: next.watchable! }).catch(() =>
                  toast({ message: 'Couldn’t save that. Try again.', tone: 'error' }),
                )
              }
              className="h-11 flex-1 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:brightness-105 active:scale-[0.98]"
            >
              Mark {episodeCode(next.watchable)} watched
            </button>
          )}
          <Link
            to={`/title/${title.id}`}
            className={
              canMark
                ? 'grid h-11 place-items-center rounded-md border border-line px-4 text-sm text-fg hover:bg-raised'
                : 'grid h-11 flex-1 place-items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:brightness-105'
            }
          >
            {canMark ? 'Details' : `Open ${NOUN[title.mediaType]}`}
          </Link>
        </div>
      </div>
    </section>
  )
}
