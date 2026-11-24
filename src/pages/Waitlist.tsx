import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  BookOpen,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Film,
  Gamepad2,
  List,
  Tv,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { CalendarFeed } from '../components/CalendarFeed'
import { useItems } from '../lib/library'
import { todayIso } from '../lib/release'
import { countdown, eventLabel, groupEntries, waitlistEntries, whenLabel, type WaitlistEntry } from '../lib/waitlist'
import type { MediaType } from '../types'
import { TYPES } from '../lib/filters'
import { TypeFilter } from '../components/TypeFilter'

const typeIcon: Record<MediaType, LucideIcon> = { movie: Film, tv: Tv, game: Gamepad2, book: BookOpen }

function Segmented<T extends string | null>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string; icon?: LucideIcon }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-line bg-surface p-0.5">
      {options.map((o) => {
        const Icon = o.icon
        const active = o.value === value
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'hit flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
              active ? 'bg-raised text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Thumb({ entry, className }: { entry: WaitlistEntry; className?: string }) {
  const { title } = entry.item
  const Icon = typeIcon[title.mediaType]
  return (
    <div className={clsx('shrink-0 overflow-hidden rounded border border-line bg-raised', className)}>
      {title.coverUrl ? (
        <img src={title.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-faint">
          <Icon className="size-4" />
        </div>
      )}
    </div>
  )
}

/** One row: cover, title, what's coming, date + countdown. */
function EntryRow({ entry }: { entry: WaitlistEntry }) {
  const { item, event } = entry
  const Icon = typeIcon[item.title.mediaType]
  const cd = countdown(entry)
  const soon = entry.daysUntil != null && entry.daysUntil <= 7
  return (
    <Link
      to={`/title/${item.title.id}`}
      className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2 pr-3 transition-colors hover:border-accent"
    >
      <Thumb entry={entry} className="h-[4.5rem] w-12" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{item.title.title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{eventLabel(event)}</span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-xs text-fg">{whenLabel(entry)}</p>
        {cd && (
          <p
            className={clsx(
              'mt-1 inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold',
              soon ? 'bg-accent text-accent-fg' : 'bg-raised text-muted',
            )}
          >
            {cd}
          </p>
        )}
      </div>
    </Link>
  )
}

function ListView({ entries }: { entries: WaitlistEntry[] }) {
  const groups = groupEntries(entries)
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h2 className="flex items-baseline gap-2 text-sm font-semibold tracking-tight text-fg">
            {g.label}
            <span className="font-mono text-xs font-normal text-faint">{g.entries.length}</span>
          </h2>
          <div className="grid gap-2 lg:grid-cols-2">
            {g.entries.map((e) => (
              <EntryRow key={`${e.item.id}:${e.event.kind}`} entry={e} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// ─── Calendar ──────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function CalendarView({
  entries,
  month,
  setMonth,
}: {
  entries: WaitlistEntry[]
  month: string
  setMonth: (ym: string) => void
}) {
  const today = todayIso()
  const [selected, setSelected] = useState<string | null>(null)
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const daysInMonth = new Date(y, m, 0).getDate()
  const lead = first.getDay() // weeks start on Sunday
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoOf(y, m - 1, i + 1)),
  ]
  while (cells.length % 7) cells.push(null)

  const byDay = useMemo(() => {
    const map = new Map<string, WaitlistEntry[]>()
    for (const e of entries) {
      if (!e.event.date || e.event.precision !== 'day') continue
      if (!map.has(e.event.date)) map.set(e.event.date, [])
      map.get(e.event.date)!.push(e)
    }
    return map
  }, [entries])

  const inMonth = (iso: string | null) => !!iso && iso.startsWith(month)
  // Default selection: today if something's out, else the next day this month with a release.
  const nextBusy = cells.find((c): c is string => !!c && c >= today && (byDay.get(c)?.length ?? 0) > 0)
  const day =
    selected && inMonth(selected)
      ? selected
      : inMonth(today) && byDay.has(today)
        ? today
        : (nextBusy ?? (inMonth(today) ? today : null))
  const dayEntries = day ? (byDay.get(day) ?? []) : []
  const notOnCalendar = entries.filter((e) => !e.event.date || e.event.precision !== 'day').length
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 10, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }),
  ) // Nov 1, 2026 is a Sunday

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-fg">
          {first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-1">
          {!inMonth(today) && (
            <button
              type="button"
              onClick={() => setMonth(today.slice(0, 7))}
              className="mr-1 h-8 rounded-md border border-line px-3 text-xs text-fg hover:border-accent"
            >
              Today
            </button>
          )}
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="flex size-8 items-center justify-center rounded-full border border-line text-fg hover:border-accent"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="flex size-8 items-center justify-center rounded-full border border-line text-fg hover:border-accent"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-7 border-b border-line bg-surface">
          {weekdays.map((w) => (
            <div key={w} className="py-2 text-center text-xs text-muted">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-line">
          {cells.map((iso, i) => {
            if (!iso) return <div key={`x${i}`} className="min-h-14 bg-bg sm:min-h-28" />
            const list = byDay.get(iso) ?? []
            const isToday = iso === today
            const isSel = iso === day
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(iso)}
                aria-label={`${new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}: ${list.length} release${list.length === 1 ? '' : 's'}`}
                aria-pressed={isSel}
                className={clsx(
                  'flex min-h-14 flex-col items-stretch gap-1 bg-surface p-1 text-left transition-colors sm:min-h-28 sm:p-1.5',
                  isSel ? 'bg-raised ring-1 ring-accent ring-inset' : 'hover:bg-raised/60',
                  iso < today && 'opacity-50',
                )}
              >
                <span
                  className={clsx(
                    'flex size-6 items-center justify-center self-start rounded-full font-mono text-xs',
                    isToday ? 'bg-accent font-semibold text-accent-fg' : 'text-muted',
                  )}
                >
                  {Number(iso.slice(8))}
                </span>
                {/* Phone: dots. Larger screens: up to 3 titles. */}
                {list.length > 0 && (
                  <span className="flex flex-wrap gap-0.5 px-0.5 sm:hidden">
                    {list.slice(0, 4).map((e) => (
                      <span key={`${e.item.id}:${e.event.kind}`} className="size-1.5 rounded-full bg-accent-ink" />
                    ))}
                  </span>
                )}
                <span className="hidden flex-col gap-1 sm:flex">
                  {list.slice(0, 3).map((e) => (
                    <span
                      key={`${e.item.id}:${e.event.kind}`}
                      className="flex items-center gap-1 truncate rounded bg-raised px-1 py-0.5 text-[11px] text-fg"
                      title={`${e.item.title.title} — ${eventLabel(e.event)}`}
                    >
                      <Thumb entry={e} className="h-5 w-3.5 rounded-sm border-0" />
                      <span className="truncate">{e.item.title.title}</span>
                    </span>
                  ))}
                  {list.length > 3 && <span className="px-1 text-[11px] text-muted">+{list.length - 3} more</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {day && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">
            {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          {dayEntries.length === 0 ? (
            <p className="text-sm text-muted">Nothing out this day.</p>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {dayEntries.map((e) => (
                <EntryRow key={`${e.item.id}:${e.event.kind}`} entry={e} />
              ))}
            </div>
          )}
        </section>
      )}

      {notOnCalendar > 0 && (
        <p className="text-xs text-faint">
          {notOnCalendar} title{notOnCalendar === 1 ? ' has' : 's have'} no exact date yet, so{' '}
          {notOnCalendar === 1 ? 'it’s' : 'they’re'} only in the list view.
        </p>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function Waitlist() {
  const { items, isLoading } = useItems()
  const [params, setParams] = useSearchParams()
  const [showFeed, setShowFeed] = useState(false)
  // ?view=month (older links used ?view=calendar)
  const view = params.get('view') === 'month' || params.get('view') === 'calendar' ? 'month' : 'list'
  const typeParam = params.get('type')
  const type = (TYPES as string[]).includes(typeParam ?? '') ? (typeParam as MediaType) : null
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : todayIso().slice(0, 7)

  const set = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (value == null) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )

  const entries = waitlistEntries(items).filter(
    (e) => !type || e.item.title.mediaType === type,
  )

  return (
    <div>
      <PageHeader title="Calendar" meta={isLoading ? undefined : `${entries.length} upcoming`}>
        <button
          type="button"
          onClick={() => setShowFeed((s) => !s)}
          aria-expanded={showFeed}
          className={clsx(
            'flex h-9 items-center gap-2 rounded-md border px-4 text-sm',
            showFeed ? 'border-accent text-fg' : 'border-line text-fg hover:border-accent',
          )}
        >
          <CalendarPlus className="size-4" />
          Add to your calendar
        </button>
      </PageHeader>

      {showFeed && (
        <div className="mb-6 rounded-xl border border-line bg-surface p-4">
          <CalendarFeed />
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TypeFilter value={type} onChange={(v) => set('type', v)} />
        </div>
        <Segmented
          label="View"
          value={view}
          options={[
            { value: 'list', label: 'List', icon: List },
            { value: 'month', label: 'Month', icon: CalendarDays },
          ]}
          onChange={(v) => set('view', v === 'list' ? null : 'month')}
        />
      </div>

      {isLoading ? null : view === 'month' ? (
        <CalendarView entries={entries} month={month} setMonth={(ym) => set('month', ym === todayIso().slice(0, 7) ? null : ym)} />
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Nothing upcoming{type ? ' of this type' : ''}. Add an unreleased movie, show or game, or a show that’s
          airing or has a new season announced, and it’ll show up here with its date.
        </div>
      ) : (
        <ListView entries={entries} />
      )}
    </div>
  )
}
