import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { BookOpen, Check, Film, Gamepad2, Package, Play, Star, ThumbsDown, ThumbsUp, Tv, type LucideIcon } from 'lucide-react'
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

export function PosterCard({ item, className }: { item: UserItem; className?: string }) {
  const { title } = item
  const showPrice = title.mediaType === 'game' && !item.owned && item.price
  const showPlex = (title.mediaType === 'movie' || title.mediaType === 'tv') && item.plex
  const secondary = secondaryLine(item)

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
          {item.favourite && <Badge icon={Star} label="All-time favourite" className="!bg-accent !text-accent-fg" />}
          {item.progress === 'in_progress' && <Badge icon={Play} label="In progress" />}
          {item.progress === 'completed' && <Badge icon={Check} label="Completed" />}
          {item.owned && <Badge icon={Package} label="Owned" />}
          {item.verdict === 'liked' && <Badge icon={ThumbsUp} label="Liked" className="!text-good" />}
          {item.verdict === 'disliked' && <Badge icon={ThumbsDown} label="Didn't like" className="!text-bad" />}
        </div>

        {/* Headline review score */}
        {title.score && (
          <span className="absolute top-1.5 right-1.5 rounded-md bg-black/65 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white backdrop-blur-sm">
            <span className="hidden text-white/55 sm:inline">{title.score.label} </span>
            {title.score.value}
          </span>
        )}

        {/* Price — games the user doesn't own yet */}
        {showPrice && (
          <span className="absolute bottom-1.5 left-1.5 flex overflow-hidden rounded-md font-mono text-[11px] font-semibold">
            {item.price!.discountPct ? (
              <span className="bg-accent px-1.5 py-0.5 text-[#0c0b0a]">-{item.price!.discountPct}%</span>
            ) : null}
            <span className="bg-black/75 px-1.5 py-0.5 text-white">{item.price!.amount}</span>
          </span>
        )}

        {/* Plex availability */}
        {showPlex && (
          <span
            title={plexMeta[item.plex!].label}
            aria-label={plexMeta[item.plex!].label}
            className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
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
