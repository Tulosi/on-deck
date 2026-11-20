import { Loader2 } from 'lucide-react'
import { PosterRow } from '../components/PosterRow'
import { useItems } from '../lib/library'
import { releaseInfo } from '../lib/release'

export function Home() {
  const { items, isLoading, isSample, error } = useItems()

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24 text-muted">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  if (error) return <p className="py-16 text-center text-sm text-bad">Couldn’t load your list: {error.message}</p>

  if (!isSample && items.length === 0) {
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

  const upNext = items.filter((i) => i.progress === 'wanted' && i.priority === 'high')
  const inProgress = items.filter((i) => i.progress === 'in_progress')
  const onSale = items.filter((i) => i.title.mediaType === 'game' && !i.owned && i.price?.discountPct)
  const finished = items.filter((i) => i.progress === 'completed')
  // Pre-release movies/shows, soonest first; no date yet (TBA) at the end.
  const comingSoon = items
    .map((i) => ({ item: i, release: releaseInfo(i.title) }))
    .filter((x) => x.release.preRelease)
    .sort((a, b) => (a.release.date ?? '9999').localeCompare(b.release.date ?? '9999'))
    .map((x) => x.item)

  return (
    <div className="space-y-10">
      <PosterRow title="Recently Added" items={items.slice(0, 20)} />
      <PosterRow title="Up Next" hint="High priority, not started" items={upNext} />
      <PosterRow title="In Progress" items={inProgress} />
      <PosterRow title="On Sale" hint="Wanted games with a discount" items={onSale} />
      <PosterRow title="Coming Soon" hint="Not released yet — soonest first" items={comingSoon} />
      <PosterRow title="Recently Finished" items={finished} />
    </div>
  )
}
