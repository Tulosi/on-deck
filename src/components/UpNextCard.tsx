import { Link } from 'react-router-dom'
import { RollingText } from './RollingText'
import type { UserItem } from '../types'
import { episodeCode, upNext } from '../lib/home'
import { coverProps } from '../lib/images'
import { useUpdateItem } from '../lib/library'
import { useAuth } from '../lib/auth'
import { useSeerrStatus } from '../lib/integrations'
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
  const { title } = item
  const next = upNext(item)

  return (
    <section aria-labelledby="up-next" className="space-y-3">
      <h1 id="up-next" className="text-xl font-semibold tracking-tight text-fg">
        Up next
      </h1>
      <div className="max-w-xl overflow-hidden rounded-lg border border-line bg-surface">
        {/* A new title taking the card arrives with a short lift; the same title updating doesn't. */}
        <div key={item.id} className="arrive flex gap-4 p-4">
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
              <p className="font-mono text-3xl leading-tight font-medium tracking-tight text-fg">
                <RollingText text={next.value} />
              </p>
            ) : (
              <p className="text-sm text-muted">{KIND[title.mediaType]}</p>
            )}
            {next.note && <p className="text-sm text-muted">{next.note}</p>}
            {next.bar && (
              <div className="mt-auto pt-2">
                <div className="h-1 rounded-full bg-raised" role="img" aria-label={next.bar.label}>
                  <div
                    className="bar-fill h-1 rounded-full bg-accent-ink"
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
        <Facts item={item} />
        {user && (item.title.mediaType === 'tv' || item.title.mediaType === 'movie') && item.plex === 'available' ? (
          <ActionsWithPlex item={item} />
        ) : (
          <Actions item={item} />
        )}
      </div>
    </section>
  )
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** A row of plain facts under the card: where to watch, network, latest episode, runtime. Hidden when empty. */
function Facts({ item }: { item: UserItem }) {
  const d = (item.title.details ?? {}) as Record<string, unknown>
  const type = item.title.mediaType
  if (type !== 'tv' && type !== 'movie') return null
  const last = d.last_episode_to_air as { air_date?: string | null } | null | undefined
  const where = item.plex === 'available' ? 'Plex' : item.availableVia?.[0]
  const facts: { k: string; v?: string; mono?: boolean }[] =
    type === 'tv'
      ? [
          { k: 'Watch on', v: where },
          { k: 'Network', v: Array.isArray(d.networks) ? (d.networks as string[])[0] : undefined },
          { k: 'Latest episode', v: last?.air_date ? shortDate(last.air_date) : undefined, mono: true },
        ]
      : [
          { k: 'Watch on', v: where },
          { k: 'Runtime', v: typeof d.runtime === 'number' && d.runtime > 0 ? `${d.runtime} min` : undefined, mono: true },
        ]
  const shown = facts.filter((f) => f.v)
  if (shown.length === 0) return null
  return (
    <dl className="grid border-t border-line" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
      {shown.map((f) => (
        <div key={f.k} className="min-w-0 border-r border-line px-4 py-2 last:border-r-0">
          <dt className="text-xs text-muted">{f.k}</dt>
          <dd className={f.mono ? 'mt-0.5 truncate font-mono text-xs text-fg' : 'mt-0.5 truncate text-sm text-fg'}>{f.v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** On your Plex: ask Seerr for the Plex link, so the card can open it there. */
function ActionsWithPlex({ item }: { item: UserItem }) {
  const seerr = useSeerrStatus(item.title)
  const plexUrl = seerr.data?.configured ? (seerr.data.plexUrl ?? undefined) : undefined
  return <Actions item={item} plexUrl={plexUrl} />
}

const primary = 'grid h-11 flex-1 place-items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:brightness-105 active:scale-[0.98]'
const secondary = 'grid h-11 place-items-center rounded-md border border-line px-4 text-sm text-fg hover:bg-raised'

/**
 * One bold action: Mark watched when that's yours to do, else Open in Plex when it's there, else open the
 * title. A quieter second button covers the next most likely step.
 */
function Actions({ item, plexUrl }: { item: UserItem; plexUrl?: string }) {
  const { user } = useAuth()
  const update = useUpdateItem()
  const { title } = item
  const ep = user ? upNext(item).watchable : null
  const plexLink = (cls: string) => (
    <a href={plexUrl} target="_blank" rel="noreferrer" className={cls}>
      Open in Plex
    </a>
  )
  const details = (cls: string, label: string) => (
    <Link to={`/title/${title.id}`} className={cls}>
      {label}
    </Link>
  )
  return (
    <div className="flex gap-2 border-t border-line px-4 py-3">
      {ep ? (
        <>
          <button
            type="button"
            onClick={() =>
              update(item, { tvProgress: ep }).catch(() => toast({ message: 'Couldn’t save that. Try again.', tone: 'error' }))
            }
            className={primary}
          >
            Mark {episodeCode(ep)} watched
          </button>
          {plexUrl ? plexLink(secondary) : details(secondary, 'Details')}
        </>
      ) : plexUrl ? (
        <>
          {plexLink(primary)}
          {details(secondary, 'Details')}
        </>
      ) : (
        details(primary, `Open ${NOUN[title.mediaType]}`)
      )}
    </div>
  )
}
