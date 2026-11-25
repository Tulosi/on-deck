// Status wording per media type (docs/ROADMAP.md → Group B). One place for every screen that names a status.
import type { MediaType, Progress } from '../types'

const WORDS: Record<MediaType, Partial<Record<Progress, string>>> = {
  movie: { wanted: 'Want to watch', in_progress: 'In progress', completed: 'Watched it', dropped: 'Dropped it' },
  tv: {
    wanted: 'Want to watch',
    in_progress: 'In progress',
    caught_up: 'Caught up',
    completed: 'Watched it',
    dropped: 'Dropped it',
  },
  game: {
    wanted: 'Want to play',
    in_progress: 'Playing it',
    // Early Access games: played what's out, waiting for the full release.
    caught_up: 'Waiting for 1.0',
    stalled: 'Stalled',
    completed: 'Beat it',
    dropped: 'Dropped it',
  },
  book: { wanted: 'Want to read', in_progress: 'Reading it', stalled: 'Stalled', completed: 'Read it', dropped: 'Dropped it' },
}

/** When several types are mixed (Library → All, groupings): neutral words. */
const MIXED: Record<Progress, string> = {
  wanted: 'Wanted',
  in_progress: 'In progress',
  caught_up: 'Caught up',
  stalled: 'Stalled',
  completed: 'Done',
  dropped: 'Dropped',
}

export function statusLabel(progress: Progress, type?: MediaType | null): string {
  return (type && WORDS[type][progress]) || MIXED[progress]
}

const ALL: MediaType[] = ['movie', 'tv', 'game', 'book']

/** The word each picked type (none = all) uses for a status, without repeats. */
export function statusWords(progress: Progress, types: readonly MediaType[]): string[] {
  return [...new Set((types.length ? types : ALL).map((t) => WORDS[t][progress]).filter((w): w is string => !!w))]
}

/** A status named for a set of types: their shared word ("Want to watch" for movies and TV), else the neutral one. */
export function statusLabelFor(progress: Progress, types: readonly MediaType[]): string {
  const words = statusWords(progress, types)
  return words.length === 1 ? words[0] : MIXED[progress]
}

/**
 * Statuses a type can have, in order. Shows get Caught Up (ongoing) or Watched It (ended), never both. Early Access
 * games also get Waiting for 1.0 (stored as caught_up, the same "seen all that's out" idea); a game already set to it
 * keeps the option after 1.0 comes out, so you can move it on.
 */
export function statusesFor(
  type: MediaType,
  opts: { ongoingShow?: boolean; earlyAccess?: boolean; current?: Progress } = {},
): Progress[] {
  switch (type) {
    case 'tv':
      return ['wanted', 'in_progress', opts.ongoingShow ? 'caught_up' : 'completed', 'dropped']
    case 'movie':
      return ['wanted', 'in_progress', 'completed', 'dropped']
    case 'game':
      return opts.earlyAccess || opts.current === 'caught_up'
        ? ['wanted', 'in_progress', 'caught_up', 'stalled', 'completed', 'dropped']
        : ['wanted', 'in_progress', 'stalled', 'completed', 'dropped']
    default:
      return ['wanted', 'in_progress', 'stalled', 'completed', 'dropped']
  }
}

/** Statuses that exist for any of the picked types (none = all), in order. */
export function statusFilterOptionsFor(types: readonly MediaType[]): Progress[] {
  if (types.length === 1) return statusFilterOptions(types[0])
  const have = new Set(types.flatMap((t) => statusFilterOptions(t)))
  return statusFilterOptions(null).filter((p) => !types.length || have.has(p))
}

/** Statuses that exist for a Library filter view (null = all types). */
export function statusFilterOptions(type: MediaType | null): Progress[] {
  if (type === 'movie') return ['wanted', 'in_progress', 'completed', 'dropped']
  if (type === 'tv') return ['wanted', 'in_progress', 'caught_up', 'completed', 'dropped']
  if (type === 'game') return ['wanted', 'in_progress', 'caught_up', 'stalled', 'completed', 'dropped']
  if (type === 'book') return ['wanted', 'in_progress', 'stalled', 'completed', 'dropped']
  return ['wanted', 'in_progress', 'caught_up', 'stalled', 'completed', 'dropped']
}
