// Stored availability for the user's movies/TV: on their Plex (via their Seerr) and on the streaming
// services they opted in to (TMDB watch providers, their region). Results go into `user_availability`.
//   POST { action: 'refresh', titleIds?: string[], before?: ISO timestamp }
//     → { checked, remaining, rows: [...] }
// Without titleIds it picks the user's due titles, oldest-checked first, up to BATCH per call; the app calls
// again while `remaining` > 0. Due = not checked in the last 12 h, or — when `before` is given (e.g. after
// the user changed region / services / Seerr) — checked before that moment. Caller must be signed in.
import { admin, HttpError, json, requireUser, serve } from '../_shared/http.ts'
import { checkSeerrUrl, loadIntegration } from '../_shared/plex.ts'
import { watchProviders } from '../_shared/providers.ts'
import { details, login, mapStatus } from '../_shared/seerr.ts'

const BATCH = 20
const STALE_MS = 12 * 60 * 60 * 1000

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

interface TitleRef {
  id: string
  media_type: 'movie' | 'tv'
  source: string
  source_id: string
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  const user = await requireUser(req)
  const body = (await req.json().catch(() => null)) as Json | null
  if (body?.action !== 'refresh') throw new HttpError(400, 'unknown_action')
  const db = admin()

  // The user's movies/TV (via their own items — never other users' titles).
  const { data: items, error } = await db
    .from('user_items')
    .select('title:titles(id, media_type, source, source_id)')
    .eq('user_id', user.id)
  if (error) throw new HttpError(500, 'load_failed')
  const titles = ((items ?? []) as unknown as { title: TitleRef }[])
    .map((i) => i.title)
    .filter((t) => t && t.source === 'tmdb' && (t.media_type === 'movie' || t.media_type === 'tv'))

  const { data: existingRows } = await db
    .from('user_availability')
    .select('title_id, available, checked_at')
    .eq('user_id', user.id)
  const existing = new Map((existingRows ?? []).map((r) => [r.title_id as string, r]))

  // Which titles to check this call.
  const wanted = Array.isArray(body.titleIds) ? new Set(body.titleIds.map(String)) : null
  const now = Date.now()
  const before = typeof body.before === 'string' && Number.isFinite(Date.parse(body.before)) ? Date.parse(body.before) : null
  const due = titles
    .filter((t) => (wanted ? wanted.has(t.id) : true))
    .filter((t) => {
      if (wanted) return true
      const at = existing.get(t.id)?.checked_at
      if (!at) return true
      if (before != null) return Date.parse(at) < before
      return now - Date.parse(at) > STALE_MS
    })
    .sort((a, b) => Date.parse(existing.get(a.id)?.checked_at ?? '0') - Date.parse(existing.get(b.id)?.checked_at ?? '0'))
  const batch = due.slice(0, BATCH)
  if (batch.length === 0) return json({ checked: 0, remaining: 0, rows: [] })

  // User context: region, chosen services, Plex/Seerr.
  const { data: profile } = await db
    .from('profiles')
    .select('country_code, streaming_services')
    .eq('user_id', user.id)
    .maybeSingle()
  const country = (profile?.country_code as string | undefined) ?? 'US'
  const mine = new Set((profile?.streaming_services as string[] | undefined) ?? [])
  const integ = await loadIntegration(user.id)

  let seerr: { base: string; cookie: string } | null = null
  if (integ.plexToken && integ.seerrUrl) {
    try {
      const base = checkSeerrUrl(integ.seerrUrl)
      seerr = { base, cookie: await login(base, integ.plexToken) }
    } catch (err) {
      console.error('seerr login failed — Plex status skipped this run', err)
    }
  }

  const rows: Json[] = []
  for (const t of batch) {
    const tmdbId = Number(t.source_id)
    const prev = existing.get(t.id)

    // Plex via Seerr (null when not set up, or when this lookup fails — keep the previous value then).
    let plexStatus: string | null = null
    let plexChecked = false
    if (seerr) {
      try {
        const d = await details(seerr.base, seerr.cookie, t.media_type, tmdbId)
        plexStatus = mapStatus(d?.mediaInfo?.status)
        plexChecked = true
      } catch (err) {
        console.error('seerr lookup failed', t.id, err)
      }
    }

    // The user's streaming services that have it.
    let streaming: string[] = []
    let streamingChecked = false
    if (mine.size > 0) {
      try {
        const p = await watchProviders(tmdbId, t.media_type, country)
        streaming = [...p.stream, ...p.free].map((x) => x.name).filter((n) => mine.has(n))
        streamingChecked = true
      } catch (err) {
        console.error('provider lookup failed', t.id, err)
      }
    } else {
      streamingChecked = true // nothing to match against
    }

    // If a lookup failed, don't overwrite the stored value with "unknown".
    if ((seerr && !plexChecked) || !streamingChecked) continue

    const available = plexStatus === 'available' || plexStatus === 'partial' || streaming.length > 0
    const flipped = !prev || prev.available !== available
    const nowIso = new Date().toISOString()
    rows.push({
      user_id: user.id,
      title_id: t.id,
      plex_status: plexStatus,
      streaming,
      country,
      available,
      checked_at: nowIso,
      ...(flipped ? { available_changed_at: nowIso } : {}),
      ...(available && prev && !prev.available ? { became_available_at: nowIso } : {}),
    })
  }

  if (rows.length > 0) {
    const { error: upsertError } = await db.from('user_availability').upsert(rows, { onConflict: 'user_id,title_id' })
    if (upsertError) {
      console.error(upsertError)
      throw new HttpError(500, 'save_failed')
    }
  }
  return json({ checked: rows.length, remaining: Math.max(0, due.length - batch.length), rows })
})
