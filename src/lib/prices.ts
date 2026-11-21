// Game price rules (docs/SPEC.md → Game pricing):
//  - Steam's own price is always shown.
//  - Other sources (a store selling a Steam key, or a key shop) only appear when strictly cheaper than Steam.
//    On a tie, Steam wins.
//  - Discounts are measured against Steam's full price; "historical low" compares each price with its own
//    source's lowest-ever.
import type { GamePrice } from '../types'

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
  const steam = p.steam
    ? {
        kind: 'steam' as const,
        price: p.steam.price,
        discountPct: discountVsSteam(p.steam.price, p.steamRegular),
        atLow: p.steam.low != null && p.steam.price <= p.steam.low,
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
      atLow: p.official.low != null && p.official.price <= p.official.low,
      url: p.official.url,
      shop: p.official.shop ?? 'Steam key store',
    })
  }
  if (p.keyshop?.price != null && cheaperThanSteam(p.keyshop.price)) {
    out.push({
      kind: 'keyshop',
      price: p.keyshop.price,
      discountPct: discountVsSteam(p.keyshop.price, p.steamRegular),
      atLow: p.keyshop.low != null && p.keyshop.price <= p.keyshop.low,
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

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount)
  } catch {
    return amount.toFixed(2)
  }
}
