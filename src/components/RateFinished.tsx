import { Link } from 'react-router-dom'
import { BookOpen, Film, Gamepad2, ThumbsDown, ThumbsUp, Tv, type LucideIcon } from 'lucide-react'
import { useUpdateItem } from '../lib/library'
import { finishedSeasons } from '../lib/seasons'
import type { MediaType, UserItem, Verdict } from '../types'

const RECENT_MS = 60 * 86_400_000
const typeIcon: Record<MediaType, LucideIcon> = { movie: Film, tv: Tv, game: Gamepad2, book: BookOpen }
const DONE_WORD: Record<MediaType, string> = { movie: 'Watched', tv: 'Watched', game: 'Played', book: 'Read' }

export interface RatePrompt {
  item: UserItem
  /** What "Not now" remembers: "title" (movies / games / books) or "s2" (a show, after season 2). */
  key: string
  label: string
  at: number
}

const recent = (iso: string | undefined) => !!iso && Date.now() - Date.parse(iso) < RECENT_MS

/**
 * Things you finished lately but haven't rated, newest first:
 *  - shows with no rating, once you've finished a season (show changed in the last 60 days). "Not now" is per
 *    season, so it asks again after the next season you finish.
 *  - movies, games, books: marked Watched / Played / Read in the last 60 days, with no rating
 * Prompts dismissed with "Not now" are kept in `rating_skipped`.
 */
export function ratePrompts(items: UserItem[]): RatePrompt[] {
  const out: RatePrompt[] = []
  for (const item of items) {
    if (item.progress === 'dropped') continue
    const skipped = item.ratingSkipped ?? []
    if (item.title.mediaType === 'tv') {
      if (item.verdict || !recent(item.updatedAt)) continue
      const n = finishedSeasons(item).at(-1)
      if (n == null || skipped.includes(`s${n}`)) continue
      const all = item.progress === 'completed'
      out.push({ item, key: `s${n}`, label: all ? 'Watched' : `Finished season ${n}`, at: Date.parse(item.updatedAt!) })
    } else {
      if (item.progress !== 'completed' || item.verdict || skipped.includes('title')) continue
      const when = item.completedAt ?? item.updatedAt
      if (!recent(when)) continue
      out.push({ item, key: 'title', label: DONE_WORD[item.title.mediaType], at: Date.parse(when!) })
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 12)
}

function PromptCard({ p }: { p: RatePrompt }) {
  const update = useUpdateItem()
  const { item } = p
  const Icon = typeIcon[item.title.mediaType]
  const rate = (v: Verdict) => update(item, { verdict: v })
  const skip = () => update(item, { ratingSkipped: [...(item.ratingSkipped ?? []), p.key] })

  return (
    <div className="flex w-[19.5rem] shrink-0 snap-start gap-3 rounded-xl border border-line bg-surface p-3">
      <Link to={`/title/${item.title.id}`} className="h-24 w-16 shrink-0 overflow-hidden rounded-md border border-line bg-raised">
        {item.title.coverUrl ? (
          <img src={item.title.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-faint">
            <Icon className="size-4" />
          </div>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link to={`/title/${item.title.id}`} className="truncate text-sm font-medium text-fg hover:text-accent-ink">
          {item.title.title}
        </Link>
        <p className="truncate font-mono text-[11px] text-faint">{p.label}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-2">
          <button
            type="button"
            onClick={() => void rate('liked')}
            aria-label={`Liked ${item.title.title}`}
            className="flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-xs text-fg hover:border-good hover:text-good"
          >
            <ThumbsUp className="size-3.5" /> Liked
          </button>
          <button
            type="button"
            onClick={() => void rate('disliked')}
            aria-label={`Didn’t like ${item.title.title}`}
            className="flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-xs text-fg hover:border-bad hover:text-bad"
          >
            <ThumbsDown className="size-3.5" /> Nope
          </button>
          <button type="button" onClick={() => void skip()} className="ml-auto pl-1 text-[11px] whitespace-nowrap text-faint hover:text-fg">
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

/** Home: "Recently finished — how was it?" */
export function RateFinished({ items }: { items: UserItem[] }) {
  const prompts = ratePrompts(items)
  if (prompts.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold tracking-tight whitespace-nowrap text-fg">Recently finished</h2>
        <span className="font-mono text-xs text-faint">{prompts.length}</span>
        <span className="hidden text-xs text-faint sm:inline">How was it? A quick rating keeps your library honest.</span>
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:scroll-px-6 md:px-6">
        {prompts.map((p) => (
          <PromptCard key={`${p.item.id}:${p.key}`} p={p} />
        ))}
      </div>
    </section>
  )
}
