import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { BookOpen, Film, Gamepad2, Star, ThumbsDown, ThumbsUp, Tv, type LucideIcon } from 'lucide-react'
import { upNext } from '../lib/home'
import { hoursToBeat } from '../lib/filters'
import { markWatched } from '../lib/markWatched'
import { useUpdateItem } from '../lib/library'
import { episodeCode, releaseInfo, releaseLong } from '../lib/release'
import { seasonsOf } from '../lib/seasons'
import { statusLabel } from '../lib/statusLabels'
import type { MediaType, UserItem } from '../types'

const typeIcon: Record<MediaType, LucideIcon> = { movie: Film, tv: Tv, game: Gamepad2, book: BookOpen }

interface Line {
  /** Where you are: a number in mono ("S02E05", "12h", "2h 46m"), or for books the status in words. */
  where?: string
  /** `where` is words, not a number (books), so it's set in the text face. */
  words?: boolean
  /** What happens next, or what's stopping you ("Out now", "On Plex", "$22.49, 25% off"). */
  next?: string
  /** Lit when `next` is something you can act on now. */
  ready?: boolean
  bar?: { done: number; total: number; label: string }
  /** One-tap step, when there is one. */
  mark?: { season: number; episode: number } | null
}

const h = (n: number) => `${Math.round(n)}h`

/** The progress line for one title: where you are, what's next, and how far through. */
function lineFor(item: UserItem): Line {
  const { title, progress } = item
  const d = (title.details ?? {}) as Record<string, unknown>
  const rel = releaseInfo(title)
  // Not out yet: the date is the whole story (a fuzzy one stays short: "Q2 2027").
  if (rel.preRelease) return { where: '—', next: rel.fuzzyLabel ?? releaseLong(rel) }

  if (title.mediaType === 'tv') {
    if (progress === 'in_progress' || progress === 'caught_up') {
      const u = upNext(item)
      return {
        where: u.value ?? (item.tvProgress ? episodeCode(item.tvProgress) : undefined),
        next: u.note,
        ready: u.note === 'Out now',
        bar: u.bar,
        mark: u.watchable,
      }
    }
    const n = seasonsOf(item).length
    return {
      where: n ? `${n} season${n === 1 ? '' : 's'}` : undefined,
      next: plexLine(item),
      ready: item.plex === 'available',
    }
  }
  if (title.mediaType === 'movie') {
    const runtime = typeof d.runtime === 'number' && d.runtime > 0 ? d.runtime : null
    return {
      where: runtime ? `${Math.floor(runtime / 60)}h ${runtime % 60}m` : undefined,
      next: progress === 'wanted' ? plexLine(item) : undefined,
      ready: progress === 'wanted' && item.plex === 'available',
    }
  }
  if (title.mediaType === 'game') {
    const beat = hoursToBeat(item)
    const played = item.steamPlaytimeMinutes ? item.steamPlaytimeMinutes / 60 : 0
    if (played) return { where: h(played), next: beat ? `of about ${h(beat)}` : 'played', bar: beat ? { done: Math.min(played, beat), total: beat, label: `${h(played)} of about ${h(beat)}` } : undefined }
    const price = !item.owned && item.price ? `${item.price.amount}${item.price.discountPct ? `, ${item.price.discountPct}% off` : ''}` : undefined
    return { where: beat ? `~${h(beat)}` : undefined, next: item.owned ? 'In your library' : price, ready: item.owned || !!item.price?.atLow }
  }
  // Books: progress is the status itself ("Reading it", "Read it").
  return { where: statusLabel(progress, 'book'), words: true, next: item.owned ? 'In your library' : undefined, ready: item.owned }
}

function plexLine(item: UserItem): string | undefined {
  if (item.plex === 'available') return 'On Plex'
  if (item.plex === 'requested') return 'Requested on Plex'
  if (item.plex === 'missing') return 'Not on Plex'
  return undefined
}

function MarkButton({ ep, title, onClick, className }: { ep: { season: number; episode: number }; title: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Mark ${episodeCode(ep)} of ${title} watched`}
      className={clsx('hit relative z-10 h-8 shrink-0 rounded-md border border-line bg-surface px-2.5 text-xs text-fg hover:border-accent md:h-7', className)}
    >
      Mark {episodeCode(ep).slice(3)}
    </button>
  )
}

/**
 * Library as a ledger: one dense row per title, led by where you are and what's next rather than the cover.
 * Desktop: icon, title, where, next, a thin bar, and the one-tap step. Phone: title and next on the left, where (and
 * the step) on the right, the bar underneath. The whole row opens the title.
 */
export function ProgressRows({ items }: { items: UserItem[] }) {
  const update = useUpdateItem()
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {items.map((item) => {
        const { title } = item
        const line = lineFor(item)
        const Icon = typeIcon[title.mediaType]
        const opinion = item.favourite ? Star : item.verdict === 'liked' ? ThumbsUp : item.verdict === 'disliked' ? ThumbsDown : null
        const OpinionIcon = opinion
        return (
          <li
            key={item.id}
            className="group relative grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 hover:bg-raised/50 sm:px-4 md:grid-cols-[1rem_minmax(0,1fr)_6.5rem_minmax(0,11rem)_7rem_5.5rem]"
          >
            <Icon className="size-4 text-faint" strokeWidth={1.75} />

            <div className="min-w-0">
              {/* The whole row opens the title (the link's ::after covers it); the Mark button sits above. */}
              <Link
                to={`/title/${title.id}`}
                className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-fg group-hover:underline after:absolute after:inset-0"
              >
                <span className="truncate">{title.title}</span>
                {OpinionIcon && (
                  <OpinionIcon
                    aria-label={item.favourite ? 'Favourite' : item.verdict === 'liked' ? 'Liked' : 'Didn’t like'}
                    className={clsx('size-3.5 shrink-0', item.favourite ? 'fill-accent text-accent' : item.verdict === 'liked' ? 'text-good' : 'text-bad')}
                  />
                )}
              </Link>
              {/* Phone: what's next sits under the title. */}
              <p className={clsx('truncate text-xs md:hidden', line.ready ? 'text-good' : 'text-muted')}>{line.next ?? title.byline ?? ' '}</p>
              <p className="hidden truncate text-xs text-muted md:block">{title.byline ?? title.year ?? ' '}</p>
            </div>

            <div className="flex items-center justify-end gap-3 md:justify-start">
              <p className={clsx('text-sm text-fg', line.words ? 'whitespace-nowrap' : 'font-mono tabular-nums')}>{line.where ?? ''}</p>
              {/* Phone: the one-tap step sits beside where you are. */}
              {line.mark && <MarkButton className="md:hidden" onClick={() => markWatched(update, item, line.mark!)} ep={line.mark} title={title.title} />}
            </div>

            <p className={clsx('hidden truncate text-xs md:block', line.ready ? 'text-good' : 'text-muted')}>{line.next ?? ''}</p>

            {/* Thin bar: under the row on phones, its own column on wider screens. */}
            <div className={clsx('col-span-2 col-start-2 md:col-span-1 md:col-start-auto', !line.bar && 'max-md:hidden')}>
              {line.bar && (
                <div
                  role="img"
                  aria-label={line.bar.label}
                  className="h-1 overflow-hidden rounded-full bg-line"
                >
                  <div className="h-full rounded-full bg-fg/70" style={{ width: `${Math.round((line.bar.done / line.bar.total) * 100)}%` }} />
                </div>
              )}
            </div>

            <div className="hidden justify-end md:flex">
              {line.mark && <MarkButton onClick={() => markWatched(update, item, line.mark!)} ep={line.mark} title={title.title} />}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
