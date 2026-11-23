// What a Plex watch-history read means for one library item. Plain TypeScript, shared by the show page,
// the app's background sync and the `daily` job, so all three apply exactly the same rules.
//  - TV: Watched-up-to mirrors Plex exactly (forwards or backwards). Progress: Wanted → In Progress once
//    anything is watched; Watched once the final episode of an ended / cancelled show is watched.
//  - Movies (forward only): started → In Progress (from Wanted); finished → Watched (from Wanted / In Progress).
//  - Never touches Dropped titles, or anything with Plex sync switched off for it.

export type Progress = 'wanted' | 'in_progress' | 'caught_up' | 'stalled' | 'completed' | 'dropped'

export interface PlexWatchResult {
  configured?: boolean
  found?: boolean
  lastWatched?: { season: number; episode: number } | null
  movie?: { state: 'watched' | 'in_progress' | 'unwatched'; percent: number }
}

export interface PlexItemState {
  mediaType: 'movie' | 'tv'
  progress: Progress
  tvProgress: { season: number; episode: number } | null
  plexSync: boolean
  /** TV: TMDB status ("Ended", "Canceled", "Returning Series" …). */
  showStatus?: string | null
  /** TV: the last real season and its episode count. */
  finalSeason?: { season_number: number; episode_count: number } | null
}

export interface PlexPatch {
  /** TV only; null = nothing watched on Plex. */
  tvProgress?: { season: number; episode: number } | null
  progress?: Progress
}

/** The change to make, or null when nothing should change. */
export function plexPatch(item: PlexItemState, w: PlexWatchResult | null | undefined): PlexPatch | null {
  if (!w || !w.configured || !w.found || !item.plexSync) return null

  if (item.mediaType === 'movie') {
    if (!w.movie) return null
    if (w.movie.state === 'watched' && (item.progress === 'wanted' || item.progress === 'in_progress')) return { progress: 'completed' }
    if (w.movie.state === 'in_progress' && item.progress === 'wanted') return { progress: 'in_progress' }
    return null
  }

  const target = w.lastWatched ?? null
  const cur = item.tvProgress
  const same = (!target && !cur) || (!!target && !!cur && target.season === cur.season && target.episode === cur.episode)
  if (same) return null
  const patch: PlexPatch = { tvProgress: target ? { season: target.season, episode: target.episode } : null }
  if (target && item.progress !== 'dropped') {
    const f = item.finalSeason
    const ended = item.showStatus === 'Ended' || item.showStatus === 'Canceled'
    if (ended && f && target.season === f.season_number && target.episode >= f.episode_count) patch.progress = 'completed'
    else if (item.progress === 'wanted') patch.progress = 'in_progress'
  }
  return patch
}

/** The last real season (specials excluded) from TMDB's stored seasons. */
export function finalSeasonOf(details: Record<string, unknown> | null | undefined): PlexItemState['finalSeason'] {
  const seasons = Array.isArray(details?.seasons)
    ? (details!.seasons as { season_number: number; episode_count: number }[]).filter((s) => s.season_number > 0 && s.episode_count > 0)
    : []
  return seasons.length ? seasons[seasons.length - 1] : null
}
