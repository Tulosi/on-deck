import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, Film, Gamepad2, Loader2, Trash2, Tv } from 'lucide-react'
import { ComingSoon } from '../components/PageHeader'
import { useItems, useRemoveItem } from '../lib/library'
import { mediaLabels, type MediaType } from '../types'

const typeIcon: Record<MediaType, typeof Film> = { movie: Film, tv: Tv, game: Gamepad2, book: BookOpen }

function formatDate(iso?: string) {
  if (!iso) return undefined
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null
  return (
    <div>
      <dt className="font-mono text-[11px] tracking-wider text-faint uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">{value}</dd>
    </div>
  )
}

export function TitleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { items, isLoading, isSample } = useItems()
  const removeItem = useRemoveItem()
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24 text-muted">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const item = items.find((i) => i.title.id === id)
  if (!item) return <p className="py-16 text-center text-sm text-muted">This title isn’t on your deck.</p>

  const { title } = item
  const Icon = typeIcon[title.mediaType]
  const d = (title.details ?? {}) as Record<string, unknown>
  const runtime = typeof d.runtime === 'number' && d.runtime > 0 ? `${d.runtime} min` : undefined
  const seasons = typeof d.number_of_seasons === 'number' ? `${d.number_of_seasons}` : undefined
  const networks = Array.isArray(d.networks) ? (d.networks as string[]).join(', ') : undefined
  const next = d.next_episode_to_air as { air_date?: string; season_number?: number; episode_number?: number } | null

  async function remove() {
    if (!window.confirm(`Remove “${title.title}” from your deck?`)) return
    setRemoving(true)
    setError(null)
    try {
      await removeItem(item!.id)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove')
      setRemoving(false)
    }
  }

  return (
    <div className="-mx-4 -mt-6 md:-mx-6">
      {/* Backdrop */}
      <div className="relative h-48 overflow-hidden bg-surface sm:h-64 md:h-80">
        {title.backdropUrl && <img src={title.backdropUrl} alt="" className="size-full object-cover opacity-60" />}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-sm text-white backdrop-blur hover:bg-black/70 md:left-6"
        >
          <ArrowLeft className="size-4" /> Back
        </button>
      </div>

      <div className="relative -mt-24 flex flex-col gap-6 px-4 sm:flex-row sm:items-end md:-mt-32 md:px-6">
        <div className="aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-lg border border-line bg-raised shadow-2xl sm:w-44 md:w-52">
          {title.coverUrl ? (
            <img src={title.coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center">
              <Icon className="size-8 text-faint" />
            </div>
          )}
        </div>
        <div className="min-w-0 pb-1">
          <p className="flex items-center gap-1.5 font-mono text-xs tracking-wider text-accent-ink uppercase">
            <Icon className="size-3.5" /> {mediaLabels[title.mediaType].singular}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg md:text-4xl">{title.title}</h1>
          <p className="mt-1 font-mono text-sm text-muted">
            {[title.year, title.genres.join(', '), title.score && `${title.score.label} ${title.score.value}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 px-4 md:px-6 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-6">
          {typeof d.tagline === 'string' && d.tagline && <p className="text-muted italic">{d.tagline}</p>}
          {title.overview && <p className="max-w-prose leading-relaxed text-fg/90">{title.overview}</p>}
          <ComingSoon>
            Next up on this page: status controls (Owned, progress, Liked / Didn’t like, ★ favourite, priority),
            notes, collections, IMDb + Rotten Tomatoes scores and Plex availability.
          </ComingSoon>
        </div>

        <aside className="space-y-6">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <Fact label={title.mediaType === 'tv' ? 'First aired' : 'Released'} value={formatDate(title.releaseDate)} />
            <Fact label="Runtime" value={runtime} />
            <Fact label="Seasons" value={seasons} />
            <Fact label="Network" value={networks} />
            <Fact
              label="Next episode"
              value={
                next?.air_date
                  ? `S${next.season_number} · E${next.episode_number} — ${formatDate(next.air_date)}`
                  : undefined
              }
            />
            <Fact label="Status" value={typeof d.status === 'string' ? d.status : undefined} />
          </dl>

          {!isSample && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={remove}
                disabled={removing}
                className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-muted hover:border-bad hover:text-bad disabled:opacity-60"
              >
                {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Remove from deck
              </button>
              {error && <p className="text-sm text-bad">{error}</p>}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
