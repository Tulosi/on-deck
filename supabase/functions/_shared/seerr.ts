// Seerr (Overseerr / Jellyseerr / Seerr) access shared by the `seerr` and `availability` functions.
import { HttpError } from './http.ts'

export type MediaType = 'movie' | 'tv'

/** Seerr MediaStatus → our status. */
export function mapStatus(code: number | undefined): string {
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

export async function seerrFetch(base: string, path: string, init: RequestInit = {}) {
  try {
    return await fetch(base + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(8000) })
  } catch {
    throw new HttpError(502, 'seerr_unreachable')
  }
}

/** Signs in to Seerr with the Plex token; returns the session cookie header. */
export async function login(base: string, plexToken: string): Promise<string> {
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

export async function details(base: string, cookie: string, mediaType: MediaType, tmdbId: number) {
  const res = await seerrFetch(base, `/api/v1/${mediaType}/${tmdbId}`, { headers: { Cookie: cookie, Accept: 'application/json' } })
  if (res.status === 404) return null
  if (!res.ok) throw new HttpError(502, `seerr_error_${res.status}`)
  return await res.json()
}

