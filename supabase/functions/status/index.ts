// Settings → Status: checks every service On Deck depends on, for the signed-in user. Caller must be signed in.
//   POST { action: 'check' } → { checks: [{ service, label, state, status, ms, message }] }
// state: ok · limited (rate limit / quota, HTTP 429) · refused (key or token rejected / expired, 401/403) ·
//        error (other failure or no answer) · off (not set up / not linked for this user).
// Never returns keys or tokens.
import { admin, HttpError, json, requireUser, serve } from '../_shared/http.ts'
import { igdb } from '../_shared/igdb.ts'
import { loadIntegration, plexHeaders } from '../_shared/plex.ts'
import { vapidKeys } from '../_shared/push.ts'
import { login } from '../_shared/seerr.ts'

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

type State = 'ok' | 'limited' | 'refused' | 'error' | 'off'
interface Check {
  service: string
  label: string
  state: State
  status: number | null
  ms: number | null
  message: string
}

const stateOf = (status: number): State => (status === 429 ? 'limited' : status === 401 || status === 403 ? 'refused' : status < 400 ? 'ok' : 'error')
const MESSAGE: Record<State, string> = {
  ok: 'Working',
  limited: 'Rate limit or quota reached; requests are being refused for now',
  refused: 'Key or token refused (it may have expired)',
  error: 'Not answering correctly',
  off: 'Not set up',
}

/** Times one HTTP check; maps the status to a state. */
async function http(service: string, label: string, url: string, init: RequestInit = {}): Promise<Check> {
  const t0 = Date.now()
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) })
    await res.body?.cancel()
    const state = stateOf(res.status)
    return { service, label, state, status: res.status, ms: Date.now() - t0, message: MESSAGE[state] }
  } catch (err) {
    return { service, label, state: 'error', status: null, ms: Date.now() - t0, message: `No answer (${String(err).slice(0, 60)})` }
  }
}

/** Times a check that throws on failure; error codes containing 429 / 401 / 403 are classified. */
async function run(service: string, label: string, fn: () => Promise<unknown>): Promise<Check> {
  const t0 = Date.now()
  try {
    await fn()
    return { service, label, state: 'ok', status: 200, ms: Date.now() - t0, message: MESSAGE.ok }
  } catch (err) {
    const text = String((err as Error)?.message ?? err)
    const code = Number(text.match(/\b(4\d\d|5\d\d)\b/)?.[1] ?? 0)
    const state: State = code ? stateOf(code) : /expired|unauthor|invalid_token/i.test(text) ? 'refused' : 'error'
    return { service, label, state, status: code || null, ms: Date.now() - t0, message: `${MESSAGE[state]} (${text.slice(0, 60)})` }
  }
}

const off = (service: string, label: string, message = MESSAGE.off): Check => ({ service, label, state: 'off', status: null, ms: null, message })
const env = (name: string) => Deno.env.get(name) ?? ''

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  const user = await requireUser(req)
  const body = (await req.json().catch(() => null)) as Json | null
  if (body?.action !== 'check') throw new HttpError(400, 'unknown_action')

  const [integ, { data: profile }, { count: devices }] = await Promise.all([
    loadIntegration(user.id),
    admin().from('profiles').select('steam_id').eq('user_id', user.id).maybeSingle(),
    admin().from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const checks = await Promise.all([
    http('tmdb', 'TMDB (movies & TV)', 'https://api.themoviedb.org/3/configuration', {
      headers: { Authorization: `Bearer ${env('TMDB_READ_TOKEN')}` },
    }),
    run('igdb', 'IGDB (games)', () => igdb('games', 'fields name; limit 1;')),
    http('hardcover', 'Hardcover (books)', 'https://api.hardcover.app/v1/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${env('HARDCOVER_TOKEN').replace(/^Bearer\s+/i, '')}`,
        'user-agent': 'OnDeck/1.0',
      },
      body: JSON.stringify({ query: 'query { me { id } }' }),
    }).then(async (c) => {
      // Hardcover answers 200 with an error body when the token has expired; ask again to read it.
      if (c.state !== 'ok') return c
      const res = await fetch('https://api.hardcover.app/v1/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${env('HARDCOVER_TOKEN').replace(/^Bearer\s+/i, '')}` },
        body: JSON.stringify({ query: 'query { me { id } }' }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null)
      const b = (await res?.json().catch(() => null)) as Json | null
      return b?.errors ? { ...c, state: 'refused' as State, message: 'Token refused (it may have expired) — see docs/API-KEYS.md' } : c
    }),
    http('itad', 'IsThereAnyDeal (prices)', `https://api.isthereanydeal.com/games/lookup/v1?key=${env('ITAD_API_KEY')}&appid=367520`),
    http('mdblist', 'MDBList (IMDb & RT scores)', `https://api.mdblist.com/tmdb/movie/603?apikey=${encodeURIComponent(env('MDBLIST_API_KEY'))}`),
    http('steamstore', 'Steam store (prices, Deck)', 'https://store.steampowered.com/api/appdetails?appids=367520&filters=basic'),
    profile?.steam_id
      ? http(
          'steam',
          'Steam account (ownership, playtime)',
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${env('STEAM_API_KEY')}&steamids=${profile.steam_id}`,
        )
      : Promise.resolve(off('steam', 'Steam account (ownership, playtime)', 'Not linked (Settings → Steam)')),
    integ.plexToken
      ? http('plex', 'Plex (watch history)', 'https://plex.tv/api/v2/user', {
          headers: { ...plexHeaders(`on-deck-${user.id}`, integ.plexToken), Accept: 'application/json' },
        })
      : Promise.resolve(off('plex', 'Plex (watch history)', 'Not linked (Settings → Plex)')),
    integ.seerrUrl && integ.plexToken
      ? run('seerr', 'Seerr (requests & Plex availability)', () => login(integ.seerrUrl!, integ.plexToken!))
      : Promise.resolve(off('seerr', 'Seerr (requests & Plex availability)', 'Not set up (Settings → Plex)')),
    Promise.resolve<Check>(
      vapidKeys()
        ? {
            service: 'push',
            label: 'Push notifications',
            state: 'ok',
            status: null,
            ms: null,
            message: devices ? `Ready · ${devices} device${devices === 1 ? '' : 's'}` : 'Ready · no devices turned on yet',
          }
        : off('push', 'Push notifications', 'Server keys missing'),
    ),
  ])

  // Secrets that aren't set at all read as "not set up" rather than "refused".
  const missing: Record<string, string> = {
    tmdb: 'TMDB_READ_TOKEN',
    hardcover: 'HARDCOVER_TOKEN',
    itad: 'ITAD_API_KEY',
    mdblist: 'MDBLIST_API_KEY',
  }
  for (const c of checks) {
    const name = missing[c.service]
    if (name && !env(name)) Object.assign(c, off(c.service, c.label, `Server key ${name} missing`))
  }
  return json({ checks, checkedAt: new Date().toISOString() })
})
