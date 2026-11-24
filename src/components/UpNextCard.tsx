import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { steamLaunch, steamStore } from '../lib/steam'
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
 * The top of Home: the best few things to pick up now (see `upNextItems`), each with its next step set large and
 * one bold action. One scrolling row at every width: one card per screen on phones (swipe, or tap the dots),
 * two on mid-size screens and three from about 60rem, with arrow buttons when there are more than fit.
 * Everything else on Home stays quieter than this.
 */
export function UpNext({ items }: { items: UserItem[] }) {
  const row = useRef<HTMLUListElement>(null)
  const [active, setActive] = useState(0)
  const [edges, setEdges] = useState({ start: true, end: true })

  // Which card is first in view, and whether there's more to either side (for the dots and arrows).
  const measure = useCallback(() => {
    const el = row.current
    const cards = el ? ([...el.children] as HTMLElement[]) : []
    if (!el || cards.length === 0) return
    const stride = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : el.clientWidth
    setActive(Math.max(0, Math.min(cards.length - 1, Math.round(el.scrollLeft / stride))))
    setEdges({ start: el.scrollLeft < 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 })
  }, [])

  useEffect(() => {
    const el = row.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, items.length])

  if (items.length === 0) return null

  const scrollToCard = (i: number) => {
    const el = row.current
    const card = el?.children[Math.max(0, Math.min(items.length - 1, i))] as HTMLElement | undefined
    if (!el || !card) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: card.offsetLeft - (el.children[0] as HTMLElement).offsetLeft, behavior: reduce ? 'auto' : 'smooth' })
  }
  // Arrows move by a whole view (as many cards as fit), so nothing is skipped or shown twice.
  const page = (dir: -1 | 1) => {
    const el = row.current
    const cards = el ? ([...el.children] as HTMLElement[]) : []
    if (!el || cards.length < 2) return
    const stride = cards[1].offsetLeft - cards[0].offsetLeft
    const perView = Math.max(1, Math.round((el.clientWidth + (stride - cards[0].offsetWidth)) / stride))
    scrollToCard(active + dir * perView)
  }
  const many = items.length > 1
  const arrow = 'grid size-7 place-items-center rounded-full border border-line text-muted hover:border-accent hover:text-fg disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted'

  return (
    <section aria-labelledby="up-next" className="@container/up space-y-3">
      <div className="flex items-end justify-between gap-4">
        <h1 id="up-next" className="text-xl font-semibold tracking-tight text-fg">
          Up next
        </h1>
        {many && !(edges.start && edges.end) && (
          <div className="hidden gap-1 @[40rem]/up:flex">
            <button type="button" onClick={() => page(-1)} disabled={edges.start} aria-label="Previous cards" className={arrow}>
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => page(1)} disabled={edges.end} aria-label="More cards" className={arrow}>
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
      {/* Card width: the whole row on phones; two per view from 40rem; three from 60rem, never wider than 28rem
          (so very wide screens show three, left-aligned, rather than three stretched ones). */}
      <ul
        ref={row}
        onScroll={measure}
        className="no-scrollbar flex max-w-[calc(3*28rem+2*1rem)] snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain @[40rem]/up:gap-4"
      >
        {items.map((item, i) => (
          <li
            key={item.id}
            aria-label={`${i + 1} of ${items.length}`}
            className="w-full flex-none snap-start snap-always @[40rem]/up:w-[calc((100%-1rem)/2)] @[60rem]/up:w-[calc((100%-2rem)/3)]"
          >
            <UpNextCard item={item} />
          </li>
        ))}
      </ul>
      {many && (
        <div className="flex justify-center gap-1 @[40rem]/up:hidden">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToCard(i)}
              aria-label={`Show ${item.title.title}`}
              aria-current={i === active}
              className="grid size-6 place-items-center"
            >
              <span className={clsx('block h-1.5 rounded-full transition-[width,background-color] duration-200', i === active ? 'w-4 bg-fg' : 'w-1.5 bg-line')} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/** One card: cover, the next step set large, plain facts and the actions. */
function UpNextCard({ item }: { item: UserItem }) {
  const { user } = useAuth()
  const { title } = item
  const next = upNext(item)

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface">
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
      <div className="flex-1" />
      <Facts item={item} />
      {user && (item.title.mediaType === 'tv' || item.title.mediaType === 'movie') && item.plex === 'available' ? (
        <ActionsWithPlex item={item} />
      ) : item.title.mediaType === 'game' && item.title.steamAppId ? (
        <Actions item={item} open={steamStore(item.title.steamAppId)} launch={steamLaunch(item.title.steamAppId)} />
      ) : (
        <Actions item={item} />
      )}
    </div>
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
  return <Actions item={item} open={plexUrl ? { label: 'Open in Plex', href: plexUrl } : undefined} />
}

const primary = 'grid h-11 flex-1 place-items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:brightness-105 active:scale-[0.98]'
const secondary = 'grid h-11 place-items-center rounded-md border border-line px-4 text-sm text-fg hover:bg-raised'

/**
 * One bold action: Mark watched when that's yours to do, else open it where you watch or buy it (Plex, the
 * Steam store page), else open the title. Quieter buttons cover the next most likely steps: Details, and for a
 * Steam game on a computer, Launch (starts it in the Steam app).
 */
function Actions({ item, open, launch }: { item: UserItem; open?: { label: string; href: string }; launch?: { label: string; href: string } }) {
  const { user } = useAuth()
  const update = useUpdateItem()
  const { title } = item
  const ep = user ? upNext(item).watchable : null
  const openLink = (cls: string) =>
    open && (
      <a href={open.href} target={open.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={cls}>
        {open.label}
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
          {open ? openLink(secondary) : details(secondary, 'Details')}
        </>
      ) : open ? (
        <>
          {openLink(primary)}
          {launch && (
            <a href={launch.href} title="Start the game in the Steam app" className="flex h-11 items-center justify-center gap-1.5 rounded-md border border-line px-4 text-sm text-fg hover:bg-raised">
              <Play className="size-3.5 fill-current" aria-hidden="true" />
              {launch.label}
            </a>
          )}
          {details(secondary, 'Details')}
        </>
      ) : (
        details(primary, `Open ${NOUN[title.mediaType]}`)
      )}
    </div>
  )
}
