// Scheduled job (every few hours, from .github/workflows/daily.yml). Only callable with the private JOB_SECRET.
//   POST {} → summary of what it did
// 1. Refreshes titles that can still change (upcoming releases, airing / returning shows, Early Access games)
//    by re-running each source's "add" (tmdb / igdb / hardcover). It compares release dates before and after.
// 2. For each user: refreshes availability (Plex + streaming) and game prices, via the same functions the app uses.
// 3. Writes inbox notifications (deduplicated per user by `dedup_key`) and pushes new ones to the user's devices:
//    release_day · week_before · date_changed · announced · available · price_low · price_deal
// Rules: docs/SPEC.md → Notifications. Release rules: _shared/releases.ts; price rules: _shared/prices.ts.
import { admin, HttpError, isJob, json, secret, serve } from '../_shared/http.ts'
import {
  daysBetween,
  eventLabel,
  UNRELEASED_STATUS,
  upcomingEvents,
  type ReleaseEvent,
  type ReleaseInput,
} from '../_shared/releases.ts'
import { cheapest, gamePriceFromRow, type PriceRow } from '../_shared/prices.ts'
import { pushToUser, type PushMessage } from '../_shared/push.ts'

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

const BUDGET_MS = 120_000 // stay well inside the Edge Function time limit; leftovers are picked up next run
const TITLE_SHARE = 0.45 // share of the budget for title refreshes
const TITLE_STALE_MS = 20 * 60 * 60 * 1000
const SOURCE_FN: Record<string, string> = { tmdb: 'tmdb', igdb: 'igdb', hardcover: 'hardcover' }
const LIVE_TV = new Set(['Returning Series', 'In Production', 'Planned', 'Pilot'])
/** "Deep discount" = at least this % off Steam's full price, unless the user set their own (10–90). */
const DEEP_DISCOUNT_PCT = 30
/** A deep-discount alert repeats only for a lower price, or a new sale after this long. */
const DEAL_QUIET_MS = 21 * 24 * 60 * 60 * 1000

interface TitleRow {
  id: string
  media_type: ReleaseInput['mediaType']
  source: string
  source_id: string
  title: string
  release_date: string | null
  metadata: Json
  refreshed_at: string
}

interface ItemRow {
  user_id: string
  title_id: string
  progress: string
  owned: boolean
  notify: boolean
}

interface Alert {
  user_id: string
  title_id: string | null
  kind: string
  message: string
  payload: Json
  dedup_key: string
  read_at?: string
}

const toInput = (t: TitleRow): ReleaseInput => ({ mediaType: t.media_type, releaseDate: t.release_date, details: t.metadata })
const eventKey = (e: ReleaseEvent) => `${e.kind}${e.season != null ? `-s${e.season}` : ''}`

