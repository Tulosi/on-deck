// Waitlist + Calendar data (docs/SPEC.md → Waitlist & calendar). Event rules live in the shared module so the
// .ics feed (supabase/functions/calendar) shows exactly the same thing.
import {
  compareEvents,
  daysBetween,
  eventLabel as sharedEventLabel,
  upcomingEvents,
  type ReleaseEvent,
} from '../../supabase/functions/_shared/releases.ts'
import { episodeCode, todayIso } from './release'
import type { UserItem } from '../types'

/** What's coming, in the app's wording: episode codes ("S02E06") and sentence case. */
export function eventLabel(e: ReleaseEvent): string {
  if (e.kind === 'episode' && e.season != null && e.episode != null) return episodeCode({ season: e.season, episode: e.episode })
  if (e.kind === 'early_access') return 'Early access launch'
  return sharedEventLabel(e)
}

export interface WaitlistEntry {
  item: UserItem
  event: ReleaseEvent
  /** Days until an exact date (0 = today); undefined for fuzzy / TBA dates. */
  daysUntil?: number
}

/**
 * Upcoming events for everything on the deck except Dropped titles, soonest first (exact dates, then
 * fuzzy ones, then TBA): releases, series premieres, new seasons and the next announced episode of shows that
 * are airing. The list and calendar views show the same entries.
 */
export function waitlistEntries(items: UserItem[]): WaitlistEntry[] {
  const today = todayIso()
  const out: WaitlistEntry[] = []
  for (const item of items) {
    if (item.progress === 'dropped') continue
    for (const event of upcomingEvents(item.title, today)) {
      out.push({
        item,
        event,
        daysUntil: event.date && event.precision === 'day' ? daysBetween(today, event.date) : undefined,
      })
    }
  }
  return out.sort((a, b) => compareEvents(a.event, b.event) || a.item.title.title.localeCompare(b.item.title.title))
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opts)

/** "Today", "Tomorrow", "In 12 days", or null when there's no exact date. */
export function countdown(e: WaitlistEntry): string | null {
  if (e.daysUntil == null) return null
  if (e.daysUntil === 0) return 'Today'
  if (e.daysUntil === 1) return 'Tomorrow'
  return `In ${e.daysUntil} days`
}

/** "Fri, Dec 18", "March 2027", "Q2 2027", "TBA". */
export function whenLabel(e: WaitlistEntry): string {
  const { date, precision, fuzzyLabel } = e.event
  if (!date || precision === 'tbd') return 'TBA'
  if (precision !== 'day') return fuzzyLabel ?? fmt(date, { year: 'numeric' })
  const sameYear = date.slice(0, 4) === todayIso().slice(0, 4)
  return fmt(date, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

export interface WaitlistGroup {
  key: string
  label: string
  entries: WaitlistEntry[]
}

/**
 * List sections: "This week", then one per month for exact (and month-precise) dates, then
 * "Date not final" (quarter / year) and "TBA".
 */
export function groupEntries(entries: WaitlistEntry[]): WaitlistGroup[] {
  const groups = new Map<string, WaitlistGroup>()
  const add = (key: string, label: string, e: WaitlistEntry) => {
    if (!groups.has(key)) groups.set(key, { key, label, entries: [] })
    groups.get(key)!.entries.push(e)
  }
  for (const e of entries) {
    const { date, precision } = e.event
    if (!date || precision === 'tbd') add('~tba', 'Date TBA', e)
    else if (precision === 'quarter' || precision === 'year') add('~fuzzy', 'Date not final', e)
    else if (e.daysUntil != null && e.daysUntil <= 7) add('0week', 'Next 7 days', e)
    else add(date.slice(0, 7), fmt(`${date.slice(0, 7)}-01`, { month: 'long', year: 'numeric' }), e)
  }
  return [...groups.values()]
}
