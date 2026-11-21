import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { PosterRow } from '../components/PosterRow'
import { continueItems, continueLine, readyToStart, thisWeek, thisWeekLine } from '../lib/home'
import { useItems } from '../lib/library'
import { useFilters } from '../lib/useFilters'

/**
 * Home answers "what should I do next, and what's changed?" (docs/HOME.md). Browsing, filtering and sorting
 * everything lives on the Library page. Step 1 rows: Continue · This week · Ready to start.
 */
export function Home() {
  const { items: allItems, isLoading, isSample, error } = useItems()
  // Home takes only the type pills from the toolbar (?type=…), narrowing every row.
  const [filters] = useFilters()
  const items = filters.type ? allItems.filter((i) => i.title.mediaType === filters.type) : allItems
  const typeParam = filters.type ? `&type=${filters.type}` : ''

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24 text-muted">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  if (error) return <p className="py-16 text-center text-sm text-bad">Couldn’t load your list: {error.message}</p>

  if (!isSample && allItems.length === 0) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="font-mono text-xs tracking-wider text-accent-ink uppercase">Your deck is empty</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">What do you want to get to?</h1>
        <p className="mt-2 text-sm text-muted">
          Use the search bar above to add a movie or TV show. Games and books are coming next.
        </p>
      </div>
    )
  }

  const cont = continueItems(items)
  const week = thisWeek(items)
  const weekById = new Map(week.map((u) => [u.item.id, u]))
  const ready = readyToStart(items)
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

      <PosterRow
        title="Continue"
        hint="Pick up where you left off"
        items={cont}
        subline={continueLine}
        href={`/library?status=in_progress${typeParam}`}
      />
      <PosterRow
        title="This week"
        hint="Out in the next 7 days"
        items={week.map((u) => u.item)}
        subline={(item) => {
          const u = weekById.get(item.id)
          return u ? thisWeekLine(u) : undefined
        }}
      />
      <PosterRow
        title="Ready to start"
        hint="High priority and already out"
        items={ready}
        href={`/library?status=wanted&priority=high&release=released${typeParam}`}
      />
    </div>
  )
}
