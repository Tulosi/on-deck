// Game price rules (docs/SPEC.md → Game pricing): discounts are measured against Steam's full price;
// "historical low" compares each price with its own kind's lowest-ever (Steam-key stores vs key shops).
import type { GamePrice } from '../types'

export interface PriceOption {
  kind: 'official' | 'keyshop'
  price: number
  /** % off Steam's full price (null when there's no Steam price to compare with). */
  discountPct: number | null
  atLow: boolean
  url: string | null
  /** Store name for official offers ("Steam", "GreenManGaming" …); "Key shops" otherwise. */
  shop: string
}

export function discountVsSteam(price: number, steamRegular: number | null): number | null {
  if (!steamRegular || steamRegular <= 0 || price >= steamRegular) return null
  return Math.round((1 - price / steamRegular) * 100)
}

export function priceOptions(p: GamePrice): { official: PriceOption | null; keyshop: PriceOption | null } {
  const official =
    p.official?.price != null
      ? {
          kind: 'official' as const,
          price: p.official.price,
          discountPct: discountVsSteam(p.official.price, p.steamRegular),
          atLow: p.official.low != null && p.official.price <= p.official.low,
          url: p.official.url,
          shop: p.official.shop ?? 'Steam',
        }
      : null
  const keyshop =
    p.keyshop?.price != null
      ? {
          kind: 'keyshop' as const,
          price: p.keyshop.price,
          discountPct: discountVsSteam(p.keyshop.price, p.steamRegular),
          atLow: p.keyshop.low != null && p.keyshop.price <= p.keyshop.low,
          url: p.keyshop.url,
          shop: 'Key shops',
        }
      : null
  return { official, keyshop }
}

/** The cheaper of the two offers (poster badge, Deals, sorting). */
export function cheapest(p: GamePrice): PriceOption | null {
  const { official, keyshop } = priceOptions(p)
  if (official && keyshop) return keyshop.price < official.price ? keyshop : official
  return official ?? keyshop
}

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount)
  } catch {
    return amount.toFixed(2)
  }
}
