// Game prices for the user's games in their region (docs/SPEC.md → Game pricing). Caller must be signed in.
//   POST { action: 'refresh', titleIds?: string[], before?: ISO timestamp } → { checked, remaining }
// Prices are the same for everyone in a region, so they're cached per (title, country) in `game_prices` and
// shared. Due = not fetched in the last 12 h (or fetched before `before`, after a region change).
//   Official: cheapest offer from Steam or a store selling a Steam key (IsThereAnyDeal; DRM = Steam).
//             Platform stores (Epic, Microsoft, GOG …) are excluded. Steam's own regular price = full price.
//   Key shop: cheapest key-shop offer (gg.deals), with its historical low.
import { admin, HttpError, json, requireUser, serve } from '../_shared/http.ts'

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

const STALE_MS = 12 * 60 * 60 * 1000
const BATCH = 100 // gg.deals takes up to 100 app ids per call; ITAD up to 200 ids

async function postJson(url: string, body: unknown): Promise<Json | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

async function getJson(url: string): Promise<Json | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

const isSteamKey = (deal: Json) =>
  deal.shop?.name === 'Steam' || ((deal.drm ?? []) as Json[]).some((d) => d.name === 'Steam')

interface Game {
  titleId: string
  steamAppId: string
  itadId: string | null
  isFree: boolean
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  const user = await requireUser(req)
  const body = (await req.json().catch(() => null)) as Json | null
  if (body?.action !== 'refresh') throw new HttpError(400, 'unknown_action')
  const db = admin()

  const { data: profile } = await db.from('profiles').select('country_code').eq('user_id', user.id).maybeSingle()
  const country = ((profile?.country_code as string | undefined) ?? 'US').toUpperCase()

  // The user's games (with a Steam app id).
  const { data: items, error } = await db
    .from('user_items')
    .select('title:titles(id, media_type, external_ids, metadata)')
    .eq('user_id', user.id)
  if (error) throw new HttpError(500, 'load_failed')
  const all: Game[] = ((items ?? []) as unknown as { title: Json }[])
    .map((i) => i.title)
    .filter((t) => t?.media_type === 'game' && t.external_ids?.steam_appid)
    .map((t) => ({
      titleId: t.id,
      steamAppId: String(t.external_ids.steam_appid),
      itadId: t.external_ids.itad_id ?? null,
      isFree: !!t.metadata?.is_free,
    }))

  const { data: cached } = await db
    .from('game_prices')
    .select('title_id, fetched_at')
    .eq('country_code', country)
    .in('title_id', all.map((g) => g.titleId))
  const fetched = new Map((cached ?? []).map((r) => [r.title_id as string, Date.parse(r.fetched_at as string)]))
  const wanted = Array.isArray(body.titleIds) ? new Set(body.titleIds.map(String)) : null
  const before = typeof body.before === 'string' && Number.isFinite(Date.parse(body.before)) ? Date.parse(body.before) : null
  const now = Date.now()
  const due = all.filter((g) => {
    if (wanted) return wanted.has(g.titleId)
    const at = fetched.get(g.titleId)
    if (at == null) return true
    return before != null ? at < before : now - at > STALE_MS
  })
  const batch = due.slice(0, BATCH)
  if (batch.length === 0) return json({ checked: 0, remaining: 0 })

  const nowIso = new Date().toISOString()
  const paid = batch.filter((g) => !g.isFree)

  // ── IsThereAnyDeal: official stores (Steam + Steam-key resellers) ──
  const itadKey = Deno.env.get('ITAD_API_KEY')
  const official = new Map<string, { shop: string; price: number; url: string; low: number | null; steamRegular: number | null; currency: string }>()
  if (itadKey && paid.length) {
    // Resolve missing ITAD ids by Steam app id.
    for (const g of paid.filter((x) => !x.itadId)) {
      const l = await getJson(`https://api.isthereanydeal.com/games/lookup/v1?key=${itadKey}&appid=${g.steamAppId}`)
      g.itadId = l?.game?.id ?? null
    }
    const ids = paid.map((g) => g.itadId).filter(Boolean) as string[]
    const res = ids.length
      ? await postJson(`https://api.isthereanydeal.com/games/prices/v3?key=${itadKey}&country=${country}&nondeals=true`, ids)
      : null
    for (const entry of (Array.isArray(res) ? res : []) as Json[]) {
      const deals = ((entry.deals ?? []) as Json[]).filter(isSteamKey)
      if (deals.length === 0) continue
      const best = deals.reduce((a, b) => (b.price.amount < a.price.amount ? b : a))
      const steam = deals.find((d) => d.shop?.name === 'Steam')
      const lows = deals.map((d) => d.storeLow?.amount).filter((n): n is number => typeof n === 'number')
      official.set(entry.id, {
        shop: best.shop.name,
        price: best.price.amount,
        url: best.url,
        low: lows.length ? Math.min(...lows) : null,
        steamRegular: steam?.regular?.amount ?? best.regular?.amount ?? null,
        currency: best.price.currency,
      })
    }
  }

  // ── gg.deals: key shops ──
  const ggKey = Deno.env.get('GGDEALS_API_KEY')
  const keyshop = new Map<string, { price: number | null; low: number | null; url: string | null; currency: string | null }>()
  if (ggKey && paid.length) {
    const d = await getJson(
      `https://api.gg.deals/v1/prices/by-steam-app-id/?ids=${paid.map((g) => g.steamAppId).join(',')}&key=${ggKey}&region=${country.toLowerCase()}`,
    )
    for (const [appId, v] of Object.entries((d?.data ?? {}) as Record<string, Json | null>)) {
      if (!v) continue
      const num = (x: unknown) => (x != null && x !== '' && Number.isFinite(Number(x)) ? Number(x) : null)
      keyshop.set(appId, {
        price: num(v.prices?.currentKeyshops),
        low: num(v.prices?.historicalKeyshops),
        url: v.url ?? null,
        currency: v.prices?.currency ?? null,
      })
    }
  }

  const rows = batch.map((g) => {
    const o = g.itadId ? official.get(g.itadId) : undefined
    const k = keyshop.get(g.steamAppId)
    return {
      title_id: g.titleId,
      country_code: country,
      currency: o?.currency ?? k?.currency ?? '',
      is_free: g.isFree,
      official_shop: g.isFree ? null : (o?.shop ?? null),
      official_price: g.isFree ? null : (o?.price ?? null),
      official_url: g.isFree ? null : (o?.url ?? null),
      official_low: g.isFree ? null : (o?.low ?? null),
      steam_regular: g.isFree ? null : (o?.steamRegular ?? null),
      keyshop_price: g.isFree ? null : (k?.price ?? null),
      keyshop_low: g.isFree ? null : (k?.low ?? null),
      keyshop_url: g.isFree ? null : (k?.url ?? null),
      fetched_at: nowIso,
    }
  })
  const { error: upsertError } = await db.from('game_prices').upsert(rows, { onConflict: 'title_id,country_code' })
  if (upsertError) {
    console.error(upsertError)
    throw new HttpError(500, 'save_failed')
  }
  return json({ checked: rows.length, remaining: Math.max(0, due.length - batch.length) })
})
