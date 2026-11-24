import { useLayoutEffect, useRef, useState, ViewTransition } from 'react'
import { backdropProps, coverProps } from '../lib/images'
import { posterMorphName } from '../components/PosterCard'
import clsx from 'clsx'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, ExternalLink, Radio, BookOpen, Film, Gamepad2, Loader2, Trash2, Tv } from 'lucide-react'
import { CollectionPicker } from '../components/CollectionPicker'
import { GamePrices } from '../components/GamePrices'
import { StatusControls, TrackingDetails } from '../components/StatusControls'
import { WhereToWatch } from '../components/WhereToWatch'
import { supportsWhereToWatch } from '../lib/integrations'
import { useItems, useRemoveItemWithUndo } from '../lib/library'
import { episodeCode, releaseInfo, releaseLong, tvSchedule, tvScheduleLong } from '../lib/release'
import { mediaLabels, type MediaType, type Title } from '../types'

const typeIcon: Record<MediaType, typeof Film> = { movie: Film, tv: Tv, game: Gamepad2, book: BookOpen }

function formatDate(iso?: string) {
  if (!iso) return undefined
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">{value}</dd>
    </div>
  )
}

/**
 * The description, cut to a few lines with More / Less. Beside the poster on wider screens, under the
 * poster-and-title row on phones (`className` picks which copy shows where).
 */
