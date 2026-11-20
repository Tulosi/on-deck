// Shared domain types. These mirror the Supabase schema in supabase/migrations.

export type MediaType = 'movie' | 'tv' | 'game' | 'book'
export type Progress = 'wanted' | 'in_progress' | 'completed' | 'dropped'
export type Verdict = 'liked' | 'disliked'
export type Priority = 'high' | 'medium' | 'low'
export type PlexStatus = 'available' | 'requested' | 'missing'

/** Shared, cached metadata for a title (one row per real-world title). */
export interface Title {
  id: string
  mediaType: MediaType
  title: string
  year?: number
  coverUrl?: string
  genres: string[]
  /** Headline score for the poster card: IMDb (film/TV), Steam % (games), Hardcover (books). */
  score?: { label: string; value: string }
  /** Small line under the year, e.g. author or developer. */
  byline?: string
}

/** A user's tracking state for one title. */
export interface UserItem {
  id: string
  title: Title
  owned: boolean
  progress: Progress
  verdict?: Verdict
  favourite: boolean
  priority?: Priority
  notes?: string
  tvProgress?: { season: number; episode: number }
  /** Games only — best current price across Steam and gg.deals. */
  price?: { amount: string; discountPct?: number }
  /** Movies/TV only — from the user's Seerr instance. */
  plex?: PlexStatus
}

export const mediaLabels: Record<MediaType, { singular: string; plural: string; done: string }> = {
  movie: { singular: 'Movie', plural: 'Movies', done: 'Watched' },
  tv: { singular: 'TV Show', plural: 'TV Shows', done: 'Watched' },
  game: { singular: 'Game', plural: 'Games', done: 'Played' },
  book: { singular: 'Book', plural: 'Books', done: 'Read' },
}
