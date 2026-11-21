// Games (PC). Caller must be signed in.
//   POST { action: 'search', query }   → up to 12 PC games from IGDB (nothing stored)
//   POST { action: 'add', igdbId }     → full details, upserted into `titles`; also used to refresh a cached game
// Sources: IGDB (details, cover, genres, modes, developer, Steam app id) · IsThereAnyDeal game info (Steam
// review %, Metacritic, Early Access, Steam user tags) · Steam store (co-op categories, free-to-play) ·
// Steam Deck compatibility report. Steam/ITAD/Deck lookups fail soft — the game is still added.
import { admin, HttpError, json, requireUser, serve } from '../_shared/http.ts'
import { igdb, igdbImage, PC, type Json } from '../_shared/igdb.ts'

const STEAM_SOURCE = 1 // IGDB external_game_source for Steam

async function search(query: string) {
  const q = query.trim().replace(/"/g, '')
  if (q.length < 2) return json({ results: [] })
  const games = await igdb(
    'games',
    `search "${q}"; fields name,first_release_date,cover.image_id,involved_companies.company.name,involved_companies.developer,version_parent; where platforms = (${PC}) & version_parent = null; limit 12;`,
  )
  const results = games.map((g) => ({
    igdbId: g.id as number,
    mediaType: 'game' as const,
    title: g.name as string,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    posterUrl: igdbImage(g.cover?.image_id, 't_cover_small'),
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

/** Steam store: categories (co-op etc.) and free-to-play. */
async function steamDetails(steamAppId: string) {
  const d = await getJson(`https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=english&filters=basic,categories,genres`)
  const data = d?.[steamAppId]?.success ? d[steamAppId].data : null
  if (!data) return null
  return {
    isFree: !!data.is_free,
    categories: ((data.categories ?? []) as Json[]).map((c) => c.description as string),
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
      early_access: itad?.earlyAccess ?? false,
      is_free: steam?.isFree ?? false,
      steam_deck: deck,
      steam_categories: steam?.categories ?? [],
      steam_url: steamAppId ? `https://store.steampowered.com/app/${steamAppId}/` : null,
      igdb_url: g.url ?? null,
      // Unreleased per IGDB → treat like a pre-release title.
      status: releaseIso && releaseIso > nowIso.slice(0, 10) ? 'Upcoming' : 'Released',
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
  if (body?.action === 'search' && typeof body.query === 'string') return search(body.query)
  if (body?.action === 'add') {
    const id = Number(body.igdbId)
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'bad_igdb_id')
    return add(id)
  }
  throw new HttpError(400, 'unknown_action')
})
