// Import pickers (docs/ROADMAP.md → Group F). Builds the candidate lists the user picks from; adding is done by
// the app through the normal add path. Caller must be signed in.
//   POST { action: 'steam' } → candidates from the linked Steam account: games played + the wishlist
//   POST { action: 'plex' }  → candidates from the user's Plex watch history: shows and movies they've watched
// Each candidate: { key, source, sourceId, mediaType, title, year, poster, group, detail, suggested, sortValue }
//   key: "game:igdb:<id>" / "movie:tmdb:<id>" / "tv:tmdb:<id>" (same as the app's sourceKey)
// Suggested (pre-ticked in the picker; the user can still change anything):
//   Steam: top 20 most-played games last played within 2 years (by playtime)
//   TV:    top 20 shows watched within 2 years (by episodes watched)
//   Movies: top 20 watched within 2 years, by rating: Plex's IMDb rating when the server stores it, else TMDB's
//           audience score (many Plex setups don't store IMDb ratings)
import { admin, HttpError, json, requireUser, secret, serve } from '../_shared/http.ts'
import { igdb, igdbImage } from '../_shared/igdb.ts'
import { loadIntegration } from '../_shared/plex.ts'
import { plexGet, servers } from '../_shared/plexServers.ts'

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

interface Candidate {
  key: string
  source: 'igdb' | 'tmdb'
  sourceId: string
  mediaType: 'game' | 'movie' | 'tv'
  title: string
  year: number | null
  poster: string | null
  group: string
  detail: string
  suggested: boolean
  /** For ordering within a group (playtime minutes, episodes watched, last-watched time …). */
  sortValue: number
}

const TWO_YEARS_MS = 2 * 365 * 86_400_000
const SUGGEST = 20
const STEAM_SOURCE = 1 // IGDB external_game_source for Steam

async function getJson(url: string, timeout = 10000): Promise<Json | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { Accept: 'application/json' } })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

const hours = (min: number) => (min < 60 ? `${min} min played` : `${Math.round(min / 60)} h played`)
const monthYear = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

// ─── Steam ─────────────────────────────────────────────────────────────────

/** Steam app ids → IGDB games (id, name, year, cover). On Deck's games come from IGDB, so unmatched ones can't be added. */
async function igdbForSteam(appIds: string[]): Promise<Map<string, { id: number; name: string; year: number | null; cover: string | null }>> {
  const out = new Map<string, { id: number; name: string; year: number | null; cover: string | null }>()
  for (let i = 0; i < appIds.length; i += 200) {
    const chunk = appIds.slice(i, i + 200)
    const links = await igdb(
      'external_games',
      `fields game,uid; where external_game_source = ${STEAM_SOURCE} & uid = (${chunk.map((a) => `"${a}"`).join(',')}); limit 500;`,
    ).catch(() => [] as Json[])
    const gameIds = [...new Set(links.map((l) => l.game).filter(Boolean))] as number[]
    if (!gameIds.length) continue
    const games = await igdb('games', `fields name,first_release_date,cover.image_id; where id = (${gameIds.join(',')}); limit 500;`).catch(
      () => [] as Json[],
    )
    const byId = new Map(games.map((g) => [g.id as number, g]))
    for (const l of links) {
      const g = byId.get(l.game)
      if (!g || out.has(String(l.uid))) continue
      out.set(String(l.uid), {
        id: g.id,
        name: g.name,
        year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
        cover: igdbImage(g.cover?.image_id, 't_cover_big'),
      })
    }
  }
  return out
}

