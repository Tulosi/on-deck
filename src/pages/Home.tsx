import { Link } from 'react-router-dom'
import { HomeSkeleton } from '../components/LazyPage'
import { PosterRow } from '../components/PosterRow'
import { UpNext } from '../components/UpNextCard'
import { ContinueList, WeekList } from '../components/HomeLists'
import { SyncLine } from '../components/SyncLine'
import { RateFinished } from '../components/RateFinished'
import { ImportPrompts } from '../components/ImportPrompts'
import { DEFAULT_DEAL_PCT, continueItems, upNextItems, recentlyStalled, deals, readyToStart, thisWeek } from '../lib/home'
import { useItems } from '../lib/library'
import { useProfile } from '../lib/integrations'
import { useNewForYou } from '../lib/newForYou'
import { useFilters } from '../lib/useFilters'
import { plainError } from '../lib/errors'

/**
 * Home answers "what should I do next, and what's changed?" (docs/HOME.md). Browsing, filtering and sorting
 * everything lives on the Library page. Top to bottom: sync line, Up next cards, Continue and Next 7 days as lists,
 * then poster rows: New for you, Recently finished (rate it), Pick it back up?, Ready to start, Deals.
 */
export function Home() {
  const { items: allItems, isLoading, isSample, error } = useItems()
  const profile = useProfile()
  // Home takes only the type pills from the toolbar (?type=…), narrowing every row.
  const [filters] = useFilters()
  const items = filters.type ? allItems.filter((i) => i.title.mediaType === filters.type) : allItems
  const typeParam = filters.type ? `&type=${filters.type}` : ''
  const fresh = useNewForYou(isSample ? [] : items)
  const freshById = new Map(fresh.entries.map((e) => [e.item.id, e]))

  if (isLoading) return <HomeSkeleton />
  if (error) return <p className="py-16 text-center text-sm text-bad">{plainError(error, 'Couldn’t load your list. Try reloading the page.')}</p>

  if (!isSample && allItems.length === 0) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">What do you want to get to?</h1>
        <p className="mt-2 text-sm text-muted">
          Your library is empty. Use the search bar above to add a movie, show, game or book.
        </p>
      </div>
    )
  }

  const cont = continueItems(items)
  // Up next takes the best few; Continue lists the rest of what's in progress.
  const up = upNextItems(items)
  const upIds = new Set(up.map((i) => i.id))
  const rest = cont.filter((i) => !upIds.has(i.id))
  const week = thisWeek(items)
  const ready = readyToStart(items)
  const stalled = recentlyStalled(items)
  const dealPct = profile.data?.alert_settings?.deep_discount_pct ?? DEFAULT_DEAL_PCT
  const onDeal = deals(items, dealPct)
  const nothingGoingOn = cont.length === 0 && week.length === 0

  return (
    <div className="space-y-10">
      {nothingGoingOn && (
        <div className="rounded-xl border border-line bg-surface px-5 py-4">
          <p className="text-sm font-medium text-fg">You’re all caught up.</p>
          <p className="mt-0.5 text-sm text-muted">
            Nothing in progress and nothing out this week.
            {ready.length > 0 ? ' Here’s what’s ready to start.' : ' '}
            {ready.length === 0 && (
              <Link to="/library" className="text-accent-ink hover:underline">
                Browse your Library
              </Link>
            )}
          </p>
        </div>
      )}

      <SyncLine />
      <UpNext items={up} />
      {/* Wide screens: the rest of what you're in the middle of on the left, what's coming right beside it (each list at most
          36rem, so the two stay together instead of splitting to the page edges). */}
      {(rest.length > 0 || week.length > 0) && (
        <div className="grid items-start gap-10 xl:grid-cols-[repeat(2,minmax(0,36rem))]">
          <ContinueList items={rest} total={cont.length} href={`/library?status=in_progress${typeParam}`} />
          <WeekList upcoming={week} href="/calendar?view=month" />
        </div>
      )}
      <PosterRow
        title="New for you"
        hint="Last 7 days"
        items={fresh.entries.map((e) => e.item)}
        subline={(item) => freshById.get(item.id)?.label}
        action={
          <button type="button" onClick={fresh.clear} className="hit text-xs text-muted hover:text-fg">
            Clear
          </button>
        }
      />
      {!isSample && <RateFinished items={items} />}
      {!isSample && <ImportPrompts />}
      <PosterRow
        title="Pick it back up?"
        hint="Stalled in the last 3 months"
        items={stalled}
        href={`/library?status=stalled${typeParam}`}
      />
      <PosterRow
        title="Ready to start"
        hint="High priority and already out"
        items={ready}
        href={`/library?status=wanted&priority=high&release=released${typeParam}`}
      />
      <PosterRow
        title="Deals"
        hint={`Games at a historical low or ${dealPct}%+ off`}
        items={onDeal}
        href="/collections/default-deals"
      />
      {isSample && (
        <p className="text-center text-xs text-faint">
          A sample library to try out: mark episodes, change statuses, search it. Changes last until you reload.{' '}
          <Link to="/login" className="hit text-accent-ink hover:underline">
            Sign in
          </Link>{' '}
          to keep your own.
        </p>
      )}
    </div>
  )
}
