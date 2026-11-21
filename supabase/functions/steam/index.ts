// Steam account link (Steam OpenID 2.0) and the "already owned" check. Caller must be signed in.
//   POST { action: 'verify', params }   → checks a Steam OpenID sign-in reply with Steam, stores the SteamID
//                                          → { linked: true, steamId, name }
//   POST { action: 'unlink' }           → { linked: false }
//   POST { action: 'owned', titleIds? } → for the user's games in their Steam library: marks them In Your
//                                          Library, records playtime, and moves Wanted → In Progress once
//                                          there's playtime. Never overrides what the user set by hand.
//                                          → { checked, newlyOwned, newlyStarted, private }
// The Steam Web API key stays server-side. Library visibility depends on the user's Steam privacy setting
// ("Game details" must be Public).
import { admin, HttpError, json, requireUser, secret, serve } from '../_shared/http.ts'

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

const OPENID = 'https://steamcommunity.com/openid/login'
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/

/** Asks Steam whether a sign-in reply is genuine (and unused). Returns the SteamID64 if so. */
async function verifyOpenId(params: Record<string, string>): Promise<string> {
  if (params['openid.op_endpoint'] !== OPENID) throw new HttpError(400, 'steam_bad_reply')
  const match = CLAIMED_ID.exec(params['openid.claimed_id'] ?? '')
  if (!match || params['openid.identity'] !== params['openid.claimed_id']) throw new HttpError(400, 'steam_bad_reply')

  const form = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (k.startsWith('openid.')) form.set(k, String(v))
  form.set('openid.mode', 'check_authentication')
  const res = await fetch(OPENID, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(8000),
  })
  const text = await res.text()
  if (!res.ok || !/is_valid\s*:\s*true/.test(text)) throw new HttpError(403, 'steam_not_verified')
  return match[1]
}

async function playerName(steamId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${secret('STEAM_API_KEY')}&steamids=${steamId}`,
      { signal: AbortSignal.timeout(6000) },
    )
    const d = await res.json()
    return d?.response?.players?.[0]?.personaname ?? null
  } catch {
    return null
  }
}

interface OwnedGame {
  minutes: number
  lastPlayed: string | null
}

/** The user's Steam library (app id → playtime), or null if their game details are private. */
async function ownedGames(steamId: string): Promise<Map<string, OwnedGame> | null> {
  const url =
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${secret('STEAM_API_KEY')}` +
    `&steamid=${steamId}&include_played_free_games=1&include_appinfo=0`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new HttpError(502, `steam_error_${res.status}`)
  const d = await res.json()
  // Private profiles come back with an empty `response` (no `games` key).
  if (!Array.isArray(d?.response?.games)) return null
  return new Map(
    (d.response.games as Json[]).map((g) => [
      String(g.appid),
      {
        minutes: Number(g.playtime_forever ?? 0) || 0,
        lastPlayed: Number(g.rtime_last_played) > 0 ? new Date(Number(g.rtime_last_played) * 1000).toISOString() : null,
      },
    ]),
  )
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  const user = await requireUser(req)
  const body = (await req.json().catch(() => null)) as Json | null
  const db = admin()

  switch (body?.action) {
    case 'verify': {
      const params = body.params as Record<string, string> | undefined
      if (!params || typeof params !== 'object') throw new HttpError(400, 'steam_bad_reply')
      const steamId = await verifyOpenId(params)
      const name = await playerName(steamId)
      const { error } = await db.from('profiles').update({ steam_id: steamId, steam_name: name }).eq('user_id', user.id)
      if (error) throw new HttpError(500, 'save_failed')
      return json({ linked: true, steamId, name })
    }

    case 'unlink': {
      await db.from('profiles').update({ steam_id: null, steam_name: null }).eq('user_id', user.id)
      return json({ linked: false })
    }

    case 'owned': {
      const { data: profile } = await db.from('profiles').select('steam_id').eq('user_id', user.id).maybeSingle()
      const steamId = profile?.steam_id as string | null
      if (!steamId) return json({ checked: 0, newlyOwned: 0, newlyStarted: 0, linked: false })

      let query = db
        .from('user_items')
        .select(
          'id, owned, owned_locked, progress, progress_locked, started_at, steam_playtime_minutes, title:titles(id, media_type, external_ids)',
        )
        .eq('user_id', user.id)
      if (Array.isArray(body.titleIds) && body.titleIds.length) query = query.in('title_id', body.titleIds.map(String))
      const { data: rows, error } = await query
      if (error) throw new HttpError(500, 'load_failed')
      const games = ((rows ?? []) as unknown as Json[]).filter(
        (r) => r.title?.media_type === 'game' && r.title?.external_ids?.steam_appid,
      )
      if (games.length === 0) return json({ checked: 0, newlyOwned: 0, newlyStarted: 0, linked: true })

      const library = await ownedGames(steamId)
      if (!library) return json({ checked: games.length, newlyOwned: 0, newlyStarted: 0, linked: true, private: true })

      let newlyOwned = 0
      let newlyStarted = 0
      const nowIso = new Date().toISOString()
      for (const g of games) {
        const hit = library.get(String(g.title.external_ids.steam_appid))
        if (!hit) continue
        const patch: Json = {}
        // Playtime is always recorded (it's just information).
        if (g.steam_playtime_minutes !== hit.minutes) {
          patch.steam_playtime_minutes = hit.minutes
          patch.steam_last_played = hit.lastPlayed
        }
        // In Your Library — unless the user set it themselves.
        if (!g.owned && !g.owned_locked) {
          patch.owned = true
          newlyOwned++
        }
        // Wanted → In Progress once there's playtime — forward only, unless the user set the status.
        if (hit.minutes > 0 && g.progress === 'wanted' && !g.progress_locked) {
          patch.progress = 'in_progress'
          if (!g.started_at) patch.started_at = hit.lastPlayed ?? nowIso
          newlyStarted++
        }
        if (Object.keys(patch).length) {
          const { error: upd } = await db.from('user_items').update(patch).eq('id', g.id).eq('user_id', user.id)
          if (upd) throw new HttpError(500, 'save_failed')
        }
      }
      return json({ checked: games.length, newlyOwned, newlyStarted, linked: true })
    }
  }
  throw new HttpError(400, 'unknown_action')
})
