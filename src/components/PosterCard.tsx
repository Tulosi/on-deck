import { Price } from './Price'
import { memo, ViewTransition } from 'react'
import { statusLabel } from '../lib/statusLabels'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { BookOpen, CalendarClock, Film, Radio, Gamepad2, Star, ThumbsDown, ThumbsUp, Tv, type LucideIcon } from 'lucide-react'
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

/**
 * No cover yet: a warm-grey panel with the type's icon. The title isn't repeated here, since the caption under the
 * poster shows it (in full, on two lines, when there's no cover).
 */
function CoverPlaceholder({ item }: { item: UserItem }) {
  const Icon = typeIcon[item.title.mediaType]
  return (
    <div className="grid size-full place-items-center bg-gradient-to-br from-raised to-surface pb-6">
      <Icon className="size-8 text-faint" strokeWidth={1.25} aria-hidden="true" />
    </div>
  )
}

/** TV: where you are, as an episode code (S02E04). */
function episodeLine(item: UserItem): string | undefined {
  return item.tvProgress ? episodeCode(item.tvProgress) : undefined
}

/**
 * Status in words under the poster (not as an icon on it): only the states worth a glance. Want-to and Dropped
 * stay quiet, since most of a library is waiting to be started.
 */
function statusWord(item: UserItem): string | null {
  switch (item.progress) {
    case 'in_progress':
    case 'caught_up':
    case 'stalled':
    case 'completed':
      return statusLabel(item.progress, item.title.mediaType)
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
  showDeal,
}: {
  item: UserItem
  className?: string
  /** Override the chip display mode; otherwise the user's Display setting applies. */
  chipMode?: ChipMode
  /** Replaces the default line under the year (e.g. Home's "S2 · E5 — out now"). */
  subline?: string
  /** Makes the morph name unique when the same title shows twice on one page (Home rows). */
  morphKey?: string
  /** A deals view (On sale / Historical low filter): show the price chip even on games you own. */
  showDeal?: boolean
}) {
  const { title } = item
  const savedMode = useChipMode()
  const chipClass = chipVisibility(chipMode ?? savedMode)
  /** Visibility classes for chips (one global setting for all chip types). */
  const vis = (_key: string) => chipClass
  // Games you don't own (or any game, in a deals view): cheapest price, or Free-To-Play. (An unreleased game
  // shows its release chip instead.)
  const isFree = title.mediaType === 'game' && !!item.gamePrice?.isFree
  const showPrice = title.mediaType === 'game' && (!item.owned || showDeal) && (item.price || isFree)
  const showPlex = (title.mediaType === 'movie' || title.mediaType === 'tv') && item.plex
  const release = releaseInfo(title)
  const schedule = release.preRelease ? null : tvSchedule(title)
  const episode = subline ? undefined : episodeLine(item)
  const secondary = subline ?? (episode ? undefined : title.byline)
  const owned = item.owned && (title.mediaType === 'game' || title.mediaType === 'book')
  // Home rows pass their own subline, which already says why the title is there.
  // An episode code already says "in progress", so the word only adds length there.
  const status = subline || (episode && item.progress === 'in_progress') ? null : statusWord(item)
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

        {/* One mark at most: your opinion (favourite beats liked / didn't like). Status and "Owned" are in words
            under the title. */}
        {opinion && (
          <div className="absolute top-1.5 left-1.5">
            <Badge icon={opinion.icon} label={opinion.label} className={clsx(opinion.className, vis('rating'))} />
          </div>
        )}

        {/* Headline review score */}
        {title.score && (
          <span
            className={clsx(
              'absolute top-1.5 right-1.5 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white',
              vis('score'),
            )}
          >
            {/* The source stays on phones too; on narrow posters Hardcover's long name becomes a star. */}
            <span className="font-sans text-white/55">
              {title.score.label === 'Hardcover' ? (
                <>
                  <span className="@[8.5rem]/poster:hidden">★</span>
                  <span className="hidden @[8.5rem]/poster:inline">Hardcover</span>
                </>
              ) : (
                title.score.label
              )}{' '}
            </span>
            {title.score.value}
          </span>
        )}

        {/* Bottom chips share one row: left (price / countdown / schedule) and right (Early Access / Plex).
            When they don't fit side by side, the right one wraps upward instead of overlapping. */}
        {anyBottom && (
          <>
            {/* Soft gradient behind bottom chips, for readability (follows the labels setting). */}
            {/* Only over real art: on a blank placeholder it just reads as a grey smudge (light theme especially). */}
            {title.coverUrl && (
              <div className={clsx('pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 via-black/25 to-transparent', vis('release'))} />
            )}
            <div className="@container/chips absolute inset-x-1.5 bottom-1.5 flex flex-wrap-reverse items-end justify-between gap-1">
              <div className="flex min-w-0 flex-col items-start gap-1">
        {/* Price — games the user doesn't own yet */}
                {showPrice && !release.preRelease && (
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
                        {/* Narrow posters get slimmer padding, so the whole tag fits more often. */}
                        {item.price!.discountPct ? (
                          <span className="bg-accent px-1 py-0.5 text-accent-fg @[7rem]/chips:px-1.5">-{item.price!.discountPct}%</span>
                        ) : null}
                        <span className="bg-black/75 px-1 py-0.5 text-white @[7rem]/chips:px-1.5">
                          <Price>{item.price!.amount}</Price>
                        </span>
                        {/* Narrow posters (phone grids): "Low" becomes a dot so the tag stays inside the poster. */}
                        {item.price!.atLow && (
                          <span className="flex items-center bg-good px-1 py-0.5 font-sans text-accent-fg">
                            <span aria-hidden="true" className="hidden @[7rem]/chips:inline">Low</span>
                            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-fg @[7rem]/chips:hidden" />
                            <span className="sr-only">Historical low</span>
                          </span>
                        )}
                      </>
                    )}
                  </span>
                )}

                {/* Pre-release countdown (movies/TV); bottom-left is free for them — games use it for price. */}
                {release.preRelease && (
                  <span
                    title={releaseLong(release)}
                    className={clsx(
                      'flex items-center gap-1 rounded-md border border-accent/70 bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-accent',
                      vis('release'),
                    )}
                  >
                    <CalendarClock className="size-3" />
                    {releaseChip(release)}
                  </span>
                )}

                {/* TV schedule: airing (blue) or new season coming (yellow). */}
                {schedule && (
                  <span
                    title={tvScheduleLong(schedule)}
                    className={clsx(
                      'flex items-center gap-1 rounded-md border bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                      // Fixed blue: the chip is always dark, so the light theme's deep blue would vanish on it.
                      schedule.kind === 'airing' ? 'border-[#7fb8e8]/70 text-[#7fb8e8]' : 'border-accent/70 text-accent',
                      vis('release'),
                    )}
                  >
                    {/* Narrow posters drop the icon so the words fit; the chip's colour still says which kind it is. */}
                    {schedule.kind === 'airing' ? (
                      <Radio className="hidden size-3 @[8.5rem]/poster:block" />
                    ) : (
                      <CalendarClock className="hidden size-3 @[8.5rem]/poster:block" />
                    )}
                    {/* One line always: the short form on narrow posters, the full one when there's room. */}
                    <span className="@[8.5rem]/poster:hidden">{tvScheduleChip(schedule, true)}</span>
                    <span className="hidden @[8.5rem]/poster:inline">{tvScheduleChip(schedule)}</span>
                  </span>
                )}

              </div>
              <div className="ml-auto flex flex-col items-end gap-1">
        {/* Early Access (games): bottom-right is free on game posters (Plex dots are movies/TV only). */}
                {title.mediaType === 'game' && title.details?.early_access === true && (
                  <span
                    title="Early access: not at 1.0 yet"
                    className={clsx(
                      'rounded-md border border-orange-300/70 bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-orange-300',
                      vis('release'),
                    )}
                  >
                    {/* Spelled out at every size ("EA" was a puzzle); if the row is full, the chips wrap upward. */}
                    Early access
                  </span>
                )}

                {/* Plex availability */}
                {showPlex && (
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
        {/* With no cover the caption is the only place the name shows, so it gets two lines instead of one. */}
        <p className={clsx('text-sm font-medium text-fg', title.coverUrl ? 'truncate' : 'line-clamp-2 break-words')}>{title.title}</p>
        {/* Numbers in mono, words in the text face; spacing instead of separator dots. */}
        {/* At most three short pieces, so nothing gets squeezed to a sliver: the status word takes the place of the
            author / studio, and when room runs out it ends in "…" instead of being cut. */}
        <p className="flex min-w-0 items-baseline gap-2 overflow-hidden text-xs whitespace-nowrap text-muted">
          {episode ? (
            <span className="shrink-0 font-mono text-fg">{episode}</span>
          ) : (
            title.year != null && <span className="shrink-0 font-mono">{title.year}</span>
          )}
          {status && <span className="min-w-0 truncate">{status}</span>}
          {/* The author / studio needs more room than a 3-across phone grid has. */}
          {secondary && !status && <span className={clsx('min-w-0 truncate', !subline && 'hidden sm:inline')}>{secondary}</span>}
          {/* Narrow phone grids: the status word wins the room. */}
          {owned && <span className={clsx('shrink-0', status && 'hidden sm:inline')}>Owned</span>}
        </p>
      </div>
    </Link>
  )
})