async function steamCandidates(steamId: string) {
  const key = secret('STEAM_API_KEY')
  const [owned, wish] = await Promise.all([
    getJson(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId}&include_played_free_games=1&include_appinfo=1`,
    ),
    getJson(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?key=${key}&steamid=${steamId}`),
  ])
  if (!Array.isArray(owned?.response?.games)) return { candidates: [], note: 'private' as const }

  const now = Date.now()
  const played = (owned.response.games as Json[])
    .map((g) => ({
      appid: String(g.appid),
      name: g.name as string,
      minutes: Number(g.playtime_forever ?? 0) || 0,
      last: Number(g.rtime_last_played) > 0 ? Number(g.rtime_last_played) * 1000 : 0,
    }))
    .filter((g) => g.minutes > 0)
  const wishlist = ((wish?.response?.items ?? []) as Json[]).map((w) => ({
    appid: String(w.appid),
    added: Number(w.date_added) * 1000 || 0,
    priority: Number(w.priority ?? 0),
  }))
  const ownedIds = new Set(played.map((g) => g.appid))
  const igdbOf = await igdbForSteam([...new Set([...played.map((g) => g.appid), ...wishlist.map((w) => w.appid)])])

  // Suggested: most played among games last played within 2 years.
  const suggested = new Set(
    played
      .filter((g) => g.last && now - g.last < TWO_YEARS_MS)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, SUGGEST)
      .map((g) => g.appid),
  )

  const candidates: Candidate[] = []
  let unmatched = 0
  for (const g of played) {
    const m = igdbOf.get(g.appid)
    if (!m) {
      unmatched++
      continue
    }
    candidates.push({
      key: `game:igdb:${m.id}`,
      source: 'igdb',
      sourceId: String(m.id),
      mediaType: 'game',
      title: m.name,
      year: m.year,
      poster: m.cover ?? `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`,
      group: 'Played on Steam',
      detail: `${hours(g.minutes)}${g.last ? ` · last ${monthYear(g.last)}` : ''}`,
      suggested: suggested.has(g.appid),
      sortValue: g.minutes,
    })
  }
  for (const w of wishlist) {
    if (ownedIds.has(w.appid)) continue
    const m = igdbOf.get(w.appid)
    if (!m) {
      unmatched++
      continue
    }
    candidates.push({
      key: `game:igdb:${m.id}`,
      source: 'igdb',
      sourceId: String(m.id),
      mediaType: 'game',
      title: m.name,
      year: m.year,
      poster: m.cover ?? `https://cdn.cloudflare.steamstatic.com/steam/apps/${w.appid}/library_600x900.jpg`,
      group: 'Steam wishlist',
      detail: w.added ? `Wishlisted ${monthYear(w.added)}` : 'On your wishlist',
      suggested: false,
      sortValue: -w.priority,
    })
  }
  return { candidates, unmatched }
}

// ─── Plex ──────────────────────────────────────────────────────────────────

const tmdbIdOf = (item: Json): number | null => {
  const g = ((item?.Guid ?? []) as { id: string }[]).find((x) => x.id.startsWith('tmdb://'))
  return g ? Number(g.id.slice(7)) || null : null
}

