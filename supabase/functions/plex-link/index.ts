// Links a user's Plex account with Plex's PIN sign-in (the user signs in on app.plex.tv, never here).
//   POST { action: 'start' }        → { pinId, authUrl }  — open authUrl in a new window
//   POST { action: 'check', pinId } → { linked, username } — poll until linked
//   POST { action: 'status' }       → { linked, username }
//   POST { action: 'unlink' }       → { linked: false }
// Caller must be signed in. The Plex token is stored server-side only (user_integrations).
import { admin, HttpError, json, requireUser, serve } from '../_shared/http.ts'
import { plexHeaders, PLEX_PRODUCT } from '../_shared/plex.ts'

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  const user = await requireUser(req)
  // Plex ties a PIN to the client id that created it, so another user can't claim someone else's PIN.
  const clientId = `on-deck-${user.id}`
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null

  switch (body?.action) {
    case 'start': {
      const res = await fetch('https://plex.tv/api/v2/pins?strong=true', {
        method: 'POST',
        headers: plexHeaders(clientId),
      })
      if (!res.ok) throw new HttpError(502, 'plex_unreachable')
      const pin = await res.json()
      const params = new URLSearchParams({
        clientID: clientId,
        code: pin.code,
        'context[device][product]': PLEX_PRODUCT,
      })
      return json({ pinId: pin.id, authUrl: `https://app.plex.tv/auth#?${params}` })
    }

    case 'check': {
      const pinId = Number(body.pinId)
      if (!Number.isInteger(pinId) || pinId <= 0) throw new HttpError(400, 'bad_pin')
      const res = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, { headers: plexHeaders(clientId) })
      if (res.status === 404) throw new HttpError(410, 'pin_expired')
      if (!res.ok) throw new HttpError(502, 'plex_unreachable')
      const pin = await res.json()
      if (!pin.authToken) return json({ linked: false })

      const me = await fetch('https://plex.tv/api/v2/user', { headers: plexHeaders(clientId, pin.authToken) })
      const username = me.ok ? ((await me.json()).username ?? null) : null
      const { error } = await admin().from('user_integrations').upsert({
        user_id: user.id,
        plex_token: pin.authToken,
        plex_username: username,
        linked_at: new Date().toISOString(),
      })
      if (error) throw new HttpError(500, 'save_failed')
      return json({ linked: true, username })
    }

    case 'status': {
      const { data } = await admin()
        .from('user_integrations')
        .select('plex_token, plex_username')
        .eq('user_id', user.id)
        .maybeSingle()
      return json({ linked: !!data?.plex_token, username: data?.plex_username ?? null })
    }

    case 'unlink': {
      await admin().from('user_integrations').delete().eq('user_id', user.id)
      return json({ linked: false })
    }
  }
  throw new HttpError(400, 'unknown_action')
})
