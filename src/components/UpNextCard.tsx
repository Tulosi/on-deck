import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
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
import { markWatched } from '../lib/markWatched'
import { statusLabel } from '../lib/statusLabels'
import type { MediaType } from '../types'

const NOUN: Record<MediaType, string> = { movie: 'movie', tv: 'show', game: 'game', book: 'book' }
const KIND: Record<MediaType, string> = { movie: 'Movie', tv: 'TV show', game: 'Game', book: 'Book' }

/**
 * The top of Home: the best few things to pick up now (see `upNextItems`), each with its next step set large and
 * one bold action. One scrolling row at every width: one card per screen on phones (swipe, or tap the dots),
 * two on mid-size screens and three from about 60rem, with arrow buttons when there are more than fit.
 * Everything else on Home stays quieter than this.
 */
/** Horizontal mask: fades the row's left and/or right 3rem. */
const fade = (left: boolean, right: boolean) =>
  `linear-gradient(to right, ${left ? 'transparent, black 3rem' : 'black'}, ${right ? 'black calc(100% - 3rem), transparent' : 'black'})`

export function UpNext({ items }: { items: UserItem[] }) {
  const row = useRef<HTMLUListElement>(null)
  const [active, setActive] = useState(0)
  const [edges, setEdges] = useState({ start: true, end: true })
  const drag = useRef<{ id: number; x: number; left: number; moved: boolean; from: number; samples: { t: number; x: number }[] } | null>(null)
  const swallowClick = useRef(false)
  /** Cancels a pending "snapping back on" from the last release, so it can't fire during the next drag. */
  const pendingRestore = useRef<(() => void) | null>(null)
  useEffect(() => () => pendingRestore.current?.(), [])

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
  /**
   * Mouse drag (touch scrolls natively): the row follows the pointer with snapping paused, then settles on the
   * nearest card. A quick flick moves one card on from where the drag started. A drag never counts as a click.
   */
  const onPointerDown = (e: PointerEvent<HTMLUListElement>) => {
    const el = row.current
    swallowClick.current = false
    if (e.pointerType !== 'mouse' || e.button !== 0 || !el || el.scrollWidth <= el.clientWidth + 1) return
    drag.current = { id: e.pointerId, x: e.clientX, left: el.scrollLeft, moved: false, from: active, samples: [{ t: e.timeStamp, x: e.clientX }] }
  }
  const onPointerMove = (e: PointerEvent<HTMLUListElement>) => {
    const d = drag.current
    const el = row.current
    if (!d || !el || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    if (!d.moved) {
      if (Math.abs(dx) < 5) return
      d.moved = true
      el.setPointerCapture(e.pointerId)
      pendingRestore.current?.()
      pendingRestore.current = null
      el.style.scrollSnapType = 'none'
      el.style.scrollBehavior = 'auto'
      el.dataset.dragging = ''
    }
    el.scrollLeft = d.left - dx
    d.samples.push({ t: e.timeStamp, x: e.clientX })
    if (d.samples.length > 8) d.samples.shift()
  }
  const endDrag = (e: PointerEvent<HTMLUListElement>) => {
    const d = drag.current
    const el = row.current
    if (!d || !el || d.id !== e.pointerId) return
    drag.current = null
    if (!d.moved) return
    swallowClick.current = true
    delete el.dataset.dragging
    const cards = [...el.children] as HTMLElement[]
    const stride = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : el.clientWidth
    // Release speed over the last few moves (px/ms); positive = pointer moving right = going back.
    const recent = d.samples.filter((s) => e.timeStamp - s.t < 100)
    const v = recent.length > 1 ? (recent[recent.length - 1].x - recent[0].x) / Math.max(1, recent[recent.length - 1].t - recent[0].t) : 0
    let target = Math.round(el.scrollLeft / stride)
    if (Math.abs(v) > 0.3 && target === d.from) target = d.from + (v < 0 ? 1 : -1)
    scrollToCard(target)
    // Snapping back on once the glide has finished (or it would cut the glide short). A release that doesn't move
    // the row has no glide and no scrollend, so a timer covers that (and browsers without scrollend). Never while
    // a new drag is under way: that's what made some drags rigid, stepping only between cards.
    const cancel = () => {
      el.removeEventListener('scrollend', done)
      clearTimeout(timer)
    }
    function done() {
      cancel()
      if (pendingRestore.current === cancel) pendingRestore.current = null
      if (drag.current?.moved) return
      el!.style.scrollSnapType = ''
      el!.style.scrollBehavior = ''
    }
    el.addEventListener('scrollend', done)
    const timer = setTimeout(done, 700)
    pendingRestore.current = cancel
  }

  const many = items.length > 1
  const scrollable = !(edges.start && edges.end)
  const arrow = 'grid size-7 place-items-center rounded-full border border-line text-muted hover:border-accent hover:text-fg disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted'

  return (
    // Capped at three cards' width, so the arrows sit at the cards' right edge rather than the far side of a wide
    // screen.
    <section aria-labelledby="up-next" className="@container/up max-w-[calc(3*28rem+2*1rem)] space-y-3">
      <div className="flex items-end justify-between gap-4">
        <h1 id="up-next" className="text-xl font-semibold tracking-tight text-fg">
          Up next
        </h1>
        {many && scrollable && (
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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (swallowClick.current) {
            swallowClick.current = false
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        // Links and covers would otherwise start the browser's own drag-and-drop.
        onDragStart={(e) => e.preventDefault()}
        // The peeking card fades out at the edge(s) with more beyond.
        style={scrollable ? { maskImage: fade(!edges.start, !edges.end), WebkitMaskImage: fade(!edges.start, !edges.end) } : undefined}
        className={clsx(
          'no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain select-none @[40rem]/up:gap-4',
          // A mouse can grab the row when there's more than fits.
          scrollable && 'pointer-fine:cursor-grab data-[dragging]:cursor-grabbing',
        )}
      >
        {items.map((item, i) => (
          <li
            key={item.id}
            aria-label={`${i + 1} of ${items.length}`}
            // When more cards follow than fit, each view leaves ~3rem for a slice of the next one (faded below).
            className={clsx(
              'flex-none snap-start snap-always',
              items.length > 1 ? 'w-[calc(100%-3.25rem)]' : 'w-full',
              items.length > 2 ? '@[40rem]/up:w-[calc((100%-5rem)/2)]' : '@[40rem]/up:w-[calc((100%-1rem)/2)]',
              items.length > 3 ? '@[60rem]/up:w-[calc((100%-5rem)/3)]' : '@[60rem]/up:w-[calc((100%-2rem)/3)]',
            )}
          >
            {/* The first card is the pick: only its main button is lemon, the rest read as alternatives. */}
            <UpNextCard item={item} lead={i === 0} />
          </li>
        ))}
      </ul>
      {many && (
        <div className="flex justify-center @[40rem]/up:hidden">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToCard(i)}
              aria-label={`Show ${item.title.title}`}
              aria-current={i === active}
              className="grid h-11 w-8 place-items-center"
            >
              <span className={clsx('block h-1.5 rounded-full transition-[width,background-color] duration-200', i === active ? 'w-4 bg-fg' : 'w-1.5 bg-line')} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Books have no next step to count (no page tracking), so their card says where you are in words and what there is
 * to know: length, author, and whether you own it. Keeps a book card from being a cover and the word "Book".
 */
function bookFacts(item: UserItem) {
  const d = (item.title.details ?? {}) as Record<string, unknown>
  const pages = typeof d.pages === 'number' && d.pages > 0 ? `${d.pages} pages` : undefined
  return {
    where: item.progress === 'in_progress' ? 'Reading' : statusLabel(item.progress, 'book'),
    about: [pages, item.title.byline].filter(Boolean).join(', ') || undefined,
    owned: item.owned,
  }
}

/** Movies: the length, set large like an episode code, and where you are. Runtime moves up here from the facts row. */
function movieFacts(item: UserItem) {
  const d = (item.title.details ?? {}) as Record<string, unknown>
  const runtime = typeof d.runtime === 'number' && d.runtime > 0 ? d.runtime : null
  return {
    length: runtime ? `${Math.floor(runtime / 60)}h ${runtime % 60}m` : undefined,
    about: [statusLabel(item.progress, 'movie'), item.title.year].filter(Boolean).join(', ') || undefined,
  }
}

/** One card: cover, the next step set large, plain facts and the actions. */
function UpNextCard({ item, lead }: { item: UserItem; lead: boolean }) {
  const { user } = useAuth()
  const { title } = item
  const next = upNext(item)
  const book = title.mediaType === 'book' && !next.value ? bookFacts(item) : null
  const movie = title.mediaType === 'movie' && !next.value ? movieFacts(item) : null

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
          <Link to={`/title/${title.id}`} className="hit truncate text-base font-semibold text-fg hover:underline">
            {title.title}
          </Link>
          {next.value ? (
            <p className="font-mono text-3xl leading-tight font-medium tracking-tight text-fg">
              <RollingText text={next.value} />
            </p>
          ) : book ? (
            <>
              <p className="text-3xl leading-tight font-semibold tracking-tight text-fg">{book.where}</p>
              {book.about && <p className="text-sm text-muted">{book.about}</p>}
              {book.owned && <p className="text-sm text-good">In your library</p>}
            </>
          ) : movie ? (
            <>
              <p className="font-mono text-3xl leading-tight font-medium tracking-tight text-fg">{movie.length ?? 'Movie'}</p>
              {movie.about && <p className="text-sm text-muted">{movie.about}</p>}
            </>
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
        <ActionsWithPlex item={item} lead={lead} />
      ) : item.title.mediaType === 'game' && item.title.steamAppId ? (
        <Actions item={item} lead={lead} open={steamStore(item.title.steamAppId)} launch={steamLaunch(item.title.steamAppId)} />
      ) : (
        <Actions item={item} lead={lead} />
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
      : [{ k: 'Watch on', v: where }] // the runtime is set large at the top of a movie card
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
function ActionsWithPlex({ item, lead }: { item: UserItem; lead: boolean }) {
  const seerr = useSeerrStatus(item.title)
  const plexUrl = seerr.data?.configured ? (seerr.data.plexUrl ?? undefined) : undefined
  return <Actions item={item} lead={lead} open={plexUrl ? { label: 'Open in Plex', href: plexUrl } : undefined} />
}

const lemon = 'grid h-11 flex-1 place-items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:brightness-105 active:scale-[0.98]'
const secondary = 'grid h-11 place-items-center rounded-md border border-line px-4 text-sm text-fg hover:bg-raised'
/** The main action on cards after the first: same size and place, outlined instead of lemon. */
const quietMain = 'grid h-11 flex-1 place-items-center rounded-md border border-line px-4 text-sm font-medium text-fg hover:bg-raised active:scale-[0.98]'

/**
 * One bold action: Mark watched when that's yours to do, else open it where you watch or buy it (Plex, the
 * Steam store page), else open the title. Quieter buttons cover the next most likely steps: Details, and for a
 * Steam game on a computer, Launch (starts it in the Steam app).
 */
function Actions({
  item,
  lead,
  open,
  launch,
}: {
  item: UserItem
  lead: boolean
  open?: { label: string; href: string }
  launch?: { label: string; href: string }
}) {
  const primary = lead ? lemon : quietMain
  const update = useUpdateItem()
  const { title } = item
  // Signed out, this marks the sample (the sandbox), so it works there too.
  const ep = upNext(item).watchable
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
            onClick={() => markWatched(update, item, ep)}
            aria-label={`Mark ${episodeCode(ep)} watched`}
            className={clsx(primary, 'whitespace-nowrap')}
          >
            {/* Phones: the season is on the card already, so the label keeps to one line with just the episode. */}
            <span className="sm:hidden">Mark {episodeCode(ep).slice(3)} watched</span>
            <span className="hidden sm:inline">Mark {episodeCode(ep)} watched</span>
          </button>
          {open ? openLink(secondary) : details(secondary, 'Details')}
        </>
      ) : open ? (
        <>
          {openLink(primary)}
          {launch && (
            <a href={launch.href} title="Start the game in the Steam app" className="flex h-11 items-center justify-center gap-1.5 rounded-md border border-line px-4 text-sm text-fg hover:bg-raised">
              <Play className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
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
