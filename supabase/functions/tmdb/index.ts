// Movies + TV via TMDB.
//   POST { action: 'search', query, type? }     → up to 12 matches (nothing is stored); type 'movie' | 'tv'
//                                                  searches only that type, otherwise both
//   POST { action: 'add', tmdbId, mediaType }   → fetch full details (+ review scores via MDBList/OMDb),
//                                                 upsert into `titles`, return the row. Also used to refresh
//                                                 a title that's already cached.
//   POST { action: 'providers', tmdbId, mediaType, country } → where to stream (subscription / free) there
//   POST { action: 'provider-list', country }                 → all streaming services in that country
// The caller then creates their own user_items row (RLS-protected) pointing at that title.
// Requires secret: TMDB_READ_TOKEN. Caller must be signed in.
import { admin, HttpError, json, requireUser, secret, serve } from '../_shared/http.ts'
import { cachedScores, fetchScores, scoresAreFresh } from '../_shared/scores.ts'
import { toProviders, watchProviders } from '../_shared/providers.ts'

const API = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'

type MediaType = 'movie' | 'tv'
// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

async function tmdb(path: string, params: Record<string, string> = {}): Promise<Json> {
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret('TMDB_READ_TOKEN')}`, accept: 'application/json' },
  })
  if (res.status === 404) throw new HttpError(404, 'tmdb_not_found')
  if (!res.ok) throw new HttpError(502, `tmdb_error_${res.status}`)
  return res.json()
}

const img = (path: string | null | undefined, size: string) => (path ? `${IMG}/${size}${path}` : null)
const yearOf = (date: string | null | undefined) => (date ? Number(date.slice(0, 4)) || null : null)
const dateOrNull = (date: string | null | undefined) => (date ? date : null)

async function search(query: string, type: MediaType | null) {
  const q = query.trim()
  if (q.length < 2) return json({ results: [] })
  const data = await tmdb(type ? `/search/${type}` : '/search/multi', {
    query: q,
    include_adult: 'false',
    language: 'en-US',
    page: '1',
  })
  const results = (data.results as Json[])
    .map((r) => (type ? { ...r, media_type: type } : r))
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 12)
    .map((r) => {
      const date = r.release_date || r.first_air_date
      return {
        tmdbId: r.id as number,
        mediaType: r.media_type as MediaType,
        title: (r.title ?? r.name) as string,
        year: yearOf(date),
        posterUrl: img(r.poster_path, 'w185'),
        overview: r.overview as string,
        rating: typeof r.vote_average === 'number' && r.vote_count > 0 ? r.vote_average : null,
      }
    })
  return json({ results })
}

async function add(tmdbId: number, mediaType: MediaType) {
  const d = await tmdb(`/${mediaType}/${tmdbId}`, {
    language: 'en-US',
    append_to_response: mediaType === 'movie' ? 'external_ids,release_dates' : 'external_ids',
  })

  const releaseDate = dateOrNull(mediaType === 'movie' ? d.release_date : d.first_air_date)
  const metadata: Json = {
    overview: d.overview || null,
    tagline: d.tagline || null,
    status: d.status ?? null,
    original_language: d.original_language ?? null,
  }
  if (mediaType === 'movie') {
    metadata.runtime = d.runtime ?? null
    // Per-country release dates by type (1 premiere, 2 limited, 3 theatrical, 4 digital, 5 physical, 6 TV).
    metadata.release_dates = d.release_dates?.results ?? []
  } else {
    metadata.number_of_seasons = d.number_of_seasons ?? null
    metadata.number_of_episodes = d.number_of_episodes ?? null
    metadata.next_episode_to_air = d.next_episode_to_air ?? null
    metadata.last_air_date = d.last_air_date ?? null
    metadata.networks = (d.networks ?? []).map((n: Json) => n.name)
    metadata.created_by = (d.created_by ?? []).map((c: Json) => c.name)
    metadata.seasons = (d.seasons ?? []).map((s: Json) => ({
      season_number: s.season_number,
      name: s.name,
      air_date: s.air_date,
      episode_count: s.episode_count,
    }))
  }

  // Review scores: reuse cached ones if recent, otherwise ask MDBList (OMDb as fallback).
  const imdbId = d.external_ids?.imdb_id ?? d.imdb_id ?? null
  const { data: existing } = await admin()
    .from('titles')
    .select('ratings')
    .eq('media_type', mediaType)
    .eq('source', 'tmdb')
    .eq('source_id', String(d.id))
    .maybeSingle()
  const scores = scoresAreFresh(existing?.ratings)
    ? cachedScores(existing!.ratings)
    : { ...(existing?.ratings ? cachedScores(existing.ratings) : {}), ...(await fetchScores(d.id, mediaType, imdbId)) }

  const row = {
    media_type: mediaType,
    source: 'tmdb',
    source_id: String(d.id),
    title: (mediaType === 'movie' ? d.title : d.name) as string,
    year: yearOf(releaseDate),
    cover_url: img(d.poster_path, 'w500'),
    backdrop_url: img(d.backdrop_path, 'w1280'),
    genres: (d.genres ?? []).map((g: Json) => g.name as string),
    external_ids: {
      tmdb_id: d.id,
      imdb_id: imdbId,
      tvdb_id: d.external_ids?.tvdb_id ?? null,
    },
    ratings: {
      ...(d.vote_count > 0 ? { tmdb: d.vote_average, tmdb_votes: d.vote_count } : {}),
      ...scores,
    },
    metadata,
    release_date: releaseDate,
    refreshed_at: new Date().toISOString(),
  }

  const { data, error } = await admin()
    .from('titles')
    .upsert(row, { onConflict: 'media_type,source,source_id' })
    .select()
    .single()
  if (error) {
    console.error(error)
    throw new HttpError(500, 'title_save_failed')
  }
  return json({ title: data })
}

// ─── Where to watch (TMDB watch providers, data by JustWatch) ──────────────

/**
 * Streaming (subscription) and free/ad-supported options for one country (shared logic in
 * _shared/providers.ts). Live lookup; the app caches it for an hour, and the `availability` function
 * stores the result per user. TMDB's terms require crediting JustWatch where it's shown.
 */
async function providers(tmdbId: number, mediaType: MediaType, country: string) {
  return json(await watchProviders(tmdbId, mediaType, country))
}

/** Every streaming service available in a country (movies + TV), for the Settings opt-in list. */
async function providerList(country: string) {
  const [movies, tv] = await Promise.all([
    tmdb('/watch/providers/movie', { watch_region: country, language: 'en-US' }),
    tmdb('/watch/providers/tv', { watch_region: country, language: 'en-US' }),
  ])
  const all = [...(movies.results ?? []), ...(tv.results ?? [])].map((p: Json) => ({
    ...p,
    display_priority: p.display_priorities?.[country] ?? p.display_priority ?? 99,
  }))
  return json({ country, services: toProviders(all).map(({ name, logoUrl }) => ({ name, logoUrl })) })
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  await requireUser(req)

  const body = (await req.json().catch(() => null)) as Json | null
  if (body?.action === 'search' && typeof body.query === 'string')
    return search(body.query, body.type === 'movie' || body.type === 'tv' ? body.type : null)
  if (body?.action === 'provider-list') {
    const country = typeof body.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : 'US'
    return providerList(country)
  }
  if (body?.action === 'add' || body?.action === 'providers') {
    const id = Number(body.tmdbId)
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'bad_tmdb_id')
    if (body.mediaType !== 'movie' && body.mediaType !== 'tv') throw new HttpError(400, 'bad_media_type')
    if (body.action === 'add') return add(id, body.mediaType)
    const country = typeof body.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : 'US'
    return providers(id, body.mediaType, country)
  }
  throw new HttpError(400, 'unknown_action')
})
