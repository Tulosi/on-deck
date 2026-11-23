// Private calendar feed (iCalendar / .ics) of a user's upcoming releases. No sign-in: the secret token in the
// URL identifies the user (see migration 20261122000000_calendar_feeds.sql).
//   GET [/on-deck-<name>.ics]?token=<64 hex chars>[&only=new|all|movie|tv|game|book] → text/calendar
// The optional file name in the path is only there so calendar apps show a readable name; it's ignored here.
// `only` (default new) picks what's in the feed; see FeedFilter in _shared/releases.ts. One token, so each
// filter is just a different URL — you can subscribe to several.
// Events (all-day): movie / game releases, series premieres, new seasons and the next announced episode,
// for everything on the deck except Dropped titles. Only exact dates. Same rules as the app's Calendar
// (_shared/releases.ts). Recent releases (last 60 days) stay on, so past events don't vanish from the calendar.
import { admin, corsHeaders, serve } from '../_shared/http.ts'
import {
  daysBetween,
  eventLabel,
  FEED_FILTERS,
  inFeed,
  upcomingEvents,
  type FeedFilter,
  type ReleaseEvent,
  type ReleaseInput,
} from '../_shared/releases.ts'

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

const APP_URL = (Deno.env.get('APP_URL') ?? 'https://tulosi.github.io/on-deck').replace(/\/$/, '')
const KEEP_PAST_DAYS = 60
const TYPE_NAME: Record<string, string> = { movie: 'Movie', tv: 'TV show', game: 'Game', book: 'Book' }
/** Readable file names (also used in the subscription URL's path). */
const FEED_FILE: Record<FeedFilter, string> = {
  new: 'on-deck-default.ics',
  all: 'on-deck-everything.ics',
  movie: 'on-deck-movies.ics',
  tv: 'on-deck-tv.ics',
  game: 'on-deck-games.ics',
  book: 'on-deck-books.ics',
}
const FEED_NAME: Record<FeedFilter, string> = {
  new: 'On Deck Calendar · Default',
  all: 'On Deck Calendar · Everything',
  movie: 'On Deck Calendar · Movies',
  tv: 'On Deck Calendar · TV',
  game: 'On Deck Calendar · Games',
  book: 'On Deck Calendar · Books',
}

const notFound = () => new Response('Not found', { status: 404, headers: corsHeaders })

/** iCalendar text escaping (RFC 5545 §3.3.11). */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Fold lines longer than 75 octets (RFC 5545 §3.1), never splitting a UTF-8 character. */
function fold(line: string): string {
  const enc = new TextEncoder()
  const parts: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > (parts.length ? 74 : 75)) {
      parts.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

const ymd = (iso: string) => iso.replaceAll('-', '')
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
  const params = new URL(req.url).searchParams
  const token = params.get('token') ?? ''
  const onlyParam = params.get('only') ?? 'new'
  const only: FeedFilter = (FEED_FILTERS as string[]).includes(onlyParam) ? (onlyParam as FeedFilter) : 'new'
  if (!/^[0-9a-f]{64}$/.test(token)) return notFound()

  const db = admin()
  const { data: feed } = await db.from('calendar_feeds').select('user_id').eq('token', token).maybeSingle()
  if (!feed) return notFound()

  const { data: items, error } = await db
    .from('user_items')
    .select('progress, title:titles(id, title, media_type, release_date, metadata)')
    .eq('user_id', feed.user_id)
  if (error) throw error

  // "Today" a day early, so viewers west of UTC still get today's events.
  const now = new Date()
  const today = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//On Deck//Waitlist//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // Calendar name: NAME (RFC 7986) for newer apps, X-WR-CALNAME for Google / Apple / Outlook.
    fold(`NAME:${esc(FEED_NAME[only])}`),
    fold(`X-WR-CALNAME:${esc(FEED_NAME[only])}`),
    'X-WR-CALDESC:Upcoming releases from your On Deck library',
    'X-WR-TIMEZONE:UTC',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ]

  for (const row of (items ?? []) as unknown as { progress: string; title: Json | null }[]) {
    const t = row.title
    if (!t || row.progress === 'dropped') continue
    const input: ReleaseInput = { mediaType: t.media_type, releaseDate: t.release_date, details: t.metadata }
    const events: ReleaseEvent[] = upcomingEvents(input, today)
    // Recently released (last 60 days) → keep its release / premiere / launch on the calendar.
    const recent = (date: string | null | undefined) =>
      !!date && date < today && daysBetween(date, today) <= KEEP_PAST_DAYS
    const milestones = Array.isArray(t.metadata?.release_milestones) ? (t.metadata.release_milestones as Json[]) : []
    if (t.media_type === 'game' && milestones.length) {
      const hadEarlyAccess = milestones.some((m) => m.kind === 'early_access')
      for (const m of milestones) {
        if (m.precision !== 'day' || !recent(m.date)) continue
        const kind = m.kind === 'early_access' ? 'early_access' : hadEarlyAccess ? 'full_release' : 'release'
        events.push({ kind, date: m.date, precision: 'day' })
      }
    } else if (
      events.every((e) => e.kind !== 'release' && e.kind !== 'premiere') &&
      recent(t.release_date) &&
      (t.metadata?.release_precision ?? 'day') === 'day' &&
      t.media_type !== 'book'
    ) {
      events.push({ kind: t.media_type === 'tv' ? 'premiere' : 'release', date: t.release_date, precision: 'day' })
    }

    for (const e of events) {
      if (!e.date || e.precision !== 'day' || !inFeed(only, t.media_type, e)) continue
      const label = eventLabel(e)
      // Episode events share one UID per show, so the next episode replaces the last instead of piling up.
      const uid = e.kind === 'episode' ? `${t.id}-next-episode@on-deck` : `${t.id}-${e.kind}${e.season ? `-s${e.season}` : ''}@on-deck`
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(e.date)}`,
        `DTEND;VALUE=DATE:${ymd(nextDay(e.date))}`,
        fold(`SUMMARY:${esc(`${t.title} · ${label}`)}`),
        fold(`DESCRIPTION:${esc(`${TYPE_NAME[t.media_type] ?? 'Title'} · ${label}\nOn Deck: ${APP_URL}/title/${t.id}`)}`),
        fold(`URL:${APP_URL}/title/${t.id}`),
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      )
    }
  }
  lines.push('END:VCALENDAR')

  return new Response(req.method === 'HEAD' ? null : lines.join('\r\n') + '\r\n', {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${FEED_FILE[only]}"`,
      'Cache-Control': 'public, max-age=900',
    },
  })
})
