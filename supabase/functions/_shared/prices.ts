// Game price rules (docs/SPEC.md → Game pricing). Plain TypeScript, shared by the app and the `daily` Edge
// Function (price-drop alerts), so both always agree.
//  - Steam's own price is always shown.
//  - Other sources (a store selling a Steam key, or a key shop) only appear when strictly cheaper than Steam.
//    On a tie, Steam wins.
//  - Discounts are measured against Steam's full price; "historical low" compares each price with its own
//    source's lowest-ever, and only counts when the price is also below Steam's full price. A new release at full
//    price is at its lowest-ever too, but that isn't a deal (no low badge, no Deals row, no low-price alert).

export interface PriceOption {
  kind: 'steam' | 'official' | 'keyshop'
  price: number
  /** % off Steam's full price (null when there's no Steam price to compare with). */
  discountPct: number | null
  atLow: boolean
  url: string | null
  /** "Steam", a store name ("GreenManGaming" …) or "Key shops". */
  shop: string
}

/** At its lowest-ever price and actually discounted (see the header). */
const isLow = (price: number, low: number | null | undefined, discountPct: number | null) =>
  low != null && price <= low && (discountPct ?? 0) > 0

export function discountVsSteam(price: number, steamRegular: number | null): number | null {
  if (!steamRegular || steamRegular <= 0 || price >= steamRegular) return null
  return Math.round((1 - price / steamRegular) * 100)
}

/**
 * The offers to show: Steam (always, when it has a price) plus any cheaper alternatives.
 * `steamUrl` is the game's Steam store page.
 */
export function priceOptions(p: GamePrice, steamUrl: string | null = null): PriceOption[] {
  const out: PriceOption[] = []
  const steamPct = p.steam ? discountVsSteam(p.steam.price, p.steamRegular) : null
  const steam = p.steam
    ? {
        kind: 'steam' as const,
        price: p.steam.price,
        discountPct: steamPct,
        atLow: isLow(p.steam.price, p.steam.low, steamPct),
        url: steamUrl,
        shop: 'Steam',
      }
    : null
  if (steam) out.push(steam)
  const cheaperThanSteam = (price: number) => !steam || price < steam.price
  if (p.official?.price != null && cheaperThanSteam(p.official.price)) {
    out.push({
      kind: 'official',
      price: p.official.price,
      discountPct: discountVsSteam(p.official.price, p.steamRegular),
      atLow: isLow(p.official.price, p.official.low, discountVsSteam(p.official.price, p.steamRegular)),
      url: p.official.url,
      shop: p.official.shop ?? 'Steam key store',
    })
  }
  if (p.keyshop?.price != null && cheaperThanSteam(p.keyshop.price)) {
    out.push({
      kind: 'keyshop',
      price: p.keyshop.price,
      discountPct: discountVsSteam(p.keyshop.price, p.steamRegular),
      atLow: isLow(p.keyshop.price, p.keyshop.low, discountVsSteam(p.keyshop.price, p.steamRegular)),
      url: p.keyshop.url,
      shop: 'Key shops',
    })
  }
  return out
}

/** The cheapest offer (poster badge, Deals, sorting). Steam wins ties — it's always first in the list. */
export function cheapest(p: GamePrice): PriceOption | null {
  return priceOptions(p).reduce<PriceOption | null>((best, o) => (!best || o.price < best.price ? o : best), null)
}

/** Prices for one game in one region (from `game_prices`). */
export interface GamePrice {
  currency: string
  isFree: boolean
  /** Steam's own price for the region (always shown); `low` = Steam's lowest-ever. */
  steam: { price: number; low: number | null } | null
  /** Cheapest *other* store selling a Steam key — only shown when cheaper than Steam. */
  official: { shop: string | null; price: number | null; url: string | null; low: number | null } | null
  /** Steam's own full (undiscounted) price — all discounts are measured against it. */
  steamRegular: number | null
  /** Cheapest key-shop offer (gg.deals). */
  keyshop: { price: number | null; low: number | null; url: string | null } | null
  fetchedAt: string
}

/** A `game_prices` row as stored. */
export interface PriceRow {
  title_id: string
  currency: string
  is_free: boolean
  steam_price: number | null
  steam_low: number | null
  official_shop: string | null
  official_price: number | null
  official_url: string | null
  official_low: number | null
  steam_regular: number | null
  keyshop_price: number | null
  keyshop_low: number | null
  keyshop_url: string | null
  fetched_at: string
}

const num = (v: unknown) => (v == null || v === '' ? null : Number(v))

export function gamePriceFromRow(r: PriceRow): GamePrice {
  return {
    currency: r.currency,
    isFree: r.is_free,
    steam: r.steam_price != null ? { price: Number(r.steam_price), low: num(r.steam_low) } : null,
    official:
      r.official_price != null
        ? { shop: r.official_shop, price: num(r.official_price), url: r.official_url, low: num(r.official_low) }
        : null,
    steamRegular: num(r.steam_regular),
    keyshop: r.keyshop_price != null ? { price: num(r.keyshop_price), low: num(r.keyshop_low), url: r.keyshop_url } : null,
    fetchedAt: r.fetched_at,
  }
}

