// Reads the user's own Plex watch history for one TV show or movie.
//   POST { action: 'sync', tmdbId, title, mediaType: 'tv' }
//     → { found, server, lastWatched: { season, episode } | null, watchedCount, plexEpisodes }
//   POST { action: 'sync', tmdbId, title, mediaType: 'movie' }
//     → { found, server, movie: { state: 'watched' | 'in_progress' | 'unwatched', percent } }
// Finds the show on the Plex servers the user can access (their own or shared with them): searches by title,
// then confirms the match by the TMDB id Plex stores on the show (so remakes / same-name shows don't mix up),
// then reads which episodes *this user* has watched (Plex keeps watch state per user).
// Caller must be signed in. The Plex token never leaves the server.
// Side effect: when Plex has a later "last watched" time than the library entry's last_activity_at, it's saved,
// so Home's Continue reflects when you actually watched (not when the sync ran).
import { admin, HttpError, json, requireUser, serve } from '../_shared/http.ts'
import { loadIntegration } from '../_shared/plex.ts'
import { plexGet, servers } from '../_shared/plexServers.ts'

// deno-lint-ignore no-explicit-any
type Json = any

/** Does this Plex item carry the given TMDB id? (needs includeGuids=1) */
const hasTmdb = (item: Json, tmdbId: number) =>
  ((item?.Guid ?? []) as { id: string }[]).some((g) => g.id === `tmdb://${tmdbId}`)

/**
 * Finds the show/movie on one server connection. Returns undefined if the connection failed (try another),
 * null if the server is reachable but doesn't have it.
 */
async function findItem(
  uri: string,
  token: string,
  title: string,
  tmdbId: number,
  kind: 'show' | 'movie',
): Promise<Json | null | undefined> {
  const q = encodeURIComponent(title)
  const hubs = await plexGet(uri, `/hubs/search?query=${q}&limit=10&includeGuids=1`, token)
  if (hubs === null) return undefined
  const shows = ((hubs?.MediaContainer?.Hub ?? []) as Json[])
    .filter((h) => h.type === kind)
    .flatMap((h) => (h.Metadata ?? []) as Json[])
  for (const show of shows) {
    if (hasTmdb(show, tmdbId)) return show
    // Search results don't always carry guids — fetch the item to check.
    const full = await plexGet(uri, `/library/metadata/${show.ratingKey}?includeGuids=1`, token)
    if (hasTmdb(full?.MediaContainer?.Metadata?.[0], tmdbId)) return show
  }
  return null
}

/** Moves the user's library entry's last_activity_at forward to `iso` (never backwards). Best effort. */
async function saveActivity(userId: string, tmdbId: number, mediaType: 'movie' | 'tv', iso: string) {
  try {
    const db = admin()
    const { data: t } = await db.from('titles').select('id').eq('source', 'tmdb').eq('media_type', mediaType).eq('source_id', String(tmdbId)).maybeSingle()
    if (!t) return
    await db
      .from('user_items')
      .update({ last_activity_at: iso })
      .eq('user_id', userId)
      .eq('title_id', t.id)
      .or(`last_activity_at.is.null,last_activity_at.lt."${iso}"`)
  } catch {
    // not worth failing the sync over
  }
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  const user = await requireUser(req)
  const body = (await req.json().catch(() => null)) as Json
  if (body?.action !== 'sync') throw new HttpError(400, 'unknown_action')
  const tmdbId = Number(body.tmdbId)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new HttpError(400, 'bad_tmdb_id')
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  if (!title) throw new HttpError(400, 'missing_title')
  const isMovie = body.mediaType === 'movie'

  const integ = await loadIntegration(user.id)
  if (!integ.plexToken) return json({ configured: false })

  const list = await servers(`on-deck-${user.id}`, integ.plexToken)
  if (list.length === 0) return json({ configured: true, found: false, reason: 'no_reachable_server' })

  for (const server of list) {
    for (const uri of server.uris) {
      const show = await findItem(uri, server.token, title, tmdbId, isMovie ? 'movie' : 'show')
      if (show === undefined) continue // connection failed → try the next connection
      if (show === null) break // reachable, but this server doesn't have it → next server

      // Latest time this user watched any of it (Plex keeps lastViewedAt per user, partial plays included).
      const noteActivity = async (items: Json[]) => {
        const latest = Math.max(0, ...items.map((e) => Number(e.lastViewedAt ?? 0)))
        if (latest > 0) await saveActivity(user.id, tmdbId, isMovie ? 'movie' : 'tv', new Date(latest * 1000).toISOString())
      }

      if (isMovie) {
        // Fresh read: this user's view count / resume point (search results can be stale or partial).
        const full = await plexGet(uri, `/library/metadata/${show.ratingKey}`, server.token)
        const m = full?.MediaContainer?.Metadata?.[0] ?? show
        const offset = Number(m.viewOffset ?? 0)
        const duration = Number(m.duration ?? 0)
        const watched = Number(m.viewCount ?? 0) > 0
        const state = watched ? 'watched' : offset > 0 ? 'in_progress' : 'unwatched'
        const percent = watched ? 100 : duration > 0 ? Math.min(99, Math.round((offset / duration) * 100)) : 0
        await noteActivity([m])
        return json({ configured: true, found: true, server: server.name, movie: { state, percent } })
      }

      const leaves = await plexGet(uri, `/library/metadata/${show.ratingKey}/allLeaves`, server.token)
      const episodes = ((leaves?.MediaContainer?.Metadata ?? []) as Json[]).filter((e) => (e.parentIndex ?? 0) > 0)
      const watched = episodes.filter((e) => (e.viewCount ?? 0) > 0)
      await noteActivity(episodes)
      const last = watched.reduce<Json | null>(
        (best, e) =>
          !best || e.parentIndex > best.parentIndex || (e.parentIndex === best.parentIndex && e.index > best.index)
            ? e
            : best,
        null,
      )
      return json({
        configured: true,
        found: true,
        server: server.name,
        lastWatched: last ? { season: last.parentIndex, episode: last.index } : null,
        watchedCount: watched.length,
        plexEpisodes: episodes.length,
      })
    }
  }
  return json({ configured: true, found: false, reason: 'not_on_plex' })
})
