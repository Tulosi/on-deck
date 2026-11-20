import { useState } from 'react'
import clsx from 'clsx'
import { PageHeader } from '../components/PageHeader'
import { PosterCard } from '../components/PosterCard'
import { sampleItems } from '../data/sample'
import { mediaLabels, type MediaType, type Progress } from '../types'

const progressFilters: { value: Progress | 'all'; label: (t: MediaType) => string }[] = [
  { value: 'all', label: () => 'All' },
  { value: 'wanted', label: () => 'Wanted' },
  { value: 'in_progress', label: () => 'In Progress' },
  { value: 'completed', label: (t) => mediaLabels[t].done },
  { value: 'dropped', label: () => 'Dropped' },
]

const selectClass =
  'h-8 rounded-md border border-line bg-surface px-2 text-sm text-fg outline-none focus:border-accent'

export function CategoryPage({ mediaType }: { mediaType: MediaType }) {
  const [progress, setProgress] = useState<Progress | 'all'>('all')
  const [genre, setGenre] = useState('all')

  const all = sampleItems.filter((i) => i.title.mediaType === mediaType)
  const genres = [...new Set(all.flatMap((i) => i.title.genres))].sort()
  const items = all.filter(
    (i) => (progress === 'all' || i.progress === progress) && (genre === 'all' || i.title.genres.includes(genre)),
  )

  return (
    <div>
      <PageHeader title={mediaLabels[mediaType].plural} meta={`${items.length} / ${all.length}`} />

      {/* Filter bar. Year, priority and game features (co-op, Steam Deck, HLTB) come with real data. */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
          {progressFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setProgress(f.value)}
              className={clsx(
                'rounded-md px-2.5 py-1 text-sm transition-colors',
                progress === f.value ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg',
              )}
            >
              {f.label(mediaType)}
            </button>
          ))}
        </div>
        <select value={genre} onChange={(e) => setGenre(e.target.value)} className={selectClass} aria-label="Genre">
          <option value="all">All genres</option>
          {genres.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">Nothing here yet.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
          {items.map((item) => (
            <PosterCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
