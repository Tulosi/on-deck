// Games (PC). Caller must be signed in.
//   POST { action: 'search', query }   → up to 12 PC games from IGDB (nothing stored)
//   POST { action: 'add', igdbId }     → full details, upserted into `titles`; also used to refresh a cached game
// Sources: IGDB (details, cover, genres, modes, developer, Steam app id) · IsThereAnyDeal game info (Steam
// review %, Metacritic, Early Access, Steam user tags) · Steam store (co-op categories, free-to-play) ·
// Steam Deck compatibility report. Steam/ITAD/Deck lookups fail soft — the game is still added.
import { admin, HttpError, json, requireUser, serve } from '../_shared/http.ts'
import { igdb, igdbImage, PC, type Json } from '../_shared/igdb.ts'

const STEAM_SOURCE = 1 // IGDB external_game_source for Steam

/** The first 4 letters of the longest word (letters and digits only). */
const fuzzyStem = (q: string) =>
  (q.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? q).replace(/[^A-Za-z0-9]/g, '').slice(0, 4)

const limitOf = (v: unknown) => Math.min(40, Math.max(1, Number.isInteger(v) ? (v as number) : 12))

/**
 * `fuzzy`: for near matches when a search found little. IGDB's text search needs whole words, so this looks up
 * names *containing* the start of the longest word ("hollow knigth" → "holl"), most-rated first; the app then ranks
 * them by how similar they are to what was typed.
 */
