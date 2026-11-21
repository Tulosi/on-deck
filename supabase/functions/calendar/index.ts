// Private calendar feed (iCalendar / .ics) of a user's upcoming releases. No sign-in: the secret token in the
// URL identifies the user (see migration 20261122000000_calendar_feeds.sql).
//   GET ?token=<64 hex chars> → text/calendar
// Events (all-day): movie / game releases, series premieres, new seasons and the next announced episode,
// for everything on the deck except Dropped titles. Only exact dates. Same rules as the app's Calendar
// (_shared/releases.ts). Recent releases (last 60 days) stay on, so past events don't vanish from the calendar.
import { admin, corsHeaders, serve } from '../_shared/http.ts'
import { daysBetween, eventLabel, upcomingEvents, type ReleaseEvent, type ReleaseInput } from '../_shared/releases.ts'

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

const APP_URL = (Deno.env.get('APP_URL') ?? 'https://tulosi.github.io/on-deck').replace(/\/$/, '')
const KEEP_PAST_DAYS = 60
const TYPE_NAME: Record<string, string> = { movie: 'Movie', tv: 'TV show', game: 'Game', book: 'Book' }

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
  const token = new URL(req.url).searchParams.get('token') ?? ''
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
    'X-WR-CALNAME:On Deck',
    'X-WR-CALDESC:Upcoming releases from your On Deck waitlist',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ]

  for (const row of (items ?? []) as unknown as { progress: string; title: Json | null }[]) {
    const t = row.title
    if (!t || row.progress === 'dropped') continue
    const input: ReleaseInput = { mediaType: t.media_type, releaseDate: t.release_date, details: t.metadata }
    const events: ReleaseEvent[] = upcomingEvents(input, today)
    // Recently released → keep its release / premiere on the calendar.
    if (
      events.every((e) => e.kind !== 'release' && e.kind !== 'premiere') &&
      t.release_date &&
      t.release_date < today &&
      daysBetween(t.release_date, today) <= KEEP_PAST_DAYS &&
      (t.metadata?.release_precision ?? 'day') === 'day' &&
      t.media_type !== 'book'
    ) {
      events.push({ kind: t.media_type === 'tv' ? 'premiere' : 'release', date: t.release_date, precision: 'day' })
    }

    for (const e of events) {
      if (!e.date || e.precision !== 'day') continue
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
      'Content-Disposition': 'inline; filename="on-deck.ics"',
      'Cache-Control': 'public, max-age=900',
    },
  })
})
