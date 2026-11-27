// Home rows — "what's next, and what's changed" (docs/HOME.md). Step 1: Continue, This week, Ready to start,
// computed from data the app already has. "New for you", stored availability and Deals come later.
import { hoursToBeat, isAvailable } from './filters'
import { cheapest } from './prices'
import { episodeCode, releaseInfo, todayIso, tvSchedule } from './release'
import { episodeAirDate, firstUnaired, nextIsStale, overrideOf, seasonsOf, watchedIn } from './seasons'
import type { UserItem } from '../types'

const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
const monthDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/**
 * TV: the first episode you haven't watched, going season by season. Seasons marked Watched or Ignored by hand
 * (per-season overrides) count as done, so S1–S4 marked Watched → S5 · E1. Uses the same rules as the show
 * page (lib/seasons.ts). Null when everything listed is watched.
 */
function nextEpisode(item: UserItem): { season: number; episode: number } | null {
  const seasons = seasonsOf(item)
  if (seasons.length === 0) return null
  for (const s of seasons) {
    const o = overrideOf(item, s.season_number)
    if (o === 'ignored' || o === 'watched') continue
    const watched = watchedIn(item, s, s.episode_count)
    if (watched < s.episode_count) return { season: s.season_number, episode: watched + 1 }
  }
  return null
}

/**
 * Has this episode aired? Out if it comes before the first episode not known to have aired (firstUnaired, which
 * corrects TMDB's lag on premiere days). The announced next episode: its air date. Past that: not out, and
 * `unknown` when TMDB's "next" is itself out of date, so nothing claims a date is "not announced" that may be.
 */
function airState(item: UserItem, ep: { season: number; episode: number }): { out: boolean; date?: string; unknown?: boolean } {
  const first = firstUnaired(item)
  if (!first) return { out: true }
  if (ep.season < first.season || (ep.season === first.season && ep.episode < first.episode)) return { out: true }
  const next = item.title.details?.next_episode_to_air as
    | { season_number?: number; episode_number?: number; air_date?: string }
    | null
    | undefined
  // A dated episode of the airing season: its own date. Otherwise the announced next episode's.
  const own = episodeAirDate(item, ep)
  if (own) return own <= todayIso() ? { out: true } : { out: false, date: own }
  const isNext = ep.season === next?.season_number && ep.episode === next.episode_number
  if (isNext && next?.air_date && next.air_date <= todayIso()) return { out: true }
  return { out: false, date: isNext ? next?.air_date : undefined, unknown: nextIsStale(item) }
}

/**
 * The episode a one-tap "Watched" on Continue would mark: the next one, if it's out. Not offered while Plex
 * sync drives this show's progress (it would just be overwritten), i.e. only when sync is off for it or the
 * show isn't on Plex.
 */
export function nextWatchable(item: UserItem): { season: number; episode: number } | null {
  if (item.title.mediaType !== 'tv' || seasonsOf(item).length === 0) return null
  if (item.plexSync !== false && item.plex === 'available') return null
  const ep = nextEpisode(item)
  return ep && airState(item, ep).out ? ep : null
}

const hours = (h: number) => (h < 1 ? `${Math.round(h * 60)}m` : `${Math.round(h)}h`)

/** 1. Continue — in progress, most recently interacted with first (watched, played, status / episode changed). */
export function continueItems(items: UserItem[]): UserItem[] {
  return items
    .filter((i) => i.progress === 'in_progress')
    .sort((a, b) => Date.parse(b.lastActivityAt ?? b.updatedAt ?? '0') - Date.parse(a.lastActivityAt ?? a.updatedAt ?? '0'))
}

/** Most Up next cards Home shows. */
export const UP_NEXT_MAX = 5
const UP_NEXT_IDLE_MS = 60 * 86_400_000

/**
 * Can you pick this up right now? Shows need their next episode out; everything else always can. Plex sync doesn't
 * matter here (Home's Up next and Pick for me both use this).
 */
