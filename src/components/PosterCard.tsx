import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { BookOpen, CalendarClock, Check, Film, Radio, Gamepad2, Library, Play, Star, ThumbsDown, ThumbsUp, Tv, type LucideIcon } from 'lucide-react'
import { releaseChip, releaseInfo, releaseLong, tvSchedule, tvScheduleChip, tvScheduleLong } from '../lib/release'
import { chipVisibility, useChipMode, type ChipMode } from '../lib/chips'
import type { MediaType, PlexStatus, UserItem } from '../types'

const typeIcon: Record<MediaType, LucideIcon> = { movie: Film, tv: Tv, game: Gamepad2, book: BookOpen }

const plexMeta: Record<PlexStatus, { label: string; className: string }> = {
  available: { label: 'On Plex', className: 'bg-good' },
  requested: { label: 'Requested', className: 'bg-info' },
  missing: { label: 'Not on Plex', className: 'bg-faint' },
}

function Badge({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className?: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      className={clsx('grid size-6 place-items-center rounded-md bg-black/65 text-white backdrop-blur-sm', className)}
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

function secondaryLine(item: UserItem): string | undefined {
  if (item.tvProgress) return `S${item.tvProgress.season} · E${item.tvProgress.episode}`
  return item.title.byline
}

export function PosterCard({
  item,
  className,
  chipMode,
  subline,
}: {
  item: UserItem
  className?: string
  /** Override the chip display mode; otherwise the user's Display setting applies. */
  chipMode?: ChipMode
  /** Replaces the default line under the year (e.g. Home's "S2 · E5 — out now"). */
  subline?: string
}) {
  const { title } = item
  const savedMode = useChipMode()
  const chipClass = chipVisibility(chipMode ?? savedMode)
  /** Visibility classes for chips, or null when chips are hidden. One global setting for all chip types. */
  const vis = (_key: string) => chipClass
  const showPrice = title.mediaType === 'game' && !item.owned && item.price
  const showPlex = (title.mediaType === 'movie' || title.mediaType === 'tv') && item.plex
  const release = releaseInfo(title)
  const schedule = release.preRelease ? null : tvSchedule(title)
  const secondary = subline ?? secondaryLine(item)

  return (
    <Link to={`/title/${title.id}`} className={clsx('group block', className)}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-line bg-raised transition group-hover:border-accent group-focus-visible:border-accent">
        {title.coverUrl ? (
          <img src={title.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <CoverPlaceholder item={item} />
        )}

        {/* Status + verdict badges */}
        <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
          {item.favourite && vis('rating') !== null && (
            <Badge icon={Star} label="All-time favourite" className={clsx('!bg-accent !text-accent-fg', vis('rating'))} />
          )}
          {item.progress === 'in_progress' && vis('status') !== null && (
            <Badge icon={Play} label="In progress" className={vis('status')!} />
          )}
          {item.progress === 'completed' && vis('status') !== null && (
            <Badge icon={Check} label="Completed" className={vis('status')!} />
          )}
          {item.owned && (title.mediaType === 'game' || title.mediaType === 'book') && vis('library') !== null && (
            <Badge icon={Library} label="In your library" className={vis('library')!} />
          )}
          {item.verdict === 'liked' && vis('rating') !== null && (
            <Badge icon={ThumbsUp} label="Liked" className={clsx('!text-good', vis('rating'))} />
          )}
          {item.verdict === 'disliked' && vis('rating') !== null && (
            <Badge icon={ThumbsDown} label="Didn't like" className={clsx('!text-bad', vis('rating'))} />
          )}
        </div>

        {/* Headline review score */}
        {title.score && vis('score') !== null && (
          <span
            className={clsx(
              'absolute top-1.5 right-1.5 rounded-md bg-black/65 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white backdrop-blur-sm',
              vis('score'),
            )}
          >
            <span className="hidden text-white/55 sm:inline">{title.score.label} </span>
            {title.score.value}
          </span>
        )}

        {/* Price — games the user doesn't own yet */}
        {showPrice && vis('price') !== null && (
          <span
            className={clsx(
              'absolute bottom-1.5 left-1.5 flex overflow-hidden rounded-md font-mono text-[11px] font-semibold',
              vis('price'),
            )}
          >
            {item.price!.discountPct ? (
              <span className="bg-accent px-1.5 py-0.5 text-[#0c0b0a]">-{item.price!.discountPct}%</span>
            ) : null}
            <span className="bg-black/75 px-1.5 py-0.5 text-white">{item.price!.amount}</span>
          </span>
        )}

        {/* Pre-release countdown (movies/TV); bottom-left is free for them — games use it for price. */}
        {release.preRelease && vis('release') !== null && (
          <span
            title={releaseLong(release)}
            className={clsx(
              'absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md border border-accent/70 bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-accent backdrop-blur-sm',
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
              'absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md border bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide backdrop-blur-sm',
              schedule.kind === 'airing' ? 'border-info/70 text-info' : 'border-accent/70 text-accent',
              vis('release'),
            )}
          >
            {schedule.kind === 'airing' ? <Radio className="size-3" /> : <CalendarClock className="size-3" />}
            {tvScheduleChip(schedule)}
          </span>
        )}

        {/* Plex availability */}
        {showPlex && vis('plex') !== null && (
          <span
            title={plexMeta[item.plex!].label}
            aria-label={plexMeta[item.plex!].label}
            className={clsx(
              'absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm',
              vis('plex'),
            )}
          >
            <span className={clsx('size-2 rounded-full', plexMeta[item.plex!].className)} />
            Plex
          </span>
        )}
      </div>

      <div className="mt-2 px-0.5">
        <p className="truncate text-sm font-medium text-fg">{title.title}</p>
        <p className="truncate font-mono text-xs text-muted">
          {title.year ?? '—'}
          {secondary && <span className="text-faint"> · {secondary}</span>}
        </p>
      </div>
    </Link>
  )
}
