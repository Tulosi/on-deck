// Status wording per media type (docs/ROADMAP.md → Group B). One place for every screen that names a status.
import type { MediaType, Progress } from '../types'

const WORDS: Record<MediaType, Partial<Record<Progress, string>>> = {
  movie: { wanted: 'Want to Watch', in_progress: 'In Progress', completed: 'Watched It', dropped: 'Dropped It' },
  tv: {
    wanted: 'Want to Watch',
    in_progress: 'In Progress',
    caught_up: 'Caught Up',
    completed: 'Watched It',
    dropped: 'Dropped It',
  },
  game: { wanted: 'Want to Play', in_progress: 'Playing It', stalled: 'Stalled', completed: 'Beat It', dropped: 'Dropped It' },
  book: { wanted: 'Want to Read', in_progress: 'Reading It', stalled: 'Stalled', completed: 'Read It', dropped: 'Dropped It' },
}

/** When several types are mixed (Library → All, groupings): neutral words. */
const MIXED: Record<Progress, string> = {
  wanted: 'Wanted',
  in_progress: 'In Progress',
  caught_up: 'Caught Up',
  stalled: 'Stalled',
  completed: 'Done',
  dropped: 'Dropped',
}

export function statusLabel(progress: Progress, type?: MediaType | null): string {
  return (type && WORDS[type][progress]) || MIXED[progress]
}

/** Statuses a type can have, in order. Shows get Caught Up (ongoing) or Watched It (ended), never both. */
export function statusesFor(type: MediaType, opts: { ongoingShow?: boolean } = {}): Progress[] {
  switch (type) {
    case 'tv':
      return ['wanted', 'in_progress', opts.ongoingShow ? 'caught_up' : 'completed', 'dropped']
    case 'movie':
      return ['wanted', 'in_progress', 'completed', 'dropped']
    default:
      return ['wanted', 'in_progress', 'stalled', 'completed', 'dropped']
  }
}

/** Statuses that exist for a Library filter view (null = all types). */
export function statusFilterOptions(type: MediaType | null): Progress[] {
  if (type === 'movie') return ['wanted', 'in_progress', 'completed', 'dropped']
  if (type === 'tv') return ['wanted', 'in_progress', 'caught_up', 'completed', 'dropped']
  if (type === 'game' || type === 'book') return ['wanted', 'in_progress', 'stalled', 'completed', 'dropped']
  return ['wanted', 'in_progress', 'caught_up', 'stalled', 'completed', 'dropped']
}
