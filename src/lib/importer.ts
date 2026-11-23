// Steam / Plex import pickers (docs/ROADMAP.md → Group F): candidates come from the `importer` function; adding
// goes through each source's normal "add" (so titles are fully fetched), then a library entry with a sensible status.
import { callFn } from './integrations'
import { supabase } from './supabase'
import type { Progress } from '../types'

export type ImportSource = 'steam' | 'plex'

export interface Candidate {
  key: string
  source: 'igdb' | 'tmdb'
  sourceId: string
  mediaType: 'game' | 'movie' | 'tv'
  title: string
  year: number | null
  poster: string | null
  group: string
  detail: string
  suggested: boolean
  sortValue: number
  /** Steam app id (Steam candidates). */
  appid?: string
}

export interface CandidateList {
  candidates: Candidate[]
  /** 'not_linked' (account not linked) or 'private' (Steam game details private). */
  note?: 'not_linked' | 'private'
  /** Steam apps with no IGDB match (can't be added). */
  unmatched?: number
}

export const fetchCandidates = (source: ImportSource) => callFn<CandidateList>('importer', { action: source })

/** Ongoing Steam sync (Group F2): games newly found in the user's Steam library, not answered yet. */
export const fetchSteamNew = () => callFn<CandidateList>('importer', { action: 'steam_new' })
/** Marks Steam games as answered so they aren't offered again. */
export const markSteamSeen = (appids: string[]) => callFn<{ ok: boolean }>('importer', { action: 'steam_seen', appids })
/** Most recently watched Plex titles not in the library (and not skipped before), newest first. */
export const fetchPlexRecent = () => callFn<CandidateList>('importer', { action: 'plex_recent' })

/** "Not interested": remembered, so the title isn't offered again (here or in the import picker). */
export async function skipCandidate(userId: string, c: Candidate) {
  await supabase!.from('import_skips').upsert({ user_id: userId, key: c.key }, { onConflict: 'user_id,key', ignoreDuplicates: true })
}

export async function fetchSkips(): Promise<Set<string>> {
  const { data } = await supabase!.from('import_skips').select('key')
  return new Set((data ?? []).map((r) => r.key as string))
}

/** Status for a newly imported title. */
function initialStatus(c: Candidate): { progress: Progress; owned: boolean } {
  if (c.group === 'New on Steam') return { progress: c.sortValue > 0 ? 'in_progress' : 'wanted', owned: true } // sortValue = minutes played
  if (c.mediaType === 'game') return c.group === 'Steam wishlist' ? { progress: 'wanted', owned: false } : { progress: 'in_progress', owned: true }
  if (c.mediaType === 'movie') return { progress: 'completed', owned: false }
  return { progress: 'in_progress', owned: false } // shows: Plex sync then sets the episode; Caught up / Watched follow
}

export interface ImportResult {
  added: number
  failed: { key: string; title: string; reason: string }[]
}

/**
 * Adds the chosen titles (3 at a time), then remembers what was left unticked so a later import keeps it
 * unticked. `notChosen` = candidates shown but not picked (titles already in the library excluded).
 */
export async function importCandidates(
  userId: string,
  chosen: Candidate[],
  notChosen: Candidate[],
  onProgress: (done: number, total: number) => void,
): Promise<ImportResult> {
  const db = supabase!
  const result: ImportResult = { added: 0, failed: [] }
  let done = 0
  onProgress(0, chosen.length)
  const queue = [...chosen]
  const worker = async () => {
    while (queue.length) {
      const c = queue.shift()!
      try {
        const { data, error } =
          c.source === 'igdb'
            ? await db.functions.invoke('igdb', { body: { action: 'add', igdbId: Number(c.sourceId) } })
            : await db.functions.invoke('tmdb', { body: { action: 'add', tmdbId: Number(c.sourceId), mediaType: c.mediaType } })
        if (error || !data?.title?.id) throw new Error('couldn’t be fetched')
        const now = new Date().toISOString()
        const s = initialStatus(c)
        const { error: e } = await db.from('user_items').upsert(
          {
            user_id: userId,
            title_id: data.title.id,
            progress: s.progress,
            owned: s.owned,
            ...(s.progress === 'in_progress' ? { started_at: now } : {}),
            ...(s.progress === 'completed' ? { completed_at: now } : {}),
          },
          { onConflict: 'user_id,title_id', ignoreDuplicates: true },
        )
        if (e) throw e
        result.added++
      } catch (err) {
        result.failed.push({ key: c.key, title: c.title, reason: err instanceof Error ? err.message : 'failed' })
      }
      onProgress(++done, chosen.length)
    }
  }
  // Two at a time: each add makes several IGDB calls, and IGDB allows about 4 a second.
  await Promise.all([worker(), worker()])

  // Remember choices for next time: unticked → skipped; picked → no longer skipped.
  if (notChosen.length) {
    for (let i = 0; i < notChosen.length; i += 200) {
      await db
        .from('import_skips')
        .upsert(
          notChosen.slice(i, i + 200).map((c) => ({ user_id: userId, key: c.key })),
          { onConflict: 'user_id,key', ignoreDuplicates: true },
        )
    }
  }
  if (chosen.length) await db.from('import_skips').delete().in('key', chosen.map((c) => c.key))
  return result
}
