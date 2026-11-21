// Game price rules live in supabase/functions/_shared/prices.ts (shared with the daily job).
export {
  cheapest,
  discountVsSteam,
  gamePriceFromRow,
  priceOptions,
  type GamePrice,
  type PriceOption,
  type PriceRow,
} from '../../supabase/functions/_shared/prices.ts'

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount)
  } catch {
    return amount.toFixed(2)
  }
}