function dayIn(timeZone: string | null | undefined, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

function when(e: ReleaseEvent): string {
  if (!e.date || e.precision === 'tbd') return 'TBA'
  if (e.precision !== 'day') return e.fuzzyLabel ?? e.date.slice(0, 4)
  return new Date(`${e.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** "Out today", "Season 3 premieres today" … */
function todayPhrase(e: ReleaseEvent, mediaType: string): string {
  switch (e.kind) {
    case 'premiere':
      return 'Premieres today'
    case 'season':
      return `Season ${e.season} premieres today`
    case 'early_access':
      return 'Early Access launches today'
    case 'full_release':
      return '1.0 releases today'
    default:
      return mediaType === 'book' ? 'Published today' : 'Out today'
  }
}

async function callFn(fn: string, body: Json, userId?: string): Promise<Json | null> {
  try {
    const res = await fetch(`${secret('SUPABASE_URL')}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-job-secret': secret('JOB_SECRET'),
        ...(userId ? { 'x-job-user': userId } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) console.warn(`${fn} ${res.status}`, JSON.stringify(data).slice(0, 200))
    return res.ok ? data : null
  } catch (err) {
    console.warn(`${fn} failed`, String(err))
    return null
  }
}

function addBody(t: TitleRow): Json | null {
  if (t.source === 'tmdb') return { action: 'add', tmdbId: Number(t.source_id), mediaType: t.media_type }
  if (t.source === 'igdb') return { action: 'add', igdbId: Number(t.source_id) }
  if (t.source === 'hardcover') return { action: 'add', hardcoverId: Number(t.source_id) }
  return null
}

/** Can this title's release dates still change? */
function isLive(t: TitleRow, today: string): boolean {
  const status = typeof t.metadata?.status === 'string' ? t.metadata.status : ''
  if (upcomingEvents(toInput(t), today).length) return true
  if (UNRELEASED_STATUS.has(status)) return true
  if (t.media_type === 'tv' && LIVE_TV.has(status)) return true
  if (t.media_type === 'game' && t.metadata?.early_access === true) return true
  return false
}

async function inChunks<T>(ids: string[], size: number, load: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += size) out.push(...(await load(ids.slice(i, i + size))))
  return out
}

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  if (!isJob(req)) throw new HttpError(401, 'not_allowed')
  const started = Date.now()
  const elapsed = () => Date.now() - started
  const db = admin()
  const utcToday = new Date().toISOString().slice(0, 10)

  // Everything on anyone's list, except Dropped.
  const { data: itemData, error: itemErr } = await db
    .from('user_items')
    .select('user_id, title_id, progress, owned, notify')
    .neq('progress', 'dropped')
  if (itemErr) throw itemErr
  const items = (itemData ?? []) as ItemRow[]
  const titleIds = [...new Set(items.map((i) => i.title_id))]
  const titles = new Map(
    (
      await inChunks(titleIds, 150, async (chunk) => {
        const { data, error } = await db
          .from('titles')
          .select('id, media_type, source, source_id, title, release_date, metadata, refreshed_at')
          .in('id', chunk)
        if (error) throw error
        return (data ?? []) as TitleRow[]
      })
    ).map((t) => [t.id, t]),
  )

  // ── 1. Refresh titles that can still change; note release changes ──
  interface Change {
    kind: 'date_changed' | 'announced'
    event: ReleaseEvent
    before?: ReleaseEvent
  }
  const changes = new Map<string, Change[]>()
  const due = [...titles.values()]
    .filter((t) => SOURCE_FN[t.source] && Date.now() - Date.parse(t.refreshed_at) > TITLE_STALE_MS && isLive(t, utcToday))
    .sort((a, b) => a.refreshed_at.localeCompare(b.refreshed_at))
  let refreshed = 0
  for (const t of due) {
    if (elapsed() > BUDGET_MS * TITLE_SHARE) break
    const body = addBody(t)
    if (!body) continue
    const res = await callFn(SOURCE_FN[t.source], body)
    const fresh = res?.title as TitleRow | undefined
    if (!fresh) continue
    refreshed++
    const before = new Map(upcomingEvents(toInput(t), utcToday).filter((e) => e.kind !== 'episode').map((e) => [eventKey(e), e]))
    const after = upcomingEvents(toInput(fresh), utcToday).filter((e) => e.kind !== 'episode')
    const list: Change[] = []
    for (const e of after) {
      const old = before.get(eventKey(e))
      if (!old) list.push({ kind: 'announced', event: e })
      else if (old.date !== e.date || old.precision !== e.precision) list.push({ kind: 'date_changed', event: e, before: old })
    }
    if (list.length) changes.set(t.id, list)
    titles.set(t.id, fresh)
  }

  // ── 2 + 3. Per user: refresh availability and prices, then write alerts ──
  const users = [...new Set(items.map((i) => i.user_id))]
  const { data: profiles } = await db.from('profiles').select('user_id, timezone, country_code, daily_checked_at, alert_settings').in('user_id', users)
  const profileOf = new Map(((profiles ?? []) as Json[]).map((p) => [p.user_id as string, p]))
  let alertsWritten = 0
  let pushesSent = 0
  let usersDone = 0

  for (const userId of users) {
    if (elapsed() > BUDGET_MS) break
    const profile = profileOf.get(userId) ?? {}
    const firstRun = !profile.daily_checked_at
    const since = profile.daily_checked_at as string | undefined
    const today = dayIn(profile.timezone)
    const mine = items.filter((i) => i.user_id === userId && i.notify)
    const alerts: Alert[] = []

    // Keep availability and prices fresh (the app does this too, when it's open).
    for (let i = 0; i < 3 && elapsed() < BUDGET_MS; i++) {
      const r = await callFn('availability', { action: 'refresh' }, userId)
      if (!r || !r.remaining) break
    }
    for (let i = 0; i < 3 && elapsed() < BUDGET_MS; i++) {
      const r = await callFn('prices', { action: 'refresh' }, userId)
      if (!r || !r.remaining) break
    }

    // Releases: changes found above, plus one-week and release-day reminders.
    for (const item of mine) {
      const t = titles.get(item.title_id)
      if (!t) continue
      for (const c of changes.get(t.id) ?? []) {
        const label = eventLabel(c.event)
        const k = eventKey(c.event)
        if (c.kind === 'announced') {
          alerts.push({
            user_id: userId,
            title_id: t.id,
            kind: 'announced',
            message: `${t.title}: ${label} announced — ${when(c.event)}`,
            payload: { event: c.event },
            dedup_key: `new:${t.id}:${k}`,
          })
        } else {
          const from = c.before ? when(c.before) : 'TBA'
          alerts.push({
            user_id: userId,
            title_id: t.id,
            kind: 'date_changed',
            message:
              from === 'TBA' ? `${t.title}: ${label} date set — ${when(c.event)}` : `${t.title}: ${label} moved from ${from} to ${when(c.event)}`,
            payload: { event: c.event, before: c.before ?? null },
            dedup_key: `moved:${t.id}:${k}:${c.event.date ?? 'tba'}:${c.event.precision}`,
          })
        }
      }
      for (const e of upcomingEvents(toInput(t), today)) {
        if (e.kind === 'episode' || !e.date || e.precision !== 'day') continue
        const days = daysBetween(today, e.date)
        if (days === 0) {
          alerts.push({
            user_id: userId,
            title_id: t.id,
            kind: 'release_day',
            message: `${todayPhrase(e, t.media_type)}: ${t.title}`,
            payload: { event: e },
            dedup_key: `out:${t.id}:${eventKey(e)}:${e.date}`,
          })
        } else if (days === 7) {
          alerts.push({
            user_id: userId,
            title_id: t.id,
            kind: 'week_before',
            message: `${t.title}: ${eventLabel(e)} in one week (${when(e)})`,
            payload: { event: e },
            dedup_key: `week:${t.id}:${eventKey(e)}:${e.date}`,
          })
        }
      }
    }

    // Newly available movies / shows you still want to watch.
    const wantScreen = mine.filter(
      (i) => (i.progress === 'wanted' || i.progress === 'in_progress') && ['movie', 'tv'].includes(titles.get(i.title_id)?.media_type ?? ''),
    )
    if (wantScreen.length) {
      const { data: avail } = await db
        .from('user_availability')
        .select('title_id, plex_status, streaming, became_available_at')
        .eq('user_id', userId)
        .eq('available', true)
        .in('title_id', wantScreen.map((i) => i.title_id))
      for (const a of (avail ?? []) as Json[]) {
        if (!a.became_available_at || (since && a.became_available_at <= since)) continue
        const t = titles.get(a.title_id)
        if (!t) continue
        const where =
          a.plex_status === 'available' || a.plex_status === 'partial'
            ? 'on Plex'
            : (a.streaming as string[]).length
              ? `on ${(a.streaming as string[]).slice(0, 2).join(' and ')}`
              : ''
        alerts.push({
          user_id: userId,
          title_id: t.id,
          kind: 'available',
          message: where ? `Now available ${where}: ${t.title}` : `Now available: ${t.title}`,
          payload: { plex: a.plex_status, streaming: a.streaming },
          dedup_key: `avail:${t.id}:${a.became_available_at}`,
        })
      }
    }

    // Games you want: lowest-ever price, and deep discounts (each can be switched off in Settings).
    const settings = (profile.alert_settings ?? {}) as {
      price_low?: boolean
      deep_discount?: boolean
      deep_discount_pct?: number
    }
    const dealPct =
      typeof settings.deep_discount_pct === 'number' && settings.deep_discount_pct >= 10 && settings.deep_discount_pct <= 90
        ? settings.deep_discount_pct
        : DEEP_DISCOUNT_PCT
    const wantLows = settings.price_low !== false
    const wantDeals = settings.deep_discount !== false
    const wantGames = mine.filter(
      (i) => !i.owned && (i.progress === 'wanted' || i.progress === 'in_progress') && titles.get(i.title_id)?.media_type === 'game',
    )
    if (wantGames.length && (wantLows || wantDeals)) {
      const { data: prices } = await db
        .from('game_prices')
        .select('*')
        .eq('country_code', String(profile.country_code ?? 'US').toUpperCase())
        .in('title_id', wantGames.map((i) => i.title_id))
      // Earlier deep-discount alerts, to alert once per sale.
      const { data: pastDeals } = wantDeals
        ? await db
            .from('notifications')
            .select('title_id, payload, created_at')
            .eq('user_id', userId)
            .eq('kind', 'price_deal')
            .order('created_at', { ascending: false })
            .limit(500)
        : { data: [] }
      const lastDeal = new Map<string, { price: number; at: number }>()
      for (const d of (pastDeals ?? []) as Json[]) {
        if (!lastDeal.has(d.title_id)) lastDeal.set(d.title_id, { price: Number(d.payload?.price), at: Date.parse(d.created_at) })
      }
      // The first time deep discounts run for a user, sales already on are recorded silently.
      const firstDeals = wantDeals && (pastDeals ?? []).length === 0

      for (const row of (prices ?? []) as PriceRow[]) {
        const p = gamePriceFromRow(row)
        const best = p.isFree ? null : cheapest(p)
        const t = titles.get(row.title_id)
        if (!best || !t) continue
        const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency || 'USD' }).format(best.price)
        const where = best.kind === 'steam' ? 'Steam' : best.kind === 'keyshop' ? 'key shops' : best.shop
        const off = best.discountPct ? ` (-${best.discountPct}%)` : ''
        const payload = { price: best.price, currency: p.currency, kind: best.kind, url: best.url, discountPct: best.discountPct }
        if (wantLows && best.atLow) {
          alerts.push({
            user_id: userId,
            title_id: t.id,
            kind: 'price_low',
            message: `Lowest price ever: ${t.title} — ${amount} on ${where}${off}`,
            payload,
            dedup_key: `low:${t.id}:${best.price}`,
          })
          continue // a lowest-ever alert covers the discount too
        }
        if (wantDeals && (best.discountPct ?? 0) >= dealPct) {
          const last = lastDeal.get(t.id)
          const fresh = !last || best.price < last.price || Date.now() - last.at > DEAL_QUIET_MS
          if (!fresh) continue
          alerts.push({
            user_id: userId,
            title_id: t.id,
            kind: 'price_deal',
            message: `${best.discountPct}% off: ${t.title} — ${amount} on ${where}`,
            payload: firstDeals ? { ...payload, seed: true } : payload,
            dedup_key: `deal:${t.id}:${best.price}:${new Date().toISOString().slice(0, 10)}`,
            ...(firstDeals ? { read_at: new Date().toISOString() } : {}),
          })
        }
      }
    }

    // First run for this user: record availability / price alerts as already seen, so turning this on doesn't
    // flood the inbox with everything that's already true. Releases still notify normally.
    const nowIso = new Date().toISOString()
    for (const a of alerts) {
      if (firstRun && (a.kind === 'available' || a.kind === 'price_low' || a.kind === 'price_deal')) {
        a.read_at = nowIso
        a.payload = { ...a.payload, seed: true }
      }
    }
    if (alerts.length) {
      const { data: inserted, error } = await db
        .from('notifications')
        .upsert(alerts, { onConflict: 'user_id,dedup_key', ignoreDuplicates: true })
        .select('id, title_id, kind, message, read_at')
      if (error) console.error('notify insert', error)
      alertsWritten += inserted?.length ?? 0

      // Push the new (unread) ones to the user's devices: up to 3 individually, then one summary.
      const fresh = ((inserted ?? []) as Json[]).filter((n) => !n.read_at)
      if (fresh.length && elapsed() < BUDGET_MS + 20_000) {
        const messages: PushMessage[] = fresh.slice(0, 3).map((n) => ({
          title: 'On Deck',
          body: n.message,
          url: n.title_id ? `title/${n.title_id}` : '',
          tag: n.id,
        }))
        if (fresh.length > 3) {
          messages.push({ title: 'On Deck', body: `And ${fresh.length - 3} more — open the bell to see them all.`, url: '', tag: 'on-deck-more' })
        }
        const r = await pushToUser(db, userId, messages)
        pushesSent += r.sent
      }
    }
    await db.from('profiles').update({ daily_checked_at: nowIso }).eq('user_id', userId)
    usersDone++
  }

  return json({
    titlesDue: due.length,
    titlesRefreshed: refreshed,
    releaseChanges: [...changes.values()].reduce((n, c) => n + c.length, 0),
    users: users.length,
    usersDone,
    alertsWritten,
    pushesSent,
    seconds: Math.round(elapsed() / 1000),
  })
})
