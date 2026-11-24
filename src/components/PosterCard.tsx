import { memo, ViewTransition } from 'react'
import { statusLabel } from '../lib/statusLabels'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { BookOpen, CalendarClock, Check, CheckCheck, Pause, Film, Radio, Gamepad2, Play, Star, ThumbsDown, ThumbsUp, Tv, type LucideIcon } from 'lucide-react'
import { releaseChip, releaseInfo, releaseLong, tvSchedule, tvScheduleChip, tvScheduleLong } from '../lib/release'
import { chipVisibility, useChipMode, type ChipMode } from '../lib/chips'
import type { MediaType, PlexStatus, UserItem } from '../types'
import { coverProps } from '../lib/images'
import { episodeCode } from '../lib/home'

/** Cards are about half the screen on phones (two columns) and 128–200 px wide elsewhere. */
const POSTER_SIZES = '(max-width: 640px) 45vw, 200px'

const typeIcon: Record<MediaType, LucideIcon> = { movie: Film, tv: Tv, game: Gamepad2, book: BookOpen }

const plexMeta: Record<PlexStatus, { label: string; className: string }> = {
  // Fixed colours: the chip is always dark (on the poster), whichever theme is on.
  available: { label: 'On Plex', className: 'bg-[#9fd38a]' },
  requested: { label: 'Requested', className: 'bg-[#7fb8e8]' },
  missing: { label: 'Not on Plex', className: 'bg-[#9a8e7e]' },
}

function Badge({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className?: string }) {
  return (
    <span
      role="img"
      title={label}
      aria-label={label}
      className={clsx('grid size-6 place-items-center rounded-md bg-black/75 text-white', className)}
    >
      <Icon className="size-3.5" strokeWidth={2.25} />
    </span>
  )
}

/** Placeholder art until real covers are wired up: warm-grey gradient + type icon + title. */
function CoverPlaceholder({ item }: { item: UserItem }) {
  const Icon = typeIcon[item.title.mediaType]
  return (
    <div className="flex size-full flex-col justify-between bg-gradient-to-br from-raised to-surface p-3 pb-9">
      <Icon className="size-5 text-faint" strokeWidth={1.5} />
      <span className="line-clamp-3 text-sm leading-snug font-semibold text-muted">{item.title.title}</span>
    </div>
  )
}

/** TV: where you are, as an episode code (S02E04). */
function episodeLine(item: UserItem): string | undefined {
  return item.tvProgress ? episodeCode(item.tvProgress) : undefined
}

/** The one status badge on a poster, if any. */
function statusBadge(item: UserItem): { icon: LucideIcon; label: string } | null {
  switch (item.progress) {
    case 'in_progress':
      return { icon: Play, label: statusLabel('in_progress', item.title.mediaType) }
    case 'caught_up':
      return { icon: CheckCheck, label: 'Caught up, waiting for new episodes' }
    case 'completed':
      return { icon: Check, label: statusLabel('completed', item.title.mediaType) }
    case 'stalled':
      return { icon: Pause, label: 'Stalled' }
    default:
      return null
  }
}

/** View-transition name shared by a poster and the title page it opens. */
export const posterMorphName = (titleId: string, key?: string) => `poster-${titleId}${key ? `-${key}` : ''}`.replace(/[^\w-]/g, '-')

