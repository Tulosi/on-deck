// Web Push helpers for the app. Caller must be signed in.
//   POST { action: 'test' } → sends a test notification to all of the caller's devices → { sent, devices }
//   POST { action: 'seen', endpoint } → records this device's IP and approximate city (from the IP) on its
//     subscription, for the device list in Settings → { ok }
import { admin, HttpError, json, requireUser, serve } from '../_shared/http.ts'
import { pushToUser, vapidKeys } from '../_shared/push.ts'

/** The caller's public IP, as passed on by Supabase's gateway. */
function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return fwd || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || null
}

/** Approximate city for an IP (ipapi.co, HTTPS, no key). Null when it can't tell. */
async function locate(ip: string): Promise<{ city: string | null; region: string | null; country: string | null } | null> {
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { 'User-Agent': 'on-deck' },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const d = (await res.json()) as Record<string, unknown>
    if (d.error) return null
    const s = (v: unknown) => (typeof v === 'string' && v ? v : null)
    return { city: s(d.city), region: s(d.region), country: s(d.country_code) }
  } catch {
    return null
  }
}

const DAY = 24 * 60 * 60 * 1000

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  const user = await requireUser(req)
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null

  if (body?.action === 'seen') {
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
    if (!endpoint) throw new HttpError(400, 'missing_endpoint')
    const db = admin()
    const { data: row } = await db
      .from('push_subscriptions')
      .select('id, ip, seen_at')
      .eq('user_id', user.id)
      .eq('endpoint', endpoint)
      .maybeSingle()
    if (!row) return json({ ok: false })
    const ip = clientIp(req)
    // Same address and checked in the last day: nothing to do.
    if (ip && row.ip === ip && row.seen_at && Date.now() - Date.parse(row.seen_at) < DAY) return json({ ok: true })
    // A new address gets a fresh lookup; if that fails, clear the old place rather than show it with the new IP.
    const moved = row.ip !== ip
    const place = ip && moved ? await locate(ip) : null
    await db
      .from('push_subscriptions')
      .update({ ip, seen_at: new Date().toISOString(), ...(moved ? (place ?? { city: null, region: null, country: null }) : {}) })
      .eq('id', row.id)
    return json({ ok: true })
  }

  if (body?.action !== 'test') throw new HttpError(400, 'unknown_action')
  if (!vapidKeys()) throw new HttpError(500, 'push_not_configured')
  const result = await pushToUser(admin(), user.id, [
    { title: 'On Deck', body: 'Push notifications are working on this device.', url: '', tag: 'on-deck-test' },
  ])
  return json(result)
})
