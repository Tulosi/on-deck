// Per-user Seerr proxy (Overseerr / Jellyseerr / Seerr share this API).
// Signs in to the user's own Seerr with their linked Plex token, then:
//   POST { action: 'test', seerrUrl? }               → { ok, seerrUser }  (checks a URL before saving it)
//   POST { action: 'status', tmdbId, mediaType }     → { configured, status, requested, plexUrl }
//   POST { action: 'request', tmdbId, mediaType, seasons? } → same shape, re-read from Seerr after requesting.
//        TV: `seasons` = the season numbers to request; omitted → every season not already on Plex/requested.
// TV replies also carry `seasons: [{ number, name, episodes, status, requested }]` for the season picker.
// status (what's on Plex): 'available' | 'partial' | 'processing' | 'pending' | 'missing'
// requested: an open request exists (pending approval or approved/downloading). Independent of status,
//            so "partly on Plex + the rest requested" keeps its Open in Plex link.
// Caller must be signed in. Neither the Plex token nor Seerr's session cookie is ever returned.
import { HttpError, json, requireUser, serve } from '../_shared/http.ts'
import { checkSeerrUrl, loadIntegration } from '../_shared/plex.ts'

type MediaType = 'movie' | 'tv'

/** Seerr MediaStatus → our status. */
function mapStatus(code: number | undefined): string {
  switch (code) {
    case 5:
      return 'available'
    case 4:
      return 'partial'
    case 3:
      return 'processing' // approved, being downloaded
    case 2:
      return 'pending' // requested, awaiting approval
    default:
      return 'missing'
  }
}

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
}

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
      const status = mapStatus(statusBySeason.get(s.seasonNumber))
      return {
        number: s.seasonNumber,
        name: s.name || `Season ${s.seasonNumber}`,
        episodes: s.episodeCount ?? null,
        status,
        requested: requestedSeasons.has(s.seasonNumber) || status === 'pending' || status === 'processing',
      }
    })
}

/** Seasons that can still be requested: not on Plex and not already requested. */
const requestable = (seasons: SeasonInfo[]) =>
  seasons.filter((s) => (s.status === 'missing' || s.status === 'partial') && !s.requested).map((s) => s.number)

function summarise(d: Details, mediaType: MediaType) {
  const info = d?.mediaInfo
  const status = mapStatus(info?.status)
  const openRequest = ((info?.requests ?? []) as { status: number }[]).some((r) => OPEN_REQUEST.has(r.status))
  const seasons = mediaType === 'tv' ? seasonList(d) : undefined
  return {
    configured: true,
    status,
    requested: openRequest || status === 'pending' || status === 'processing',
    plexUrl: info?.plexUrl ?? info?.mediaUrl ?? null,
    ...(seasons ? { seasons, canRequest: requestable(seasons).length > 0 } : {}),
  }
}

async function seerrFetch(base: string, path: string, init: RequestInit = {}) {
  try {
    return await fetch(base + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(8000) })
  } catch {
    throw new HttpError(502, 'seerr_unreachable')
  }
}

/** Signs in to Seerr with the Plex token; returns the session cookie header. */
async function login(base: string, plexToken: string): Promise<string> {
  const res = await seerrFetch(base, '/api/v1/auth/plex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ authToken: plexToken }),
  })
  if (res.status === 401 || res.status === 403) throw new HttpError(403, 'seerr_login_denied')
  if (!res.ok) throw new HttpError(502, `seerr_login_failed_${res.status}`)
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0])
  if (cookies.length === 0) throw new HttpError(502, 'seerr_no_session')
  return cookies.join('; ')
}

async function details(base: string, cookie: string, mediaType: MediaType, tmdbId: number) {
  const res = await seerrFetch(base, `/api/v1/${mediaType}/${tmdbId}`, { headers: { Cookie: cookie, Accept: 'application/json' } })
  if (res.status === 404) return null
  if (!res.ok) throw new HttpError(502, `seerr_error_${res.status}`)
  return await res.json()
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

  if (body.action === 'status') return json(summarise(d, mediaType))

  // Request. TV: only seasons that are still requestable — the ones chosen, or all of them.
  let seasons: number[] | undefined
  if (mediaType === 'tv') {
    const open = requestable(seasonList(d))
    const chosen = Array.isArray(body.seasons) ? body.seasons.map(Number).filter(Number.isInteger) : null
    seasons = chosen ? open.filter((n) => chosen.includes(n)) : open
    if (seasons.length === 0) return json(summarise(d, mediaType)) // nothing left to request
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
  return json({ ...summarise(after, mediaType), requested: true })
})