/** Memoised: a library grid re-renders often (filters, saves) while most cards stay the same. */
export const PosterCard = memo(function PosterCard({
  item,
  className,
  chipMode,
  subline,
  morphKey,
}: {
  item: UserItem
  className?: string
  /** Override the chip display mode; otherwise the user's Display setting applies. */
  chipMode?: ChipMode
  /** Replaces the default line under the year (e.g. Home's "S2 · E5 — out now"). */
  subline?: string
  /** Makes the morph name unique when the same title shows twice on one page (Home rows). */
  morphKey?: string
}) {
  const { title } = item
  const savedMode = useChipMode()
  const chipClass = chipVisibility(chipMode ?? savedMode)
  /** Visibility classes for chips, or null when chips are hidden. One global setting for all chip types. */
  const vis = (_key: string) => chipClass
  // Games you don't own: cheapest price, or Free-To-Play. (An unreleased game shows its release chip instead.)
  const isFree = title.mediaType === 'game' && !!item.gamePrice?.isFree
  const showPrice = title.mediaType === 'game' && !item.owned && (item.price || isFree)
  const showPlex = (title.mediaType === 'movie' || title.mediaType === 'tv') && item.plex
  const release = releaseInfo(title)
  const schedule = release.preRelease ? null : tvSchedule(title)
  const episode = subline ? undefined : episodeLine(item)
  const secondary = subline ?? (episode ? undefined : title.byline)
  const owned = item.owned && (title.mediaType === 'game' || title.mediaType === 'book')
  const status = statusBadge(item)
  const opinion = item.favourite
    ? { icon: Star, label: 'All-time favourite', className: '!bg-accent !text-accent-fg' }
    : item.verdict === 'liked'
      ? { icon: ThumbsUp, label: 'Liked', className: '!text-good' }
      : item.verdict === 'disliked'
        ? { icon: ThumbsDown, label: 'Didn’t like', className: '!text-bad' }
        : null
  const anyBottom =
    (showPrice && !release.preRelease) ||
    release.preRelease ||
    !!schedule ||
    (title.mediaType === 'game' && title.details?.early_access === true) ||
    !!showPlex

  // The poster morphs into the title page's poster (and back). The title page reads the name from link state.
  const morph = posterMorphName(title.id, morphKey)

  return (
    <Link to={`/title/${title.id}`} state={{ morph }} className={clsx('group block', className)}>
      <ViewTransition name={morph} share="poster-morph" default="none">
      <div className="@container/poster relative aspect-[2/3] overflow-hidden rounded-lg border border-line bg-raised transition group-hover:border-accent group-focus-visible:border-accent">
        {title.coverUrl ? (
          <img
            {...coverProps(title.coverUrl, POSTER_SIZES)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 ease-[var(--ease-out)] group-hover:scale-[1.02]"
          />
        ) : (
          <CoverPlaceholder item={item} />
        )}

        {/* At most two badges: your status (Playing, Caught up, Finished, Stalled) and your opinion (favourite
            beats liked / didn't like). "Owned" is in words under the title instead of one more icon. */}
        <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
          {status && vis('status') !== null && <Badge icon={status.icon} label={status.label} className={vis('status')!} />}
          {opinion && vis('rating') !== null && (
            <Badge icon={opinion.icon} label={opinion.label} className={clsx(opinion.className, vis('rating'))} />
          )}
        </div>

        {/* Headline review score */}
        {title.score && vis('score') !== null && (
          <span
            className={clsx(
              'absolute top-1.5 right-1.5 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white',
              vis('score'),
            )}
          >
            <span className="hidden text-white/55 sm:inline">{title.score.label} </span>
            {title.score.value}
          </span>
        )}

        {/* Bottom chips share one row: left (price / countdown / schedule) and right (Early Access / Plex).
            When they don't fit side by side, the right one wraps upward instead of overlapping. */}
        {anyBottom && vis('release') !== null && (
          <>
            {/* Soft gradient behind bottom chips, for readability (follows the labels setting). */}
            <div className={clsx('pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 via-black/25 to-transparent', vis('release'))} />
            <div className="absolute inset-x-1.5 bottom-1.5 flex flex-wrap-reverse items-end justify-between gap-1">
              <div className="flex min-w-0 flex-col items-start gap-1">
        {/* Price — games the user doesn't own yet */}
                {showPrice && !release.preRelease && vis('price') !== null && (
                  <span
                    title={item.price?.atLow ? 'Historical low' : undefined}
                    className={clsx(
                      'flex overflow-hidden rounded-md font-mono text-[11px] font-semibold',
                      vis('price'),
                    )}
                  >
                    {isFree ? (
                      <span className="bg-black/75 px-1.5 py-0.5 font-sans text-good">Free</span>
                    ) : (
                      <>
                        {item.price!.discountPct ? (
                          <span className="bg-accent px-1.5 py-0.5 text-accent-fg">-{item.price!.discountPct}%</span>
                        ) : null}
                        <span className="bg-black/75 px-1.5 py-0.5 text-white">{item.price!.amount}</span>
                        {item.price!.atLow && <span className="bg-good px-1 py-0.5 font-sans text-accent-fg">Low</span>}
                      </>
                    )}
                  </span>
                )}

                {/* Pre-release countdown (movies/TV); bottom-left is free for them — games use it for price. */}
                {release.preRelease && vis('release') !== null && (
                  <span
                    title={releaseLong(release)}
                    className={clsx(
                      'flex items-center gap-1 rounded-md border border-accent/70 bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-accent',
                      vis('release'),
                    )}
                  >
                    <CalendarClock className="size-3" />
                    {releaseChip(release)}
                  </span>
                )}

                {/* TV schedule: airing (blue) or new season coming (yellow). */}
                {schedule && vis('release') !== null && (
                  <span
                    title={tvScheduleLong(schedule)}
                    className={clsx(
                      'flex items-center gap-1 rounded-md border bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold',
                      schedule.kind === 'airing' ? 'border-info/70 text-info' : 'border-accent/70 text-accent',
                      vis('release'),
                    )}
                  >
                    {schedule.kind === 'airing' ? <Radio className="size-3" /> : <CalendarClock className="size-3" />}
                    {tvScheduleChip(schedule)}
                  </span>
                )}

              </div>
              <div className="ml-auto flex flex-col items-end gap-1">
        {/* Early Access (games): bottom-right is free on game posters (Plex dots are movies/TV only). */}
                {title.mediaType === 'game' && title.details?.early_access === true && vis('release') !== null && (
                  <span
                    title="Early Access — not at 1.0 yet"
                    className={clsx(
                      'rounded-md border border-orange-300/70 bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-orange-300',
                      vis('release'),
                    )}
                  >
                    {/* Very narrow posters (phone rows): the short form. */}
                    <span className="@[8.5rem]/poster:hidden">EA</span>
                    <span className="hidden @[8.5rem]/poster:inline">Early access</span>
                  </span>
                )}

                {/* Plex availability */}
                {showPlex && vis('plex') !== null && (
                  <span
                    title={plexMeta[item.plex!].label}
                    className={clsx(
                      'flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white',
                      vis('plex'),
                    )}
                  >
                    {/* Words, not just the dot's colour: "On Plex", "Requested", "Not on Plex". */}
                    <span className={clsx('size-2 shrink-0 rounded-full', plexMeta[item.plex!].className)} />
                    {plexMeta[item.plex!].label}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      </ViewTransition>

      <div className="mt-2 px-0.5">
        <p className="truncate text-sm font-medium text-fg">{title.title}</p>
        {/* Numbers in mono, words in the text face; spacing instead of separator dots. */}
        <p className="flex min-w-0 items-baseline gap-2 truncate text-xs text-muted">
          {episode ? (
            <span className="font-mono text-fg">{episode}</span>
          ) : (
            title.year != null && <span className="font-mono">{title.year}</span>
          )}
          {/* The author / studio needs more room than a 3-across phone grid has. */}
          {secondary && <span className={clsx('truncate', !subline && 'hidden sm:inline')}>{secondary}</span>}
          {owned && <span>Owned</span>}
        </p>
      </div>
    </Link>
  )
})