export function readyNow(item: UserItem): boolean {
  if (item.title.mediaType !== 'tv') return true
  // No season data (sample titles): trust the progress you've recorded.
  if (seasonsOf(item).length === 0) return !!item.tvProgress
  const ep = nextEpisode(item)
  if (!ep) return false
  const state = airState(item, ep)
  // Unsure (TMDB lagging on release day): better to offer it than to hide it.
  return state.out || !!state.unknown
}

/**
 * Up next: the best few things to pick up now (up to UP_NEXT_MAX), most recently active first. A candidate has
 * a next step you can take today (a show waiting for its next episode isn't one) and was touched in the last
 * 60 days (older ones read as stalled, not next). With no candidate at all, the most recent item still shows,
 * so the top of Home isn't empty while you have something in progress.
 */
export function upNextItems(items: UserItem[]): UserItem[] {
  const cont = continueItems(items)
  const now = Date.now()
  const picks = cont.filter((i) => readyNow(i) && now - Date.parse(i.lastActivityAt ?? i.updatedAt ?? '0') < UP_NEXT_IDLE_MS)
  return (picks.length ? picks : cont).slice(0, UP_NEXT_MAX)
}

export interface Upcoming {
  item: UserItem
  date: string
  daysUntil: number
  label: string
}

/** 2. This week — releases, premieres and new episodes in the next 7 days (shows you haven't dropped). */
export function thisWeek(items: UserItem[]): Upcoming[] {
  const out: Upcoming[] = []
  for (const item of items) {
    if (item.progress === 'dropped') continue
    const rel = releaseInfo(item.title)
    if (rel.preRelease && rel.date && rel.daysUntil != null && rel.daysUntil <= 7) {
      out.push({ item, date: rel.date, daysUntil: rel.daysUntil, label: item.title.mediaType === 'tv' ? 'Premiere' : 'Release' })
      continue
    }
    const sched = tvSchedule(item.title)
    if (sched && sched.daysUntil <= 7) {
      out.push({
        item,
        date: sched.date,
        daysUntil: sched.daysUntil,
        label: sched.kind === 'airing' ? episodeCode({ season: sched.season, episode: sched.episode }) : `Season ${sched.season} premiere`,
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 3. Ready to start — High-priority Wanted titles you can start now: out, and available (movies/TV on your
 * Plex or streaming services; games/books In your library). Movies/TV not checked yet are kept, so the row
 * isn't empty before the first availability refresh, unless Plex already says it's only requested or missing.
 */
/**
 * Not checked against streaming yet, but Plex already says it isn't there (only requested, or missing):
 * "ready to start" would be a promise the row can't keep.
 */
function knownUnwatchable(i: UserItem): boolean {
  return i.available == null && (i.plex === 'requested' || i.plex === 'missing')
}

export function readyToStart(items: UserItem[]): UserItem[] {
  return items
    .filter((i) => i.progress === 'wanted' && i.priority === 'high' && !releaseInfo(i.title).preRelease)
    .filter((i) => isAvailable(i) !== false && !knownUnwatchable(i))
    .sort((a, b) => Date.parse(b.addedAt ?? '0') - Date.parse(a.addedAt ?? '0'))
    .slice(0, 10)
}

/**
 * 5. Deals — games you don't own (not Played / Dropped) at a historical low, or at least your deep-discount
 * threshold off Steam's full price (Settings → Notifications; default 30 %), cheapest first.
 */
/** Same default as the deep-discount alert (Settings → Notifications). */
export const DEFAULT_DEAL_PCT = 30

export function deals(items: UserItem[], minDiscountPct = DEFAULT_DEAL_PCT): UserItem[] {
  return items
    .filter((i) => i.title.mediaType === 'game' && !i.owned && i.progress !== 'completed' && i.progress !== 'dropped')
    .map((i) => ({ i, best: i.gamePrice && !i.gamePrice.isFree ? cheapest(i.gamePrice) : null }))
    .filter((x) => x.best && (x.best.atLow || (x.best.discountPct ?? 0) >= minDiscountPct))
    .sort((a, b) => a.best!.price - b.best!.price)
    .map((x) => x.i)
}

const STALLED_RECENT_MS = 90 * 86_400_000

/** "Pick it back up?" — anything set to Stalled in the last 3 months (any type), most recent first. */
export function recentlyStalled(items: UserItem[]): UserItem[] {
  const now = Date.now()
  return items
    .filter((i) => i.progress === 'stalled' && !!i.stalledAt && now - Date.parse(i.stalledAt) < STALLED_RECENT_MS)
    .sort((a, b) => Date.parse(b.stalledAt!) - Date.parse(a.stalledAt!))
}

export { episodeCode } from './release'

export interface UpNext {
  /** The big number: an episode code, or time played for a game. */
  value?: string
  /** One short line under it ("Out now", "Out Tue", "Caught up"). */
  note?: string
  /** A progress bar: this season's episodes, or hours played against time to beat. */
  bar?: { done: number; total: number; text: string; label: string }
  /** The episode a one-tap "Mark watched" would save, when that's offered. */
  watchable?: { season: number; episode: number } | null
}

/** Home's Up next card: the most recent thing you're in the middle of, with its next concrete step. */
export function upNext(item: UserItem): UpNext {
  if (item.title.mediaType === 'game') {
    const played = item.steamPlaytimeMinutes ? item.steamPlaytimeMinutes / 60 : 0
    const beat = hoursToBeat(item)
    return {
      value: played ? hours(played) : undefined,
      note: beat ? `of about ${hours(beat)} to beat` : played ? 'played' : undefined,
      bar:
        played && beat
          ? { done: Math.min(played, beat), total: beat, text: `${Math.min(100, Math.round((played / beat) * 100))}%`, label: `${hours(played)} of about ${hours(beat)} played` }
          : undefined,
    }
  }
  if (item.title.mediaType !== 'tv') return {}
  const seasons = seasonsOf(item)
  // No season data (sample titles): show where you are rather than guess what's next.
  if (seasons.length === 0) return item.tvProgress ? { value: episodeCode(item.tvProgress), note: 'Last watched' } : {}
  const ep = nextEpisode(item)
  if (!ep) return { note: 'Caught up' }
  const state = airState(item, ep)
  const note = state.out
    ? 'Out now'
    : state.date
      ? `Out ${weekday(state.date)}, ${monthDay(state.date)}`
      : state.unknown
        ? undefined
        : 'Not announced yet'
  const s = seasons.find((x) => x.season_number === ep.season)
  const done = s ? watchedIn(item, s, s.episode_count) : 0
  return {
    value: episodeCode(ep),
    note,
    bar: s ? { done, total: s.episode_count, text: `${done}/${s.episode_count} watched`, label: `Season ${ep.season}: ${done} of ${s.episode_count} watched` } : undefined,
    watchable: nextWatchable(item),
  }
}

/** Next 7 days list: the day column ("Today", "Tomorrow", "Wed 26"). */
export function weekDay(u: Upcoming): string {
  if (u.daysUntil === 0) return 'Today'
  if (u.daysUntil === 1) return 'Tomorrow'
  return `${weekday(u.date)} ${Number(u.date.slice(8, 10))}`
}

/** Continue list rows: a number on the right (episode, hours) and a short line under it. */
export function continueStat(item: UserItem): { num?: string; sub?: string } {
  if (item.title.mediaType === 'game') {
    const played = item.steamPlaytimeMinutes ? hours(item.steamPlaytimeMinutes / 60) : undefined
    const beat = hoursToBeat(item)
    return { num: played, sub: beat ? `~${hours(beat)} to beat` : played ? 'played' : undefined }
  }
  if (item.title.mediaType === 'tv') {
    const n = upNext(item)
    return { num: n.value, sub: n.note }
  }
  return {}
}
