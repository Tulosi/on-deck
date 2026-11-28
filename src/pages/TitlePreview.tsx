// The full title page for something you haven't added yet: synopsis, scores, cast, where to watch, Steam and
// prices, with Add where your status would be. Opened from search and the Plex / Steam suggestions on Home.
// URL: /preview/<type>/<source>/<id>, e.g. /preview/movie/tmdb/14160, /preview/game/igdb/1942.
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Plus } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { plainError } from '../lib/errors'
import { fetchTitle, previewItem, refreshPrices, useAddTitle, useItems, withPrice } from '../lib/library'
import type { PriceRow } from '../lib/prices'
import { supabase } from '../lib/supabase'
import { usePageTitle } from '../lib/usePageTitle'
import { TitleSkeleton } from '../components/LazyPage'
import { posterMorphName } from '../components/PosterCard'
import { TitleBody } from './TitleDetail'
import type { MediaType } from '../types'

const SOURCES: Record<string, MediaType[]> = { tmdb: ['movie', 'tv'], igdb: ['game'], steam: ['game'], hardcover: ['book'] }

function request(type: MediaType, source: string, id: number) {
  if (source === 'tmdb') return { mediaType: type, tmdbId: id }
  if (source === 'igdb') return { mediaType: type, igdbId: id }
  if (source === 'steam') return { mediaType: type, steamAppId: id }
  return { mediaType: type, hardcoverId: id }
}

/** Prices for a game that isn't in the library: priced on request (the prices function allows a few), then read. */
async function previewPrice(titleId: string): Promise<PriceRow | null> {
  await refreshPrices({ titleIds: [titleId] })
  const { data: user } = await supabase!.auth.getUser()
  const { data: prof } = await supabase!.from('profiles').select('country_code').eq('user_id', user.user!.id).maybeSingle()
  const country = ((prof?.country_code as string | undefined) ?? 'US').toUpperCase()
  const { data } = await supabase!.from('game_prices').select('*').eq('title_id', titleId).eq('country_code', country).maybeSingle()
  return (data as PriceRow | null) ?? null
}

export function TitlePreview() {
  const params = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { allItems, isLoading, isSample } = useItems()
  const addTitle = useAddTitle()
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const type = params.type as MediaType
  const source = params.source ?? ''
  const id = Number(params.id)
  const valid = !!SOURCES[source]?.includes(type) && Number.isInteger(id) && id > 0
  const key = `${type}:${source}:${params.id}`
  const inLibrary = allItems.find((i) => i.title.sourceKey === key)

  const q = useQuery({
    queryKey: ['preview', key],
    enabled: valid && !!user && !isLoading && !inLibrary,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () => fetchTitle(request(type, source, id)),
  })
  const row = q.data
  const steamApp = row?.media_type === 'game' && !!row.external_ids?.steam_appid
  const price = useQuery({
    queryKey: ['preview-price', row?.id],
    enabled: steamApp,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () => previewPrice(row!.id),
  })
  usePageTitle(row?.title ?? (q.isError ? 'Not found' : null))

  if (isLoading) return <TitleSkeleton />
  // Already yours (or added from here a moment ago): the real title page.
  if (inLibrary) return <Navigate to={`/title/${inLibrary.title.id}`} replace />
  if (!valid || isSample || !user)
    return (
      <p className="py-16 text-center text-sm text-muted">
        {valid ? (
          <>
            <Link to="/login" className="hit text-accent-ink hover:underline">
              Sign in
            </Link>{' '}
            to look up titles that aren’t in the sample library.
          </>
        ) : (
          'This link doesn’t point to a title.'
        )}
      </p>
    )
  if (q.isError)
    return (
      <div className="py-16 text-center text-sm text-muted">
        <p>{plainError(q.error, 'Couldn’t load this title. Try again in a moment.')}</p>
        <p className="mt-3">
          <button type="button" onClick={() => void q.refetch()} className="hit text-accent-ink hover:underline">
            Try again
          </button>
        </p>
      </div>
    )
  if (!row) return <TitleSkeleton />

  const base = previewItem(row)
  // Games: "Checking prices…" until the price arrives; nothing to check without a Steam listing.
  const item = price.data ? withPrice(base, price.data) : base

  const add = async () => {
    setAdding(true)
    setAddError(null)
    try {
      await addTitle(row.id, row.media_type)
      navigate(`/title/${row.id}`, { replace: true })
    } catch (e) {
      setAddError(plainError(e, 'Couldn’t add that. Try again.'))
      setAdding(false)
    }
  }

  return (
    <TitleBody
      item={item}
      isSample={false}
      morph={posterMorphName(row.id)}
      preview={
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-muted">Not in your library yet.</p>
          <button
            type="button"
            onClick={() => void add()}
            disabled={adding}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-semibold text-accent-fg hover:brightness-95 active:scale-[0.98] disabled:opacity-60"
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add to library
          </button>
          {addError && <p className="w-full text-sm text-bad">{addError}</p>}
        </div>
      }
    />
  )
}
