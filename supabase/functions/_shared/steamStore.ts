// Steam's own store data, from Steam's official Web API (api.steampowered.com): IStoreQueryService/SearchSuggestions
// to find games by name, IStoreBrowseService/GetItems for one game's details. Neither needs a key. Used when IGDB
// doesn't know a game yet (new and Early Access releases often reach Steam weeks or months before IGDB).
import type { Json } from './igdb.ts'

const API = 'https://api.steampowered.com'
const ASSETS = 'https://shared.akamai.steamstatic.com/store_item_assets/'
const CONTEXT = { language: 'english', country_code: 'US' }

async function call(path: string, input: Json, timeoutMs = 6000): Promise<Json | null> {
  try {
    const url = `${API}/${path}/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    return ((await res.json()) as Json)?.response ?? null
  } catch {
    return null
  }
}

/** An asset (e.g. `library_capsule_2x`) as a full URL. */
function asset(item: Json, name: string): string | null {
  const a = item.assets as Json | undefined
  const file = a?.[name] as string | undefined
  if (!a?.asset_url_format || !file) return null
  return ASSETS + String(a.asset_url_format).replace('${FILENAME}', file)
}

const REQUEST = { include_basic_info: true, include_release: true, include_assets: true, include_platforms: true, include_reviews: true }

/** Games (not DLC, soundtracks or tools) matching a name, with what a search result needs. */
export async function steamSearch(query: string, limit = 8) {
  const r = await call('IStoreQueryService/SearchSuggestions', {
    search_term: query,
    max_results: limit,
    context: CONTEXT,
    data_request: REQUEST,
  })
  return ((r?.store_items ?? []) as Json[])
    .filter((i) => i.success === 1 && i.visible !== false && i.type === 0 && i.appid)
    .map((i) => ({
      steamAppId: Number(i.appid),
      title: String(i.name),
      year: i.release?.steam_release_date && !i.release?.is_coming_soon ? yearOf(i.release.steam_release_date) : null,
      posterUrl: asset(i, 'library_capsule') ?? asset(i, 'small_capsule'),
      overview: (i.basic_info?.short_description as string | undefined) ?? null,
      developer: ((i.basic_info?.developers ?? []) as Json[])[0]?.name ?? null,
    }))
}

const yearOf = (unix: number) => new Date(unix * 1000).getUTCFullYear()

/** One game's store entry, or null. */
export async function steamItem(appId: number): Promise<Json | null> {
  const r = await call('IStoreBrowseService/GetItems', {
    ids: [{ appid: appId }],
    context: CONTEXT,
    data_request: { ...REQUEST, include_tag_count: 10 },
  })
  const item = ((r?.store_items ?? []) as Json[])[0]
  return item?.success === 1 ? item : null
}

type Precision = 'day' | 'month' | 'quarter' | 'year' | 'tbd'

/** How exact Steam's release date is, from how the store shows it. */
function precisionOf(release: Json | undefined): Precision {
  if (!release?.steam_release_date) return 'tbd'
  if (!release.is_coming_soon) return 'day'
  switch (release.coming_soon_display) {
    case 'date_full':
      return 'day'
    case 'date_month':
      return 'month'
    case 'date_quarter':
      return 'quarter'
    case 'date_year':
      return 'year'
    default:
      return 'tbd'
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function labelOf(iso: string | null, precision: Precision): string | null {
  if (!iso) return 'TBA'
  const [y, m] = iso.split('-').map(Number)
  if (precision === 'month') return `${MONTHS[m - 1]} ${y}`
  if (precision === 'quarter') return `Q${Math.floor((m - 1) / 3) + 1} ${y}`
  if (precision === 'year') return String(y)
  if (precision === 'tbd') return 'TBA'
  return null
}

const DECK: Record<number, string> = { 1: 'unsupported', 2: 'playable', 3: 'verified' }

// Steam category ids (the store's feature list).
const CAT = { multi: 1, single: 2, coop: 9, pvp: 49, onlinePvp: 36, sharedScreen: 24, onlineCoop: 38, localCoop: 39, sharedPvp: 47 }

/**
 * A `titles` row for a game known only to Steam (`source` = 'steam', `source_id` = the app id), in the same shape
 * as the IGDB function's, so the rest of the app treats it like any other game. `extra` carries what
 * IsThereAnyDeal adds (scores, tags), when it has the game.
 */
export function steamRow(
  item: Json,
  extra: { itadId?: string | null; steamScore?: number | null; steamReviews?: number | null; metacritic?: number | null; tags?: string[] } | null,
) {
  const appId = String(item.appid)
  const nowIso = new Date().toISOString()
  const release = item.release as Json | undefined
  const precision = precisionOf(release)
  const iso = release?.steam_release_date ? new Date(release.steam_release_date * 1000).toISOString().slice(0, 10) : null
  const releaseIso = precision === 'tbd' ? null : iso
  const earlyAccess = !!(item.is_early_access || release?.is_early_access)
  const comingSoon = !!(item.is_coming_soon || release?.is_coming_soon)
  const cats = new Set<number>([
    ...((item.categories?.supported_player_categoryids ?? []) as number[]),
    ...((item.categories?.feature_categoryids ?? []) as number[]),
  ])
  const reviews = item.reviews?.summary_filtered as Json | undefined
  const steamScore = extra?.steamScore ?? (reviews?.review_count ? (reviews.percent_positive as number) : null)
  const label = labelOf(releaseIso, precision)
  return {
    media_type: 'game',
    source: 'steam',
    source_id: appId,
    title: String(item.name),
    year: releaseIso ? Number(releaseIso.slice(0, 4)) : null,
    cover_url: asset(item, 'library_capsule_2x') ?? asset(item, 'library_capsule') ?? asset(item, 'header'),
    backdrop_url: asset(item, 'library_hero') ?? asset(item, 'page_background'),
    genres: extra?.tags?.slice(0, 6) ?? [],
    external_ids: { steam_appid: appId, itad_id: extra?.itadId ?? null },
    ratings: {
      ...(steamScore != null ? { steam: steamScore, steam_reviews: extra?.steamReviews ?? reviews?.review_count ?? null } : {}),
      ...(extra?.metacritic != null ? { metacritic: String(extra.metacritic) } : {}),
      scores_checked_at: nowIso,
    },
    metadata: {
      overview: (item.basic_info?.short_description as string | undefined) ?? null,
      developer: ((item.basic_info?.developers ?? []) as Json[]).map((d) => d.name).filter(Boolean),
      publisher: ((item.basic_info?.publishers ?? []) as Json[]).map((d) => d.name).filter(Boolean),
      igdb_genres: [],
      themes: [],
      game_modes: [cats.has(CAT.single) && 'Single player', cats.has(CAT.multi) && 'Multiplayer', cats.has(CAT.coop) && 'Co-operative'].filter(
        Boolean,
      ),
      perspectives: [],
      multiplayer: {
        online_coop: cats.has(CAT.onlineCoop),
        local_coop: cats.has(CAT.localCoop) || (cats.has(CAT.sharedScreen) && cats.has(CAT.coop)),
        split_screen: cats.has(CAT.sharedScreen),
        pvp: cats.has(CAT.pvp) || cats.has(CAT.onlinePvp) || cats.has(CAT.sharedPvp),
        online_max: null,
        single_player: cats.has(CAT.single),
      },
      tags: extra?.tags ?? [],
      early_access: earlyAccess,
      steam_genres: earlyAccess ? ['Early Access'] : [],
      is_free: !!item.is_free,
      steam_deck: DECK[item.platforms?.steam_deck_compat_category as number] ?? 'unknown',
      steam_categories: [],
      steam_url: `https://store.steampowered.com/app/${appId}/`,
      igdb_url: null,
      status: comingSoon ? 'Upcoming' : 'Released',
      release_precision: precision,
      release_label: precision === 'day' ? null : label,
      // Steam has one date: the Early Access launch for Early Access games, otherwise the release.
      release_milestones: [{ kind: earlyAccess ? 'early_access' : 'release', date: releaseIso, precision, label }],
      time_to_beat: null,
    },
    release_date: releaseIso,
    refreshed_at: nowIso,
  }
}