async function search(query: string, limit = 12, fuzzy = false) {
  const q = query.trim().replace(/"/g, '')
  if (q.length < 2) return json({ results: [] })
  const games = await igdb(
    'games',
    fuzzy
      ? `fields name,summary,first_release_date,cover.image_id,involved_companies.company.name,involved_companies.developer,version_parent; where name ~ *"${fuzzyStem(q)}"* & platforms = (${PC}) & version_parent = null; sort total_rating_count desc; limit ${limit};`
      : `search "${q}"; fields name,summary,first_release_date,cover.image_id,involved_companies.company.name,involved_companies.developer,version_parent; where platforms = (${PC}) & version_parent = null; limit ${limit};`,
  )
  const results = games.map((g) => ({
    igdbId: g.id as number,
    mediaType: 'game' as const,
    title: g.name as string,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    posterUrl: igdbImage(g.cover?.image_id, 't_cover_small'),
    overview: (g.summary as string | undefined) ?? null,
    developer:
      ((g.involved_companies ?? []) as Json[]).find((c) => c.developer)?.company?.name ?? null,
  }))
  return json({ results })
}

// ─── Extra sources (all fail soft) ─────────────────────────────────────────

async function getJson(url: string, timeoutMs = 6000): Promise<Json | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** IsThereAnyDeal: Steam review %, Metacritic, Early Access, Steam user tags. */
async function itadInfo(steamAppId: string) {
  const key = Deno.env.get('ITAD_API_KEY')
  if (!key) return null
  const lookup = await getJson(`https://api.isthereanydeal.com/games/lookup/v1?key=${key}&appid=${steamAppId}`)
  const id = lookup?.game?.id
  if (!id) return null
  const info = await getJson(`https://api.isthereanydeal.com/games/info/v2?key=${key}&id=${id}`)
  if (!info) return null
  const review = (source: string) => ((info.reviews ?? []) as Json[]).find((r) => r.source === source)
  return {
    itadId: id as string,
    steamScore: (review('Steam')?.score as number | undefined) ?? null,
    steamReviews: (review('Steam')?.count as number | undefined) ?? null,
    metacritic: (review('Metascore')?.score as number | undefined) ?? null,
    earlyAccess: !!info.earlyAccess,
    tags: ((info.tags ?? []) as string[]).slice(0, 10),
  }
}

/** Steam store: categories (co-op etc.), genres (incl. "Early Access") and free-to-play. */
async function steamDetails(steamAppId: string) {
  const d = await getJson(`https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=english&filters=basic,categories,genres`)
  const data = d?.[steamAppId]?.success ? d[steamAppId].data : null
  if (!data) return null
  return {
    isFree: !!data.is_free,
    categories: ((data.categories ?? []) as Json[]).map((c) => c.description as string),
    genres: ((data.genres ?? []) as Json[]).map((g) => g.description as string),
    // Steam's own Early Access flag (genre id 70) — first-party, so it wins over other sources.
    earlyAccess: ((data.genres ?? []) as Json[]).some((g) => String(g.id) === '70' || g.description === 'Early Access'),
  }
}

const DECK: Record<number, string> = { 1: 'unsupported', 2: 'playable', 3: 'verified' }

/** Steam Deck compatibility: verified | playable | unsupported | unknown. */
async function steamDeck(steamAppId: string) {
  const d = await getJson(
    `https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=${steamAppId}&l=english`,
  )
  return DECK[d?.results?.resolved_category as number] ?? 'unknown'
}

// ─── Release date precision ────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type Precision = 'day' | 'month' | 'quarter' | 'year' | 'tbd'

/** IGDB's human-readable date ("Mar 14, 2027", "Mar 2027", "Q2 2027", "2027", "TBD") → precision + label. */
function precisionOf(human: unknown): { precision: Precision; label: string | null } {
  const h = typeof human === 'string' ? human.trim() : ''
  if (!h || /^tb[ad]$/i.test(h)) return { precision: 'tbd', label: 'TBA' }
  if (/^Q[1-4] \d{4}$/i.test(h)) return { precision: 'quarter', label: h.toUpperCase() }
  if (/^\d{4}$/.test(h)) return { precision: 'year', label: h }
  const m = h.match(/^([A-Za-z]{3,9}) (\d{4})$/)
  if (m) {
    const month = MONTHS.find((x) => x.toLowerCase().startsWith(m[1].slice(0, 3).toLowerCase()))
    return { precision: 'month', label: `${month ?? m[1]} ${m[2]}` }
  }
  return { precision: 'day', label: null }
}

/**
 * The game's release dates (PC ones when there are any). Fetched separately and best-effort, so a problem here
 * never stops a game being added. Tries with release status (Early Access / Full Release …), then without.
 */
async function releaseDates(igdbId: number): Promise<Json[]> {
  for (const fields of ['date,human,platform,status.name', 'date,human,platform']) {
    try {
      const rows = await igdb('release_dates', `fields ${fields}; where game = ${igdbId}; limit 100;`)
      const pc = rows.filter((r) => r.platform === PC)
      return (pc.length ? pc : rows).sort((a, b) => (a.date ?? Infinity) - (b.date ?? Infinity))
    } catch {
      // try the next field set
    }
  }
  return []
}

export interface Milestone {
  /** early_access = Early Access launch; release = full release (1.0 when it follows Early Access). */
  kind: 'early_access' | 'release'
  date: string | null
  precision: Precision
  label: string | null
}

const SKIP_STATUS = /alpha|beta|offline|cancel|advanced access/i

/** The Early Access launch (if any) and the full release, each the earliest matching date. */
function milestonesOf(dates: Json[]): Milestone[] {
  const toMilestone = (kind: Milestone['kind'], r: Json | undefined): Milestone | null => {
    if (!r) return null
    const { precision, label } = precisionOf(r.human)
    const date = typeof r.date === 'number' ? new Date(r.date * 1000).toISOString().slice(0, 10) : null
    return { kind, date: precision === 'tbd' ? null : date, precision: date ? precision : 'tbd', label }
  }
  const status = (r: Json) => (typeof r.status?.name === 'string' ? (r.status.name as string) : '')
  const ea = dates.find((r) => /early access/i.test(status(r)))
  const full = dates.find((r) => !/early access/i.test(status(r)) && !SKIP_STATUS.test(status(r)))
  return [toMilestone('early_access', ea), toMilestone('release', full)].filter((m): m is Milestone => !!m)
}

// ─── Time to beat ──────────────────────────────────────────────────────────

/**
 * IGDB's player-submitted completion times (seconds) → hours, one decimal. Best-effort: null when IGDB has none
 * or the lookup fails. A "100%" time more than 5× the normal one is treated as an outlier and dropped.
 */
async function timeToBeat(igdbId: number): Promise<Json | null> {
  try {
    const [t] = await igdb('game_time_to_beats', `fields hastily,normally,completely,count; where game_id = ${igdbId};`)
    if (!t) return null
    const hours = (sec: unknown) => (typeof sec === 'number' && sec > 0 ? Math.round(sec / 360) / 10 : null)
    const rushed = hours(t.hastily)
    const normal = hours(t.normally)
    let full = hours(t.completely)
    if (full != null && normal != null && full > normal * 5) full = null
    if (rushed == null && normal == null && full == null) return null
    return { rushed, normal, full, players: typeof t.count === 'number' ? t.count : null }
  } catch {
    return null
  }
}

/** Early Access launched (on or before today) and the full release hasn't happened yet (or has no date). */
function inEarlyAccessByDates(milestones: Milestone[], today: string): boolean {
  const ea = milestones.find((m) => m.kind === 'early_access')
  const full = milestones.find((m) => m.kind === 'release')
  if (!ea?.date || ea.date > today) return false
  return !full || !full.date || full.date > today
}

// ─── Add / refresh ─────────────────────────────────────────────────────────

async function add(igdbId: number) {
  const [g] = await igdb(
    'games',
    `fields name,summary,first_release_date,cover.image_id,artworks.image_id,screenshots.image_id,genres.name,themes.name,game_modes.name,player_perspectives.name,multiplayer_modes.*,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,external_games.uid,external_games.external_game_source,url; where id = ${igdbId};`,
  )
  if (!g) throw new HttpError(404, 'igdb_not_found')

  const steamAppId: string | null =
    ((g.external_games ?? []) as Json[]).find((e) => e.external_game_source === STEAM_SOURCE)?.uid ?? null
  const [itad, steam, deck] = steamAppId
    ? await Promise.all([itadInfo(steamAppId), steamDetails(steamAppId), steamDeck(steamAppId)])
    : [null, null, 'unknown']

  // Co-op / multiplayer: IGDB multiplayer modes (PC entry preferred) + Steam categories.
  const mm = (((g.multiplayer_modes ?? []) as Json[]).find((m) => m.platform === PC) ?? (g.multiplayer_modes ?? [])[0]) as
    | Json
    | undefined
  const cats = new Set(steam?.categories ?? [])
  const modes = ((g.game_modes ?? []) as Json[]).map((m) => m.name as string)
  const multiplayer = {
    online_coop: !!mm?.onlinecoop || cats.has('Online Co-op'),
    local_coop: !!mm?.offlinecoop || cats.has('Shared/Split Screen Co-op') || cats.has('Local Co-op'),
    split_screen: !!mm?.splitscreen || cats.has('Shared/Split Screen') || cats.has('Shared/Split Screen Co-op'),
    pvp: cats.has('Online PvP') || cats.has('PvP') || cats.has('Shared/Split Screen PvP'),
    online_max: (mm?.onlinecoopmax ?? mm?.onlinemax ?? null) as number | null,
    single_player: modes.includes('Single player') || cats.has('Single-player'),
  }

  const releaseIso = g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10) : null
  const [dates, ttb] = await Promise.all([releaseDates(g.id as number), timeToBeat(g.id as number)])
  const milestones = milestonesOf(dates)
  // Precision of the first release (the date IGDB's first_release_date points at).
  const { precision: releasePrecision, label: releaseLabel } = dates.length
    ? precisionOf(dates[0].human)
    : { precision: (releaseIso ? 'day' : 'tbd') as Precision, label: null }
  const companies = (g.involved_companies ?? []) as Json[]
  const art = (g.artworks?.[0] ?? g.screenshots?.[0])?.image_id
  const igdbGenres = ((g.genres ?? []) as Json[]).map((x) => x.name as string)
  const nowIso = new Date().toISOString()

  const row = {
    media_type: 'game',
    source: 'igdb',
    source_id: String(g.id),
    title: g.name as string,
    year: releaseIso ? Number(releaseIso.slice(0, 4)) : null,
    cover_url: igdbImage(g.cover?.image_id, 't_cover_big'),
    backdrop_url: igdbImage(art, 't_1080p'),
    // Steam user tags (e.g. Roguelike, ARPG) are the useful "genres" for filtering; IGDB's as a fallback.
    genres: itad?.tags?.length ? itad.tags.slice(0, 6) : igdbGenres,
    external_ids: { igdb_id: g.id, steam_appid: steamAppId, itad_id: itad?.itadId ?? null },
    ratings: {
      ...(itad?.steamScore != null ? { steam: itad.steamScore, steam_reviews: itad.steamReviews } : {}),
      ...(itad?.metacritic != null ? { metacritic: String(itad.metacritic) } : {}),
      scores_checked_at: nowIso,
    },
    metadata: {
      overview: g.summary ?? null,
      developer: companies.filter((c) => c.developer).map((c) => c.company?.name).filter(Boolean),
      publisher: companies.filter((c) => c.publisher).map((c) => c.company?.name).filter(Boolean),
      igdb_genres: igdbGenres,
      themes: ((g.themes ?? []) as Json[]).map((x) => x.name),
      game_modes: modes,
      perspectives: ((g.player_perspectives ?? []) as Json[]).map((x) => x.name),
      multiplayer,
      tags: itad?.tags ?? [],
      // Early Access: Steam's flag, IsThereAnyDeal's, or the release dates (Early Access launched, 1.0 still to come).
      early_access: !!(steam?.earlyAccess || itad?.earlyAccess || inEarlyAccessByDates(milestones, nowIso.slice(0, 10))),
      steam_genres: steam?.genres ?? [],
      is_free: steam?.isFree ?? false,
      steam_deck: deck,
      steam_categories: steam?.categories ?? [],
      steam_url: steamAppId ? `https://store.steampowered.com/app/${steamAppId}/` : null,
      igdb_url: g.url ?? null,
      // Unreleased per IGDB → treat like a pre-release title.
      status:
        (releaseIso && releaseIso > nowIso.slice(0, 10)) || (!releaseIso && releasePrecision === 'tbd') ? 'Upcoming' : 'Released',
      // How exact the release date is (IGDB stores "2027" as Dec 31, 2027): day | month | quarter | year | tbd.
      release_precision: releasePrecision,
      release_label: releasePrecision === 'day' ? null : releaseLabel,
      // Early Access launch and full release (1.0), for the Waitlist and calendar feeds.
      release_milestones: milestones,
      // Hours to finish: rushed / normal / 100%, from IGDB players (null = no data yet).
      time_to_beat: ttb,
    },
    release_date: releaseIso,
    refreshed_at: nowIso,
  }

  const { data, error } = await admin()
    .from('titles')
    .upsert(row, { onConflict: 'media_type,source,source_id' })
    .select()
    .single()
  if (error) {
    console.error(error)
    throw new HttpError(500, 'title_save_failed')
  }
  return json({ title: data })
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  await requireUser(req)
  const body = (await req.json().catch(() => null)) as Json | null
  if (body?.action === 'search' && typeof body.query === 'string') return search(body.query, limitOf(body.limit), body.fuzzy === true)
  if (body?.action === 'add') {
    const id = Number(body.igdbId)
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'bad_igdb_id')
    return add(id)
  }
  throw new HttpError(400, 'unknown_action')
})
