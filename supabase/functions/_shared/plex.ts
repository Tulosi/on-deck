// Plex account linking + the per-user integration settings (Plex token, Seerr URL).
// The Plex token is stored only in user_integrations, which has no client grants: it never reaches a browser.
import { admin, HttpError } from './http.ts'

export const PLEX_PRODUCT = 'On Deck'

export function plexHeaders(clientId: string, token?: string): HeadersInit {
  return {
    Accept: 'application/json',
    'X-Plex-Product': PLEX_PRODUCT,
    'X-Plex-Client-Identifier': clientId,
    ...(token ? { 'X-Plex-Token': token } : {}),
  }
}

export interface Integration {
  plexToken: string | null
  plexUsername: string | null
  seerrUrl: string | null
}

export async function loadIntegration(userId: string): Promise<Integration> {
  const [{ data: integ }, { data: profile }] = await Promise.all([
    admin().from('user_integrations').select('plex_token, plex_username').eq('user_id', userId).maybeSingle(),
    admin().from('profiles').select('seerr_url').eq('user_id', userId).maybeSingle(),
  ])
  return {
    plexToken: integ?.plex_token ?? null,
    plexUsername: integ?.plex_username ?? null,
    seerrUrl: profile?.seerr_url ?? null,
  }
}

/**
 * Validates a user-entered Seerr URL before the server fetches it: public https only, no
 * credentials, no localhost / private-network addresses (so it can't be used to probe internal hosts).
 */
export function checkSeerrUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new HttpError(400, 'seerr_url_invalid')
  }
  if (url.protocol !== 'https:') throw new HttpError(400, 'seerr_url_not_https')
  if (url.username || url.password) throw new HttpError(400, 'seerr_url_invalid')
  const host = url.hostname.toLowerCase()
  const privateHost =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^0\./.test(host) ||
    host.startsWith('[') // IPv6 literals
  if (privateHost) throw new HttpError(400, 'seerr_url_private')
  return url.origin + url.pathname.replace(/\/+$/, '')
}
