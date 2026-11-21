// Per-user Seerr proxy (Overseerr / Jellyseerr / Seerr share this API).
// Signs in to the user's own Seerr with their linked Plex token, then:
//   POST { action: 'test', seerrUrl? }               → { ok, seerrUser }  (checks a URL before saving it)
//   POST { action: 'status', tmdbId, mediaType }     → { configured, status, requested, plexUrl, seerrUrl }
//   POST { action: 'request', tmdbId, mediaType, seasons? } → same shape, re-read from Seerr after requesting.
//        TV: `seasons` = the season numbers to request; omitted → every season not already on Plex/requested.
// TV replies also carry `seasons: [{ number, name, episodes, status, requested }]` for the season picker.
// status (what's on Plex): 'available' | 'partial' | 'processing' | 'pending' | 'missing'
// requested: an open request exists (pending approval or approved/downloading). Independent of status,
//            so "partly on Plex + the rest requested" keeps its Open in Plex link.
// Caller must be signed in. Neither the Plex token nor Seerr's session cookie is ever returned.
import { HttpError, json, requireUser, serve } from '../_shared/http.ts'
import { checkSeerrUrl, loadIntegration } from '../_shared/plex.ts'
import { details, login, mapStatus, seerrFetch } from '../_shared/seerr.ts'

type MediaType = 'movie' | 'tv'

// deno-lint-ignore no-explicit-any
type Details = any

/** Seerr MediaRequestStatus: 1 pending approval, 2 approved (3 declined, 4 failed, 5 completed). */
const OPEN_REQUEST = new Set([1, 2])

interface SeasonInfo {
  number: number
  name: string
  episodes: number | null
  status: string
  requested: boolean
  requestable: boolean
}

/** Seerr MediaStatus codes. A season can only be requested while it's UNKNOWN (nothing on Plex) or DELETED —
 *  Seerr itself silently skips seasons that are pending, processing, partly or fully available. */
const REQUESTABLE_STATUS = new Set([undefined, 1, 7])
const AVAILABLE = 5

/** Per-season state for TV (specials / season 0 left out). */
function seasonList(d: Details): SeasonInfo[] {
  const info = d?.mediaInfo
  const statusBySeason = new Map<number, number>()
  for (const s of (info?.seasons ?? []) as { seasonNumber: number; status: number }[]) {
    statusBySeason.set(s.seasonNumber, s.status)
  }
  const requestedSeasons = new Set<number>()
  for (const r of (info?.requests ?? []) as { status: number; seasons?: { seasonNumber: number }[] }[]) {
    if (!OPEN_REQUEST.has(r.status)) continue
    for (const s of r.seasons ?? []) requestedSeasons.add(s.seasonNumber)
  }
  return ((d?.seasons ?? []) as { seasonNumber: number; name?: string; episodeCount?: number }[])
    .filter((s) => s.seasonNumber > 0)
    .map((s) => {
      const code = statusBySeason.get(s.seasonNumber)
      const status = mapStatus(code)
      // A fulfilled request (season now fully on Plex) no longer counts as "requested".
      const requested =
        code !== AVAILABLE && (requestedSeasons.has(s.seasonNumber) || status === 'pending' || status === 'processing')
      return {
        number: s.seasonNumber,
        name: s.name || `Season ${s.seasonNumber}`,
        episodes: s.episodeCount ?? null,
        status,
        requested,
        requestable: REQUESTABLE_STATUS.has(code) && !requested,
      }
    })
}

/** Seasons that can still be requested: nothing of them on Plex, and not already requested. */
const requestable = (seasons: SeasonInfo[]) => seasons.filter((s) => s.requestable).map((s) => s.number)

function summarise(d: Details, mediaType: MediaType, base: string, tmdbId: number) {
  const info = d?.mediaInfo
  const status = mapStatus(info?.status)
  const openRequest = ((info?.requests ?? []) as { status: number }[]).some((r) => OPEN_REQUEST.has(r.status))
  const seasons = mediaType === 'tv' ? seasonList(d) : undefined
  // TV: requested if any season still has an open request. Movies: an open request, until it's on Plex.
  const requested = seasons
    ? seasons.some((s) => s.requested)
    : status !== 'available' && (openRequest || status === 'pending' || status === 'processing')
  return {
    configured: true,
    status,
    requested,
    plexUrl: info?.plexUrl ?? info?.mediaUrl ?? null,
    seerrUrl: `${base}/${mediaType}/${tmdbId}`, // the title's page in the user's own Seerr
    ...(seasons ? { seasons, canRequest: requestable(seasons).length > 0 } : {}),
  }
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  const user = await requireUser(req)
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const integ = await loadIntegration(user.id)

  if (body?.action === 'test') {
    const base = checkSeerrUrl(typeof body.seerrUrl === 'string' ? body.seerrUrl : (integ.seerrUrl ?? ''))
    if (!integ.plexToken) throw new HttpError(400, 'plex_not_linked')
    const cookie = await login(base, integ.plexToken)
    const me = await seerrFetch(base, '/api/v1/auth/me', { headers: { Cookie: cookie, Accept: 'application/json' } })
    const seerrUser = me.ok ? ((await me.json()).displayName ?? null) : null
    return json({ ok: true, seerrUser })
  }

  if (body?.action !== 'status' && body?.action !== 'request') throw new HttpError(400, 'unknown_action')
  const tmdbId = Number(body.tmdbId)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new HttpError(400, 'bad_tmdb_id')
  if (body.mediaType !== 'movie' && body.mediaType !== 'tv') throw new HttpError(400, 'bad_media_type')
  const mediaType = body.mediaType as MediaType

  // Not set up yet → tell the app, so it can show "Set up Plex" instead of an error.
  if (!integ.plexToken || !integ.seerrUrl) {
    return json({ configured: false, missing: [!integ.plexToken && 'plex', !integ.seerrUrl && 'seerr'].filter(Boolean) })
  }
  const base = checkSeerrUrl(integ.seerrUrl)
  const cookie = await login(base, integ.plexToken)
  const d = await details(base, cookie, mediaType, tmdbId)

  if (body.action === 'status') return json(summarise(d, mediaType, base, tmdbId))

  // Request. TV: only seasons that are still requestable — the ones chosen, or all of them.
  let seasons: number[] | undefined
  if (mediaType === 'tv') {
    const open = requestable(seasonList(d))
    const chosen = Array.isArray(body.seasons) ? body.seasons.map(Number).filter(Number.isInteger) : null
    seasons = chosen ? open.filter((n) => chosen.includes(n)) : open
    if (seasons.length === 0) return json(summarise(d, mediaType, base, tmdbId)) // nothing left to request
  }
  const res = await seerrFetch(base, '/api/v1/request', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ mediaType, mediaId: tmdbId, ...(seasons ? { seasons } : {}) }),
  })
  if (res.status === 403) throw new HttpError(403, 'seerr_request_not_allowed')
  if (!res.ok && res.status !== 409) throw new HttpError(502, `seerr_request_failed_${res.status}`) // 409 = already requested
  // Re-read so the reply carries the full picture (incl. the Plex link), not just the new request.
  const after = await details(base, cookie, mediaType, tmdbId)
  return json({ ...summarise(after, mediaType, base, tmdbId), requested: true })
})