/** TMDB poster and score for a title (posters can't come from Plex: that would expose the server token). */
async function tmdbBasics(mediaType: 'movie' | 'tv', id: number): Promise<{ poster: string | null; score: number | null }> {
  let d: Json | null = null
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?language=en-US`, {
      headers: { Authorization: `Bearer ${secret('TMDB_READ_TOKEN')}`, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    d = res.ok ? await res.json() : null
  } catch {
    d = null
  }
  return d
    ? { poster: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : null, score: typeof d.vote_average === 'number' ? d.vote_average : null }
    : { poster: null, score: null }
}

async function plexCandidates(userId: string) {
  const integ = await loadIntegration(userId)
  if (!integ.plexToken) return { candidates: [], note: 'not_linked' as const }
  const list = await servers(`on-deck-${userId}`, integ.plexToken)

  interface Raw {
    mediaType: 'movie' | 'tv'
    tmdbId: number
    title: string
    year: number | null
    last: number
    watched: number // episodes (TV) or plays (movie)
    total: number // episodes (TV)
    imdbRating: number | null
  }
  const raw = new Map<string, Raw>()
  for (const server of list) {
    for (const uri of server.uris) {
      const sections = await plexGet(uri, '/library/sections', server.token)
      if (sections === null) continue // try the next connection
      for (const sec of (sections?.MediaContainer?.Directory ?? []) as Json[]) {
        if (sec.type !== 'movie' && sec.type !== 'show') continue
        // Most recently watched first, in pages; stop at the first never-watched title (big libraries are slow
        // to list in full).
        const watchedItems: Json[] = []
        for (let start = 0; start < 5000; start += 300) {
          const page = await plexGet(
            uri,
            `/library/sections/${sec.key}/all?includeGuids=1&sort=lastViewedAt:desc&X-Plex-Container-Start=${start}&X-Plex-Container-Size=300`,
            server.token,
            20000,
          )
          const rows = (page?.MediaContainer?.Metadata ?? []) as Json[]
          const seen = rows.filter((r) => Number(r.lastViewedAt ?? 0) > 0)
          watchedItems.push(...seen)
          if (rows.length < 300 || seen.length < rows.length) break
        }
        for (const it of watchedItems) {
          const tmdbId = tmdbIdOf(it)
          if (!tmdbId) continue
          const isShow = sec.type === 'show'
          const watched = isShow ? Number(it.viewedLeafCount ?? 0) : Number(it.viewCount ?? 0)
          if (watched <= 0) continue
          const mediaType = isShow ? 'tv' : 'movie'
          const key = `${mediaType}:tmdb:${tmdbId}`
          const imdb = String(it.ratingImage ?? '').startsWith('imdb')
            ? Number(it.rating)
            : String(it.audienceRatingImage ?? '').startsWith('imdb')
              ? Number(it.audienceRating)
              : null
          const prev = raw.get(key)
          const last = Number(it.lastViewedAt ?? 0) * 1000
          if (!prev || last > prev.last) {
            raw.set(key, {
              mediaType,
              tmdbId,
              // Plex sometimes keeps the year in the title ("Bluey (2018)").
              title: String(it.title).replace(/\s*\((19|20)\d{2}\)\s*$/, ''),
              year: typeof it.year === 'number' ? it.year : null,
              last,
              watched,
              total: Number(it.leafCount ?? 0),
              imdbRating: Number.isFinite(imdb) ? imdb : null,
            })
          }
        }
      }
      break // this server answered; don't repeat it through another connection
    }
  }

  // Posters (and a fallback score) from TMDB, 10 at a time.
  const items = [...raw.values()]
  const basics = new Map<string, { poster: string | null; score: number | null }>()
  for (let i = 0; i < items.length; i += 10) {
    await Promise.all(
      items.slice(i, i + 10).map(async (r) => basics.set(`${r.mediaType}:${r.tmdbId}`, await tmdbBasics(r.mediaType, r.tmdbId))),
    )
  }

  const now = Date.now()
  const recent = (r: Raw) => r.last && now - r.last < TWO_YEARS_MS
  const ratingOf = (r: Raw) => r.imdbRating ?? basics.get(`${r.mediaType}:${r.tmdbId}`)?.score ?? 0
  const suggestedTv = new Set(
    items
      .filter((r) => r.mediaType === 'tv' && recent(r))
      .sort((a, b) => b.watched - a.watched)
      .slice(0, SUGGEST)
      .map((r) => r.tmdbId),
  )
  const suggestedMovies = new Set(
    items
      .filter((r) => r.mediaType === 'movie' && recent(r))
      .sort((a, b) => ratingOf(b) - ratingOf(a))
      .slice(0, SUGGEST)
      .map((r) => r.tmdbId),
  )

  const candidates: Candidate[] = items.map((r) => ({
    key: `${r.mediaType}:tmdb:${r.tmdbId}`,
    source: 'tmdb',
    sourceId: String(r.tmdbId),
    mediaType: r.mediaType,
    title: r.title,
    year: r.year,
    poster: basics.get(`${r.mediaType}:${r.tmdbId}`)?.poster ?? null,
    group: r.mediaType === 'tv' ? 'Shows you’ve watched on Plex' : 'Movies you’ve watched on Plex',
    detail:
      r.mediaType === 'tv'
        ? `${r.watched}${r.total ? ` of ${r.total}` : ''} episodes${r.last ? ` · last ${monthYear(r.last)}` : ''}`
        : `${r.last ? `Watched ${monthYear(r.last)}` : 'Watched'}${ratingOf(r) ? ` · ★ ${ratingOf(r).toFixed(1)}` : ''}`,
    suggested: r.mediaType === 'tv' ? suggestedTv.has(r.tmdbId) : suggestedMovies.has(r.tmdbId),
    sortValue: r.last,
  }))
  return { candidates }
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  const user = await requireUser(req)
  const body = (await req.json().catch(() => null)) as Json | null
  if (body?.action === 'steam') {
    const { data: profile } = await admin().from('profiles').select('steam_id').eq('user_id', user.id).maybeSingle()
    if (!profile?.steam_id) return json({ candidates: [], note: 'not_linked' })
    return json(await steamCandidates(profile.steam_id))
  }
  if (body?.action === 'plex') return json(await plexCandidates(user.id))
  throw new HttpError(400, 'unknown_action')
})