function Overview({ text, tagline, lines, className }: { text?: string; tagline?: string; lines: 3 | 4; className?: string }) {
  const [open, setOpen] = useState(false)
  const [clipped, setClipped] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && !open) setClipped(el.scrollHeight > el.clientHeight + 1)
  }, [text, open])
  if (!text && !tagline) return null
  return (
    <div className={clsx('max-w-prose space-y-1', className)}>
      {tagline && <p className="text-sm text-muted italic">{tagline}</p>}
      {text && (
        <>
          {/* Height animates between N lines and auto (interpolate-size); the last shown line fades when clipped. */}
          <p
            ref={ref}
            style={{ height: open ? 'auto' : `${lines}lh` }}
            className={clsx(
              'overflow-clip text-sm leading-relaxed text-fg/90 transition-[height] duration-300 ease-out motion-reduce:transition-none',
              !open && clipped && '[mask-image:linear-gradient(to_bottom,#000_calc(100%-1lh),transparent)]',
            )}
          >
            {text}
          </p>
          {(clipped || open) && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="hit text-xs text-accent-ink hover:underline">
              {open ? 'Less' : 'More'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function ScoreChips({ title }: { title: Title }) {
  const r = title.ratings
  const chips = r
    ? [
        // Games: Steam review % first. Books: Hardcover's average (out of 5).
        title.mediaType === 'game' && title.score?.label === 'Steam' && { label: 'Steam reviews', value: title.score.value },
        title.mediaType === 'book' && title.score?.label === 'Hardcover' && { label: 'Hardcover', value: `${title.score.value} / 5` },
        r.imdb && { label: 'IMDb', value: r.imdb },
        r.rottenTomatoes && { label: 'Rotten Tomatoes', value: r.rottenTomatoes },
        r.rtAudience && { label: 'RT Audience', value: r.rtAudience },
        // Metacritic only for games; never shown for movies/TV.
        title.mediaType === 'game' && r.metacritic && { label: 'Metacritic', value: r.metacritic },
        // TMDB only when nothing better exists.
        !r.imdb && r.tmdb != null && { label: 'TMDB', value: r.tmdb.toFixed(1) },
      ].filter((c): c is { label: string; value: string } => !!c)
    : title.score
      ? [title.score]
      : []

  if (chips.length === 0) {
    return (
      <p className="mt-3 font-mono text-xs text-faint">{title.needsScores ? 'Fetching scores…' : 'No scores yet'}</p>
    )
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c.label}
          className="flex items-baseline gap-1.5 rounded-md border border-line bg-surface/80 px-2 py-1 font-mono text-xs backdrop-blur"
        >
          <span className="text-muted">{c.label}</span>
          <span className="font-semibold text-fg">{c.value}</span>
        </span>
      ))}
    </div>
  )
}

const DECK_LABEL: Record<string, string> = {
  verified: 'Verified',
  playable: 'Playable',
  unsupported: 'Unsupported',
  unknown: 'Unknown',
}

/** Game facts for the side panel (IGDB + Steam + IsThereAnyDeal data stored on the title). */
/** "About 36h · rushed 16h · 100% 71h (32 players)", from IGDB; "No data yet" when IGDB has none. */
function timeToBeatText(d: Record<string, unknown>): string | undefined {
  if (!('time_to_beat' in d)) return undefined // not fetched yet (refreshes shortly)
  const t = d.time_to_beat as { rushed?: number | null; normal?: number | null; full?: number | null; players?: number | null } | null
  if (!t) return 'No data yet'
  const h = (n: number) => (n < 10 ? `${n.toFixed(1).replace(/\.0$/, '')}h` : `${Math.round(n)}h`)
  const parts = [
    t.normal != null ? `About ${h(t.normal)}` : null,
    t.rushed != null ? `rushed ${h(t.rushed)}` : null,
    t.full != null ? `100% ${h(t.full)}` : null,
  ].filter(Boolean) as string[]
  if (!parts.length) return 'No data yet'
  return `${parts.join(', ')}${t.players ? ` (${t.players} player${t.players === 1 ? '' : 's'})` : ''}`
}

function GameFacts({ d }: { d: Record<string, unknown> }) {
  const list = (v: unknown) => (Array.isArray(v) && v.length ? (v as string[]).join(', ') : undefined)
  const mp = (d.multiplayer ?? {}) as {
    online_coop?: boolean
    local_coop?: boolean
    split_screen?: boolean
    pvp?: boolean
    online_max?: number | null
    single_player?: boolean
  }
  const modes = [
    mp.single_player && 'Single-player',
    mp.online_coop && `Online co-op${mp.online_max ? ` (up to ${mp.online_max})` : ''}`,
    mp.local_coop && 'Local co-op',
    mp.split_screen && 'Split-screen',
    mp.pvp && 'PvP',
  ].filter(Boolean) as string[]
  return (
    <>
      <Fact label="Developer" value={list(d.developer)} />
      <Fact label="Publisher" value={list(d.publisher)} />
      <Fact label="Modes" value={modes.length ? modes.join(', ') : undefined} />
      <Fact label="Time to beat" value={timeToBeatText(d)} />
      <Fact label="Steam Deck" value={typeof d.steam_deck === 'string' ? DECK_LABEL[d.steam_deck] : undefined} />
      <Fact label="Early Access" value={d.early_access ? 'Yes, not 1.0 yet' : undefined} />
      <Fact label="Perspective" value={list(d.perspectives)} />
    </>
  )
}

function BookFacts({ d }: { d: Record<string, unknown> }) {
  const authors = Array.isArray(d.authors) && d.authors.length ? (d.authors as string[]).join(', ') : undefined
  const series = d.series as { name?: string; position?: number | null } | null | undefined
  return (
    <>
      <Fact label={Array.isArray(d.authors) && d.authors.length > 1 ? 'Authors' : 'Author'} value={authors} />
      <Fact label="Series" value={series?.name ? `${series.name}${series.position ? `, book ${series.position}` : ''}` : undefined} />
      <Fact label="Pages" value={typeof d.pages === 'number' ? d.pages.toLocaleString() : undefined} />
      <Fact
        label="Readers on Hardcover"
        value={typeof d.readers === 'number' && d.readers > 0 ? d.readers.toLocaleString() : undefined}
      />
    </>
  )
}

function GameLinks({ d }: { d: Record<string, unknown> }) {
  const links = [
    typeof d.steam_url === 'string' && { href: d.steam_url, label: 'Steam store' },
    typeof d.igdb_url === 'string' && { href: d.igdb_url, label: 'IGDB' },
    typeof d.hardcover_url === 'string' && { href: d.hardcover_url, label: 'Hardcover' },
  ].filter(Boolean) as { href: string; label: string }[]
  if (links.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          className="hit flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs text-fg hover:border-accent"
        >
          {l.label} <ExternalLink className="size-3.5" />
        </a>
      ))}
    </div>
  )
}

interface CastMember {
  tmdb_id: number
  name: string
  character: string | null
  photo: string | null
  imdb_id: string | null
}

