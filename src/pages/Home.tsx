import { PosterRow } from '../components/PosterRow'
import { sampleItems } from '../data/sample'

export function Home() {
  const items = sampleItems
  const upNext = items.filter((i) => i.progress === 'wanted' && i.priority === 'high')
  const inProgress = items.filter((i) => i.progress === 'in_progress')
  const onSale = items.filter((i) => i.title.mediaType === 'game' && !i.owned && i.price?.discountPct)
  const finished = items.filter((i) => i.progress === 'completed')

  return (
    <div className="space-y-10">
      <PosterRow title="Up Next" hint="High priority, not started" items={upNext} />
      <PosterRow title="In Progress" items={inProgress} />
      <PosterRow title="On Sale" hint="Wanted games with a discount" items={onSale} />
      {/* "Upcoming" row needs release dates from TMDB — added once the API is connected. */}
      <PosterRow title="Recently Finished" items={finished} />
      <PosterRow title="Everything on Deck" items={items} />
    </div>
  )
}
