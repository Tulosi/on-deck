import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { BookOpen, Film, Gamepad2, Heart, Loader2, Star, ThumbsDown, ThumbsUp, Tv, type LucideIcon } from 'lucide-react'
import { Wordmark } from '../components/Logo'
import { supabase } from '../lib/supabase'
import type { MediaType, Progress } from '../types'

interface SharedRow {
  media_type: MediaType
  title: string
  year: number | null
  cover_url: string | null
  genres: string[]
  ratings: Record<string, unknown>
  progress: Progress
  verdict: 'liked' | 'disliked' | null
  favourite: boolean
  owned: boolean
  release_date: string | null
  byline: string | null
}

interface ShareInfo {
  media_type: MediaType | null
  collection_name: string | null
  collection_description: string | null
}

const typeIcon: Record<MediaType, LucideIcon> = { movie: Film, tv: Tv, game: Gamepad2, book: BookOpen }
const TYPE_NAME: Record<MediaType, string> = { movie: 'Movies', tv: 'TV shows', game: 'Games', book: 'Books' }
const SECTIONS: { progress: Progress; label: string }[] = [
  { progress: 'in_progress', label: 'In progress' },
  { progress: 'caught_up', label: 'Caught up' },
  { progress: 'stalled', label: 'Stalled' },
  { progress: 'wanted', label: 'Want to' },
  { progress: 'completed', label: 'Done' },
]
const grid =
  'grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]'

function score(r: SharedRow): string | null {
  const x = r.ratings ?? {}
  if (typeof x.steam === 'number') return `Steam ${x.steam}%`
  if (typeof x.imdb === 'string' && x.imdb) return `IMDb ${x.imdb}`
  if (typeof x.hardcover === 'number') return `★ ${x.hardcover.toFixed(1)}`
  return null
}

function Card({ r }: { r: SharedRow }) {
  const Icon = typeIcon[r.media_type]
  const s = score(r)
  return (
    <div>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-line bg-raised">
        {r.cover_url ? (
          <img src={r.cover_url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col justify-end p-2 text-sm text-muted">
            <Icon className="mb-auto size-4 text-faint" />
            {r.title}
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
          {r.favourite && (
            <span className="grid size-6 place-items-center rounded bg-accent text-accent-fg" title="Favourite">
              <Star className="size-3.5" />
            </span>
          )}
          {r.verdict === 'liked' && (
            <span className="grid size-6 place-items-center rounded bg-bg/80 text-good" title="Liked">
              <ThumbsUp className="size-3.5" />
            </span>
          )}
          {r.verdict === 'disliked' && (
            <span className="grid size-6 place-items-center rounded bg-bg/80 text-bad" title="Didn’t like">
              <ThumbsDown className="size-3.5" />
            </span>
          )}
        </div>
        {s && <span className="absolute top-1.5 right-1.5 rounded bg-bg/80 px-1.5 py-0.5 font-mono text-[11px] text-fg">{s}</span>}
      </div>
      <p className="mt-2 truncate text-sm font-medium text-fg">{r.title}</p>
      <p className="truncate font-mono text-xs text-faint">{[r.year, r.byline].filter(Boolean).join(' · ') || '—'}</p>
    </div>
  )
}

/** Public, read-only view of someone's shared list (/s/:token). Lives outside the app shell; no sign-in. */
export function SharedList() {
  const { token = '' } = useParams()
  const [type, setType] = useState<MediaType | null>(null)

  const q = useQuery({
    queryKey: ['shared', token],
    enabled: !!supabase && !!token,
    queryFn: async () => {
      const [info, list] = await Promise.all([
        supabase!.rpc('get_share_info', { share_token: token }),
        supabase!.rpc('get_shared_list', { share_token: token }),
      ])
      if (info.error) throw info.error
      if (list.error) throw list.error
      return { info: ((info.data ?? []) as ShareInfo[])[0] ?? null, rows: (list.data ?? []) as SharedRow[] }
    },
  })

  const info = q.data?.info
  const rows = q.data?.rows ?? []
  const isCollection = !!info?.collection_name
  const heading = info ? (info.collection_name ?? (info.media_type ? TYPE_NAME[info.media_type] : 'Library')) : ''
  const types = [...new Set(rows.map((r) => r.media_type))]
  const visible = type ? rows.filter((r) => r.media_type === type) : rows

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" aria-label="On Deck">
            <Wordmark />
          </Link>
          <span className="font-mono text-[11px] tracking-wider text-faint uppercase">Shared list · read-only</span>
        </div>

        {q.isLoading ? (
          <Loader2 className="mx-auto mt-24 size-5 animate-spin text-muted" />
        ) : q.error ? (
          <p className="mt-24 text-center text-sm text-bad">Couldn’t load this list. Please try again later.</p>
        ) : !info ? (
          <div className="mx-auto mt-24 max-w-sm text-center">
            <p className="text-fg">This link doesn’t work.</p>
            <p className="mt-1 text-sm text-muted">It may have been turned off by the person who shared it.</p>
          </div>
        ) : (
          <>
            <div className="mt-8 mb-6">
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-fg">
                {heading}
                <span className="font-mono text-xs font-normal text-faint">{rows.length}</span>
              </h1>
              {info.collection_description && <p className="mt-1 max-w-prose text-sm text-muted">{info.collection_description}</p>}
            </div>

            {types.length > 1 && (
              <div className="mb-6 flex flex-wrap gap-1">
                {[null, ...types].map((t) => (
                  <button
                    key={t ?? 'all'}
                    type="button"
                    onClick={() => setType(t)}
                    aria-pressed={type === t}
                    className={clsx(
                      'h-8 rounded-full px-3 text-xs',
                      type === t ? 'bg-accent font-medium text-accent-fg' : 'text-muted hover:bg-raised hover:text-fg',
                    )}
                  >
                    {t ? TYPE_NAME[t] : 'All'}
                  </button>
                ))}
              </div>
            )}

            {visible.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted">Nothing here yet.</p>
            ) : isCollection ? (
              <div className={grid}>
                {visible.map((r, i) => (
                  <Card key={`${r.title}-${i}`} r={r} />
                ))}
              </div>
            ) : (
              <div className="space-y-10">
                {SECTIONS.map((s) => {
                  const list = visible.filter((r) => r.progress === s.progress)
                  if (!list.length) return null
                  return (
                    <section key={s.progress} className="space-y-3">
                      <h2 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight text-fg">
                        {s.label}
                        <span className="font-mono text-xs font-normal text-faint">{list.length}</span>
                      </h2>
                      <div className={grid}>
                        {list.map((r, i) => (
                          <Card key={`${r.title}-${i}`} r={r} />
                        ))}
                      </div>
                    </section>
                  )
                })}
              </div>
            )}

            <p className="mt-12 flex items-center gap-1.5 text-xs text-faint">
              <Heart className="size-3.5" /> Made with On Deck, a shortlist for the movies, shows, games and books you
              actually intend to get to.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
