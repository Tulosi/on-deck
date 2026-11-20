// Review scores for movies + TV: IMDb and Rotten Tomatoes (critics + audience).
//   Primary:  MDBList — all three in one call.
//   Fallback: OMDb   — IMDb + Rotten Tomatoes critics (patchy); used only if MDBList fails or is out of quota.
// Metacritic and Letterboxd are deliberately not used for movies/TV (Metacritic is kept for games only).
// Both free tiers allow ~1,000 requests/day. Everything fails soft: a problem here never stops a title
// from being added; it just comes back without scores and is retried later.

export interface Scores {
  imdb?: string | null // "7.9"
  imdb_votes?: number | null
  rotten_tomatoes?: string | null // "90%" (critics / Tomatometer)
  rt_audience?: string | null // "97%" (Popcornmeter)
  scores_source?: 'mdblist' | 'omdb'
  scores_checked_at?: string // ISO time of the last lookup, even when nothing was found
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Cached scores are trusted for a while before asking again. Must match `scoresNeedRefresh` in
 * src/lib/library.ts: no IMDb score yet (new / unreleased) → re-check daily; otherwise weekly.
 */
export function scoresAreFresh(ratings: Record<string, unknown> | null | undefined): boolean {
  const at = typeof ratings?.scores_checked_at === 'string' ? Date.parse(ratings.scores_checked_at) : NaN
  if (!Number.isFinite(at)) return false
  return Date.now() - at < (ratings?.imdb ? 7 * DAY_MS : DAY_MS)
}

const SCORE_KEYS: (keyof Scores)[] = [
  'imdb',
  'imdb_votes',
  'rotten_tomatoes',
  'rt_audience',
  'scores_source',
  'scores_checked_at',
]

/** Picks the cached score fields out of an existing ratings object. */
export function cachedScores(ratings: Record<string, unknown>): Scores {
  return Object.fromEntries(SCORE_KEYS.filter((k) => k in ratings).map((k) => [k, ratings[k]])) as Scores
}

// ─── MDBList ───────────────────────────────────────────────────────────────

interface MdbRating {
  source: string
  value: number | null
  score: number | null
  votes: number | null
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

async function fromMdblist(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<Scores | null> {
  const key = Deno.env.get('MDBLIST_API_KEY')
  if (!key) return null
  try {
    const kind = mediaType === 'tv' ? 'show' : 'movie'
    const url = `https://api.mdblist.com/tmdb/${kind}/${tmdbId}?apikey=${encodeURIComponent(key)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (res.status === 404) return { scores_source: 'mdblist', scores_checked_at: new Date().toISOString() }
    if (!res.ok) return null // 429 (quota) or outage → fall back to OMDb
    const d = await res.json()
    const ratings = (Array.isArray(d.ratings) ? d.ratings : []) as MdbRating[]
    const get = (source: string) => ratings.find((r) => r.source === source)

    const imdb = num(get('imdb')?.value)
    const rt = num(get('tomatoes')?.value)
    const popcorn = num(get('popcorn')?.value)
    return {
      imdb: imdb != null ? imdb.toFixed(1) : null,
      imdb_votes: num(get('imdb')?.votes),
      rotten_tomatoes: rt != null ? `${Math.round(rt)}%` : null,
      rt_audience: popcorn != null ? `${Math.round(popcorn)}%` : null,
      scores_source: 'mdblist',
      scores_checked_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error('mdblist lookup failed', err)
    return null
  }
}

// ─── OMDb (fallback) ───────────────────────────────────────────────────────

const clean = (v: unknown) => (typeof v === 'string' && v !== 'N/A' && v.trim() ? v.trim() : null)

async function fromOmdb(imdbId: string | null): Promise<Scores | null> {
  const key = Deno.env.get('OMDB_API_KEY')
  if (!key) return null
  const checkedAt = new Date().toISOString()
  if (!imdbId) return { scores_source: 'omdb', scores_checked_at: checkedAt }
  try {
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(key)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const d = await res.json()
    if (d.Response !== 'True') {
      if (typeof d.Error === 'string' && /limit/i.test(d.Error)) return null
      return { scores_source: 'omdb', scores_checked_at: checkedAt }
    }
    const rt = (d.Ratings as { Source: string; Value: string }[] | undefined)?.find(
      (r) => r.Source === 'Rotten Tomatoes',
    )
    const votes = clean(d.imdbVotes)
    return {
      imdb: clean(d.imdbRating),
      imdb_votes: votes ? Number(votes.replace(/,/g, '')) || null : null,
      rotten_tomatoes: clean(rt?.Value),
      scores_source: 'omdb',
      scores_checked_at: checkedAt,
    }
  } catch (err) {
    console.error('omdb lookup failed', err)
    return null
  }
}

/**
 * Fresh scores for a TMDB title: MDBList first, OMDb if that fails.
 * Returns {} when neither could be reached, so the caller keeps whatever it had and retries later.
 */
export async function fetchScores(tmdbId: number, mediaType: 'movie' | 'tv', imdbId: string | null): Promise<Scores> {
  return (await fromMdblist(tmdbId, mediaType)) ?? (await fromOmdb(imdbId)) ?? {}
}