/** Movies / TV: the top 4 billed actors, each linking to their IMDb page (or TMDB when IMDb has no id). */
function CastRow({ d }: { d: Record<string, unknown> }) {
  const cast = Array.isArray(d.cast) ? (d.cast as CastMember[]).slice(0, 4) : []
  if (cast.length === 0) return null
  return (
    <section aria-label="Starring" className="space-y-2">
      <h2 className="text-sm font-semibold text-fg">Starring</h2>
      <ul className="flex flex-wrap gap-x-6 gap-y-3">
        {cast.map((p) => {
          const href = p.imdb_id ? `https://www.imdb.com/name/${p.imdb_id}/` : `https://www.themoviedb.org/person/${p.tmdb_id}`
          return (
            <li key={p.tmdb_id}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                title={p.imdb_id ? `${p.name} on IMDb` : `${p.name} on TMDB`}
                className="group flex items-center gap-3"
              >
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-raised transition group-hover:border-accent">
                  {p.photo ? (
                    <img src={p.photo} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <span className="font-mono text-sm text-faint">{p.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg group-hover:text-accent-ink">{p.name}</span>
                  {p.character && <span className="block max-w-[11rem] truncate text-xs text-muted">{p.character}</span>}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Sample mode: where Tracking would be, say how to get it instead of leaving a gap. */
function SignInToTrack() {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3 sm:px-5">
      <p className="text-sm text-muted">Track your status, progress and ratings for this title.</p>
      <Link
        to="/login"
        className="hit rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-fg hover:brightness-105"
      >
        Sign in to track
      </Link>
    </section>
  )
}

export function TitleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { allItems: items, isLoading, isSample } = useItems()
  // Same name as the poster that was tapped, so it morphs into this one (and back on Back).
  const morph = (location.state as { morph?: string } | null)?.morph ?? posterMorphName(id ?? '')
  const removeItem = useRemoveItemWithUndo()

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24 text-muted">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const item = items.find((i) => i.title.id === id)
  if (!item) return <p className="py-16 text-center text-sm text-muted">This title isn’t in your library.</p>

  const { title } = item
  const Icon = typeIcon[title.mediaType]
  const d = (title.details ?? {}) as Record<string, unknown>
  const tagline = typeof d.tagline === 'string' && d.tagline ? d.tagline : undefined
  const runtime = typeof d.runtime === 'number' && d.runtime > 0 ? `${d.runtime} min` : undefined
  const seasons = typeof d.number_of_seasons === 'number' ? `${d.number_of_seasons}` : undefined
  const networks = Array.isArray(d.networks) ? (d.networks as string[]).join(', ') : undefined
  const release = releaseInfo(title)
  const schedule = release.preRelease ? null : tvSchedule(title)
  const next = d.next_episode_to_air as { air_date?: string; season_number?: number; episode_number?: number } | null
  // Mid-season: the next episode isn't a premiere and hasn't aired yet → the current season is still airing.
  const currentlyAiring =
    title.mediaType === 'tv' &&
    !!next?.air_date &&
    (next.episode_number ?? 1) > 1 &&
    next.air_date >= new Date().toISOString().slice(0, 10)
  const statusText = currentlyAiring ? 'Currently airing' : typeof d.status === 'string' ? d.status : undefined

  // No "Are you sure?": it's removed with an Undo toast, and only deleted once that runs out.
  const remove = () => removeItem(item, () => navigate('/', { replace: true }))

  return (
    <div className="-mx-4 -mt-6 md:-mx-6">
      {/* Backdrop */}
      {/* Shorter band, and just room for Back when there's no backdrop image. */}
      <div className={clsx('relative overflow-hidden bg-surface', title.backdropUrl ? 'h-40 sm:h-52 md:h-60' : 'h-16')}>
        {title.backdropUrl && (
          <img {...backdropProps(title.backdropUrl)} alt="" fetchPriority="high" className="size-full object-cover opacity-60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="hit absolute top-4 left-4 flex h-9 items-center gap-1.5 rounded-md border border-line bg-bg/90 px-3 text-sm text-fg hover:bg-raised md:left-6"
        >
          <ArrowLeft className="size-4" /> Back
        </button>
      </div>

      <div className={clsx('relative flex max-w-5xl flex-row items-end gap-4 px-4 sm:gap-5 md:px-6', title.backdropUrl ? '-mt-16 md:-mt-24' : 'mt-2')}>
        <ViewTransition name={morph} share="poster-morph" default="none">
        <div className="aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-raised shadow-2xl sm:w-36 md:w-40">
          {title.coverUrl ? (
            <img
              {...coverProps(title.coverUrl, '(min-width: 768px) 160px, (min-width: 640px) 144px, 96px')}
              alt=""
              fetchPriority="high"
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center">
              <Icon className="size-8 text-faint" />
            </div>
          )}
        </div>
        </ViewTransition>
        <div className="min-w-0 pb-1">
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Icon className="size-3.5" /> {mediaLabels[title.mediaType].singular}
            {item.archivedAt && (
              <span
                className="ml-1 rounded-md border border-line px-1.5 py-0.5 text-xs text-muted"
                title="Archived: hidden everywhere by default. Unarchive it from Tracking below."
              >
                Archived {new Date(item.archivedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg sm:text-3xl md:text-4xl">{title.title}</h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
            {title.year != null && <span className="font-mono">{title.year}</span>}
            {title.genres.length > 0 && <span>{title.genres.join(', ')}</span>}
          </p>
          {release.preRelease && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-accent/70 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-ink">
              <CalendarClock className="size-3.5" />
              {release.date && !release.fuzzyLabel ? 'Out ' : ''}
              {releaseLong(release)}
            </p>
          )}
          {schedule && (
            <p
              className={
                schedule.kind === 'airing'
                  ? 'mt-3 inline-flex items-center gap-1.5 rounded-md border border-info/60 bg-info/10 px-2.5 py-1 text-xs font-medium text-info'
                  : 'mt-3 inline-flex items-center gap-1.5 rounded-md border border-accent/70 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-ink'
              }
            >
              {schedule.kind === 'airing' ? <Radio className="size-3.5" /> : <CalendarClock className="size-3.5" />}
              {tvScheduleLong(schedule)}
            </p>
          )}
          <ScoreChips title={title} />
          <Overview text={title.overview} tagline={tagline} lines={4} className="mt-3 hidden sm:block" />
        </div>
      </div>

      <Overview text={title.overview} tagline={tagline} lines={3} className="mt-4 px-4 sm:hidden" />

      <div className="mt-6 grid max-w-5xl gap-6 px-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0 space-y-5">
          {/* The main action first: status and progress sit right under the title, above the overview. */}
          {isSample ? <SignInToTrack /> : <StatusControls item={item} />}
          <CastRow d={d} />
          {!isSample && <TrackingDetails item={item} />}
          {!isSample && supportsWhereToWatch(title.mediaType) && <WhereToWatch title={title} />}
          {!isSample && title.mediaType === 'game' && <GamePrices item={item} />}
          {!isSample && <CollectionPicker item={item} />}
        </div>

        <aside className="space-y-5">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <Fact
              label={
                release.preRelease
                  ? title.mediaType === 'tv' ? 'Premieres' : title.mediaType === 'book' ? 'Publishes' : 'Releases'
                  : title.mediaType === 'tv' ? 'First aired' : title.mediaType === 'book' ? 'Published' : 'Released'
              }
              value={release.fuzzyLabel ?? formatDate(title.releaseDate)}
            />
            <Fact label="Runtime" value={runtime} />
            <Fact label="Seasons" value={seasons} />
            <Fact label="Network" value={networks} />
            <Fact
              label="Next episode"
              value={
                next?.air_date
                  ? `${episodeCode({ season: next.season_number ?? 1, episode: next.episode_number ?? 1 })}, ${formatDate(next.air_date)}`
                  : undefined
              }
            />
            <Fact label="Status" value={title.mediaType === 'game' || title.mediaType === 'book' ? undefined : statusText} />
            {title.mediaType === 'game' && <GameFacts d={d} />}
            {title.mediaType === 'book' && <BookFacts d={d} />}
          </dl>
          {(title.mediaType === 'game' || title.mediaType === 'book') && <GameLinks d={d} />}

          {!isSample && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={remove}
                className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-muted hover:border-bad hover:text-bad disabled:opacity-60"
              >
                <Trash2 className="size-4" />
                Remove from library
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
