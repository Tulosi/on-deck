// Shared domain types. These mirror the Supabase schema in supabase/migrations.

export type MediaType = 'movie' | 'tv' | 'game' | 'book'
export type Progress = 'wanted' | 'in_progress' | 'caught_up' | 'stalled' | 'completed' | 'dropped'
export type Verdict = 'liked' | 'disliked'
export type Priority = 'high' | 'medium' | 'low'
export type PlexStatus = 'available' | 'requested' | 'missing'
export type SeasonOverride = 'watched' | 'unwatched' | 'ignored'

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
  backdropUrl?: string
  overview?: string
  releaseDate?: string
  /** `${mediaType}:${source}:${sourceId}` — matches search results to titles already on deck. */
  sourceKey?: string
  /** Type-specific extras from the source (runtime, seasons, networks …). */
  details?: Record<string, unknown>
  /** Games on Steam: the store app id (for Open in Steam). */
  steamAppId?: number
  /** All known review scores (the poster shows only `score`). */
  ratings?: {
    imdb?: string
    rottenTomatoes?: string
    rtAudience?: string
    /** Games only. */
    metacritic?: string
    tmdb?: number
  }
  /** Movie/TV whose review scores are missing or stale — the app refreshes them in the background. */
  needsScores?: boolean
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
  /** TV: Watched-up-to mirrors Plex (default) unless the user overrode it for this show. */
  plexSync?: boolean
  /** "Notify me": release, availability and price alerts for this title (default on). */
  notify?: boolean
  /** Home rating prompts dismissed with "Not now" ("title", "s2" …). */
  ratingSkipped?: string[]
  /** Games / books: when it was set to Stalled. */
  stalledAt?: string
  /** Set = archived (hidden by default everywhere). */
  archivedAt?: string
  /** When the user (or sync) marked it Watched/Played/Read. */
  completedAt?: string
  /** Games: playtime and last played, from the linked Steam account. */
  steamPlaytimeMinutes?: number
  steamLastPlayed?: string
  /** When it was added to the deck / last changed (ISO). */
  addedAt?: string
  updatedAt?: string
  /** Last real interaction (status / episode change, Plex watch, Steam play): Home's Continue order. */
  lastActivityAt?: string
  /** Kept out of Home's "Pick it back up?" row until then (ISO), on every device. */
  snoozedUntil?: string
  /** TV: per-season completion overrides (season number → state); omitted seasons are auto. */
  seasonOverrides?: Record<string, SeasonOverride>
  /** Games only — poster badge: the cheapest current price (formatted) and its % off Steam's full price. */
  price?: { amount: string; discountPct?: number; atLow?: boolean }
  /** Games only — full price data for the user's region (official Steam-key vs key shop). */
  gamePrice?: GamePrice
  /** Movies/TV only — from the user's Seerr instance. */
  plex?: PlexStatus
  /** Movies/TV: on Plex or one of the user's streaming services (stored; undefined = not checked yet). */
  available?: boolean
  /** Movies/TV: where — "Plex" and/or service names. */
  availableVia?: string[]
  /** When it last became available (for Home's "Now available"). */
  becameAvailableAt?: string
}

export const mediaLabels: Record<MediaType, { singular: string; plural: string; done: string }> = {
  movie: { singular: 'Movie', plural: 'Movies', done: 'Watched' },
  tv: { singular: 'TV show', plural: 'TV shows', done: 'Watched' },
  game: { singular: 'Game', plural: 'Games', done: 'Played' },
  book: { singular: 'Book', plural: 'Books', done: 'Read' },
}

/** A game's prices in one region (from `game_prices`). */
import type { GamePrice } from '../../supabase/functions/_shared/prices.ts'
export type { GamePrice }
