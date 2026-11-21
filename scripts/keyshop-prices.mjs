// Key-shop prices from gg.deals → On Deck's `game_prices` table.
//
// Why this runs on GitHub, not in a Supabase Edge Function: gg.deals doesn't answer requests from Supabase's
// servers (they time out), but answers GitHub's runners normally. Run by .github/workflows/keyshop-prices.yml.
//
// Env:
//   SUPABASE_URL          project URL (repo secret VITE_SUPABASE_URL)
//   SUPABASE_SECRET_KEY   a Supabase *secret* key (sb_secret_…) — required to write; if missing, the job skips
//   GGDEALS_API_KEY       gg.deals API key
//   DRY_RUN=1 + TEST_APP_IDS=1643320,367520 + TEST_COUNTRY=CA   → only fetch + print, no Supabase access
//
// It only updates key-shop columns on price rows that already exist (the `prices` Edge Function creates them
// with Steam's price). It never inserts rows, so it can't make a game look "freshly priced" when it isn't.

const { SUPABASE_URL, SUPABASE_SECRET_KEY, GGDEALS_API_KEY, DRY_RUN, TEST_APP_IDS, TEST_COUNTRY } = process.env

if (!GGDEALS_API_KEY) {
  console.log('::warning::GGDEALS_API_KEY is not set — skipping.')
  process.exit(0)
}

const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** gg.deals prices for up to 100 Steam app ids in one region → Map(appId → key-shop info). */
async function ggdeals(appIds, country) {
  const out = new Map()
  for (let i = 0; i < appIds.length; i += 100) {
    const ids = appIds.slice(i, i + 100)
    const url = `https://api.gg.deals/v1/prices/by-steam-app-id/?ids=${ids.join(',')}&key=${GGDEALS_API_KEY}&region=${country.toLowerCase()}`
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) throw new Error(`gg.deals ${res.status} for ${country}`)
    const body = await res.json()
    for (const [appId, v] of Object.entries(body.data ?? {})) {
      if (!v) continue
      out.set(appId, {
        keyshop_price: num(v.prices?.currentKeyshops),
        keyshop_low: num(v.prices?.historicalKeyshops),
        keyshop_url: v.url ?? null,
        currency: v.prices?.currency ?? null,
      })
    }
  }
  return out
}

// ── Dry run: just show what gg.deals returns ───────────────────────────────
if (DRY_RUN) {
  const ids = (TEST_APP_IDS ?? '1643320').split(',')
  const result = await ggdeals(ids, TEST_COUNTRY ?? 'CA')
  for (const [appId, v] of result) console.log(appId, JSON.stringify(v))
  process.exit(0)
}

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.log(
    '::notice::SUPABASE_SECRET_KEY is not set up yet, so key-shop prices are skipped. ' +
      'See docs/API-KEYS.md → "To do: key-shop prices".',
  )
  process.exit(0)
}

const rest = (path, init = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })

async function getAll(path) {
  const res = await rest(path)
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return res.json()
}

// Existing price rows (one per game per region) + each game's Steam app id.
const rows = await getAll('game_prices?select=title_id,country_code,is_free')
const titles = await getAll('titles?select=id,external_ids&media_type=eq.game')
const appIdOf = new Map(titles.map((t) => [t.id, t.external_ids?.steam_appid ? String(t.external_ids.steam_appid) : null]))

const byCountry = new Map()
for (const r of rows) {
  const appId = appIdOf.get(r.title_id)
  if (!appId || r.is_free) continue
  if (!byCountry.has(r.country_code)) byCountry.set(r.country_code, [])
  byCountry.get(r.country_code).push({ titleId: r.title_id, appId })
}

let updated = 0
for (const [country, games] of byCountry) {
  const prices = await ggdeals([...new Set(games.map((g) => g.appId))], country)
  for (const g of games) {
    const p = prices.get(g.appId)
    const patch = p
      ? { keyshop_price: p.keyshop_price, keyshop_low: p.keyshop_low, keyshop_url: p.keyshop_url }
      : { keyshop_price: null, keyshop_low: null, keyshop_url: null }
    const res = await rest(
      `game_prices?title_id=eq.${encodeURIComponent(g.titleId)}&country_code=eq.${encodeURIComponent(country)}`,
      { method: 'PATCH', body: JSON.stringify(patch), headers: { Prefer: 'return=minimal' } },
    )
    if (!res.ok) throw new Error(`update failed (${res.status}): ${await res.text()}`)
    updated++
  }
  console.log(`${country}: ${games.length} game(s), ${[...prices.values()].filter((v) => v.keyshop_price != null).length} with key-shop prices`)
}
console.log(`Done — ${updated} price row(s) updated.`)
