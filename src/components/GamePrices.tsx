import clsx from 'clsx'
import { ExternalLink, Loader2 } from 'lucide-react'
import { cheapest, formatPrice, priceOptions, type PriceOption } from '../lib/prices'
import type { UserItem } from '../types'

const LABEL: Record<PriceOption['kind'], string> = {
  steam: 'Steam',
  official: 'Cheaper Steam key',
  keyshop: 'Cheaper on key shops',
}

function Row({
  option,
  currency,
  steamRegular,
  best,
}: {
  option: PriceOption
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
        <p className="text-sm font-medium text-fg">{LABEL[option.kind]}</p>
        {option.kind === 'official' && <p className="text-xs text-muted">{option.shop}, Steam key</p>}
        {option.kind === 'keyshop' && <p className="text-xs text-muted">Third-party key resellers</p>}
      </div>
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
            className="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs whitespace-nowrap text-fg hover:border-accent"
          >
            {option.kind === 'keyshop' ? 'View on gg.deals' : `View on ${option.shop}`}
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

/**
 * Game page price block: Steam's price always, then any source that's actually cheaper
 * (a store selling a Steam key, or a key shop). Steam wins ties.
 */
export function GamePrices({ item }: { item: UserItem }) {
  const p = item.gamePrice
  const steamUrl = typeof item.title.details?.steam_url === 'string' ? item.title.details.steam_url : null
  let body
  if (!p && !steamUrl) {
    body = <p className="text-sm text-muted">Not on Steam, so there are no prices to track.</p>
  } else if (!p) {
    body = (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Checking prices…
      </p>
    )
  } else if (p.isFree) {
    body = <p className="text-sm text-good">Free-To-Play</p>
  } else {
    const options = priceOptions(p, steamUrl)
    const best = cheapest(p)
    body =
      options.length === 0 ? (
        <p className="text-sm text-muted">No price yet. It may not be on sale until release.</p>
      ) : (
        <>
          {!p.steam && <p className="text-xs text-muted">No Steam price yet.</p>}
          {options.map((o) => (
            <Row
              key={o.kind}
              option={o}
              currency={p.currency}
              steamRegular={p.steamRegular}
              best={options.length > 1 && o === best}
            />
          ))}
          <p className="text-[11px] text-faint">
            Other stores only appear when they’re cheaper than Steam. Discounts are against Steam’s full price.
          </p>
        </>
      )
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-fg">Price</h2>
      {body}
    </section>
  )
}
