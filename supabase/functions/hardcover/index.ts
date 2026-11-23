// Books (Hardcover GraphQL). Caller must be signed in.
//   POST { action: 'search', query }        → up to 12 books (nothing stored)
//   POST { action: 'add', hardcoverId }     → full details, upserted into `titles`; also refreshes a cached book
// Hardcover's terms: server-side only, so the token never reaches the browser. Required secret: HARDCOVER_TOKEN
// (personal tokens expire — see docs/API-KEYS.md).
import { admin, HttpError, json, requireUser, secret, serve } from '../_shared/http.ts'

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

const API = 'https://api.hardcover.app/v1/graphql'

async function gql(query: string, variables: Json = {}): Promise<Json> {
  const token = secret('HARDCOVER_TOKEN').replace(/^Bearer\s+/i, '')
  let res: Response
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}`, 'user-agent': 'OnDeck/1.0' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new HttpError(504, 'hardcover_timeout')
  }
  const body = (await res.json().catch(() => null)) as Json | null
  if (res.status === 401 || res.status === 403) throw new HttpError(502, 'hardcover_token_expired')
  if (!res.ok || !body || body.errors) {
    console.error('hardcover error', res.status, JSON.stringify(body?.errors ?? body).slice(0, 500))
    throw new HttpError(502, 'hardcover_error')
  }
  return body.data
}

/** Search-index fields arrive either as JSON or as JSON-encoded strings. */
const parsed = <T>(v: unknown): T | null => {
  if (typeof v !== 'string') return (v as T) ?? null
  try {
    return JSON.parse(v) as T
  } catch {
    return null
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10)

// ─── Search ────────────────────────────────────────────────────────────────

const limitOf = (v: unknown) => Math.min(40, Math.max(1, Number.isInteger(v) ? (v as number) : 12))

async function search(query: string, limit = 12) {
  const q = query.trim()
  if (q.length < 2) return json({ results: [] })
  const data = await gql(
    'query Search($q: String!, $n: Int!) { search(query: $q, query_type: "Book", per_page: $n, page: 1) { results } }',
    { q, n: Math.min(50, limit + 5) }, // a few spare: study guides are filtered out below
  )
  const hits = ((data.search?.results?.hits ?? []) as Json[]).map((h) => h.document as Json)
  const results = hits
    // Study guides and summaries of other books clutter results.
    .filter((d) => !/^(summary|study guide|analysis) (of|and|for)\b/i.test(String(d.title ?? '')))
    .slice(0, limit)
    .map((d) => ({
      mediaType: 'book',
      hardcoverId: Number(d.id),
      title: d.title as string,
      year: typeof d.release_year === 'number' ? d.release_year : null,
      posterUrl: parsed<Json>(d.image)?.url ?? null,
      author: ((d.author_names ?? []) as string[]).slice(0, 2).join(', ') || null,
      series: ((d.series_names ?? []) as string[])[0] ?? null,
      rating: typeof d.rating === 'number' && d.ratings_count > 0 ? d.rating : null,
      overview: typeof d.description === 'string' ? d.description : null,
      pages: typeof d.pages === 'number' ? d.pages : null,
    }))
  return json({ results })
}

// ─── Add / refresh ─────────────────────────────────────────────────────────

const DETAILS = `query Book($id: Int!) {
  books_by_pk(id: $id) {
    id title subtitle description release_date release_year pages rating ratings_count users_count slug
    image { url }
    cached_tags
    cached_contributors
    book_series { position series { name slug } }
  }
}`

async function add(hardcoverId: number) {
  const data = await gql(DETAILS, { id: hardcoverId })
  const b = data.books_by_pk as Json | null
  if (!b) throw new HttpError(404, 'book_not_found')

  const tags = (parsed<Json>(b.cached_tags) ?? {}) as Record<string, { tag: string; count: number }[]>
  const tagNames = (cat: string, n: number) => (tags[cat] ?? []).slice(0, n).map((t) => t.tag)
  const contributors = (parsed<Json[]>(b.cached_contributors) ?? []) as Json[]
  const authors = contributors
    .filter((c) => !c.contribution || c.contribution === 'Author')
    .map((c) => c.author?.name as string)
    .filter(Boolean)
  const series = ((b.book_series ?? []) as Json[]).find((s) => s.series?.name)

  // Release date: Hardcover has exact dates for most books; a future Jan 1 with nothing else is usually a
  // year-only placeholder, so it's shown as just the year.
  const today = todayIso()
  let releaseDate: string | null = b.release_date ?? null
  let precision: 'day' | 'year' | 'tbd' = releaseDate ? 'day' : 'tbd'
  if (!releaseDate && typeof b.release_year === 'number') {
    releaseDate = `${b.release_year}-12-31`
    precision = 'year'
  } else if (releaseDate && releaseDate > today && releaseDate.endsWith('-01-01')) {
    releaseDate = `${releaseDate.slice(0, 4)}-12-31`
    precision = 'year'
  }
  const upcoming = releaseDate ? releaseDate > today : false
  const nowIso = new Date().toISOString()
  const rating = typeof b.rating === 'number' && b.ratings_count > 0 ? Math.round(b.rating * 100) / 100 : null

  const row = {
    media_type: 'book',
    source: 'hardcover',
    source_id: String(b.id),
    title: b.title as string,
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : (b.release_year ?? null),
    cover_url: b.image?.url ?? null,
    backdrop_url: null,
    genres: tagNames('Genre', 6),
    external_ids: { hardcover_id: b.id, hardcover_slug: b.slug ?? null },
    ratings: {
      ...(rating != null ? { hardcover: rating, hardcover_count: b.ratings_count } : {}),
      scores_checked_at: nowIso,
    },
    metadata: {
      overview: b.description ?? null,
      subtitle: b.subtitle ?? null,
      authors,
      pages: b.pages ?? null,
      series: series ? { name: series.series.name, position: series.position ?? null } : null,
      moods: tagNames('Mood', 6),
      readers: b.users_count ?? null,
      hardcover_url: b.slug ? `https://hardcover.app/books/${b.slug}` : null,
      status: upcoming || precision === 'tbd' ? 'Upcoming' : 'Released',
      release_precision: precision,
      release_label: precision === 'year' && releaseDate ? releaseDate.slice(0, 4) : precision === 'tbd' ? 'TBA' : null,
    },
    release_date: releaseDate,
    refreshed_at: nowIso,
  }

  const { data: saved, error } = await admin()
    .from('titles')
    .upsert(row, { onConflict: 'media_type,source,source_id' })
    .select()
    .single()
  if (error) {
    console.error(error)
    throw new HttpError(500, 'title_save_failed')
  }
  return json({ title: saved })
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  await requireUser(req)
  const body = (await req.json().catch(() => null)) as Json | null
  if (body?.action === 'search' && typeof body.query === 'string') return search(body.query, limitOf(body.limit))
  if (body?.action === 'add' && Number.isInteger(body.hardcoverId)) return add(body.hardcoverId)
  throw new HttpError(400, 'unknown_action')
})
