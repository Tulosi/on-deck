import clsx from 'clsx'
import { ExternalLink, Loader2 } from 'lucide-react'
import { cheapest, formatPrice, priceOptions, type PriceOption } from '../lib/prices'
import type { UserItem } from '../types'

function Row({
  label,
  option,
  currency,
  steamRegular,
  best,
}: {
  label: string
  option: PriceOption | null
  currency: string
  steamRegular: number | null
  best: boolean
}) {
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-3',
        best ? 'border-accent/70 bg-accent/5' : 'border-line bg-surface',
      )}
    >
      <div className="min-w-[9rem] flex-1">
        <p className="text-sm font-medium text-fg">{label}</p>
        <p className="text-xs text-muted">{option ? option.shop : 'No offer found'}</p>
      </div>
      {option && (
        <div className="flex flex-wrap items-center gap-2">
          {option.discountPct != null && (
            <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs font-semibold text-accent-fg">
              -{option.discountPct}%
            </span>
          )}
          {option.discountPct != null && steamRegular != null && (
            <span className="font-mono text-xs text-faint line-through">{formatPrice(steamRegular, currency)}</span>
          )}
          <span className="font-mono text-base font-semibold text-fg">{formatPrice(option.price, currency)}</span>
          {option.atLow && (
            <span className="rounded border border-good/60 bg-good/10 px-1.5 py-0.5 text-[11px] font-medium text-good">
              Historical low
            </span>
          )}
          {option.url && (
            <a
              href={option.url}
              target="_blank"
              rel="noreferrer"
              className="flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-xs whitespace-nowrap text-fg hover:border-accent"
            >
              {option.kind === 'official' ? `View on ${option.shop}` : 'View on gg.deals'}
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/** Game page: official Steam-key price vs key-shop price (docs/SPEC.md → Game pricing). */
export function GamePrices({ item }: { item: UserItem }) {
  const p = item.gamePrice
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-fg">Price</h2>
      {!p && !item.title.details?.steam_url ? (
        <p className="text-sm text-muted">Not on Steam, so there are no prices to track.</p>
      ) : !p ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Checking prices…
        </p>
      ) : p.isFree ? (
        <p className="text-sm text-good">Free-To-Play</p>
      ) : (
        (() => {
          const { official, keyshop } = priceOptions(p)
          const best = cheapest(p)
          return (
            <>
              <Row label="Steam key" option={official} currency={p.currency} steamRegular={p.steamRegular} best={best === official && !!official} />
              <Row label="Key shop" option={keyshop} currency={p.currency} steamRegular={p.steamRegular} best={best === keyshop && !!keyshop} />
              <p className="text-[11px] text-faint">
                Steam key: Steam or a store selling a Steam key (via IsThereAnyDeal). Key shops are third-party key
                resellers (via gg.deals). Discounts are against Steam’s full price.
              </p>
            </>
          )
        })()
      )}
    </section>
  )
}
