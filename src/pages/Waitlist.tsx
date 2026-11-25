import { addTransitionType, startTransition, useMemo, useState, ViewTransition } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
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
import { useSlidingIndicator } from '../lib/useSlidingIndicator'

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
  const group = useSlidingIndicator<HTMLDivElement>(value)
  return (
    <div ref={group} role="radiogroup" aria-label={label} className="relative flex rounded-md border border-line bg-surface p-0.5">
      <span aria-hidden="true" className="slide-ind rounded-md bg-raised" />
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
              'hit relative flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
              active ? 'text-fg' : 'text-muted hover:text-fg',
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

/** One row: date, cover, title, what's coming, countdown. */
function EntryRow({ entry }: { entry: WaitlistEntry }) {
  const { item, event } = entry
  const cd = countdown(entry)
  const soon = entry.daysUntil != null && entry.daysUntil <= 7
  const label = eventLabel(event)
  return (
    <li>
      <Link to={`/title/${item.title.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-raised">
        <span className="hidden w-24 flex-none whitespace-nowrap text-xs text-muted tabular-nums sm:block">{whenLabel(entry)}</span>
        <Thumb entry={entry} className="h-[42px] w-7 border-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{item.title.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            <span className="tabular-nums sm:hidden">{whenLabel(entry)}, </span>
            <span className={clsx(/^S\d+E\d+$/.test(label) && 'font-mono')}>{label}</span>
          </p>
        </div>
        {cd && <span className={clsx('flex-none text-xs', soon ? 'font-medium text-accent-ink' : 'text-muted')}>{cd}</span>}
      </Link>
    </li>
  )
}

function EntryList({ entries }: { entries: WaitlistEntry[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {entries.map((e) => (
        <EntryRow key={`${e.item.id}:${e.event.kind}`} entry={e} />
      ))}
    </ul>
  )
}

function ListView({ entries }: { entries: WaitlistEntry[] }) {
  const groups = groupEntries(entries)
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h2 className="flex items-baseline gap-2 text-sm font-semibold tracking-tight text-fg">
            {g.label}
            <span className="font-mono text-xs font-normal text-faint">{g.entries.length}</span>
          </h2>
          <EntryList entries={g.entries} />
        </section>
      ))}
    </div>
  )
}

// ─── Calendar ──────────────────────────────────────────────────────────────

const MONTH_IN = { 'month-next': 'month-in-next', 'month-prev': 'month-in-prev', default: 'none' }
const MONTH_OUT = { 'month-next': 'month-out-next', 'month-prev': 'month-out-prev', default: 'none' }

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
  // Month arrows slide the grid in the direction you went.
  const go = (ym: string) => {
    if (ym === month) return
    startTransition(() => {
      addTransitionType(ym > month ? 'month-next' : 'month-prev')
      setMonth(ym)
    })
  }
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
              onClick={() => go(today.slice(0, 7))}
              className="hit mr-1 h-9 rounded-md border border-line px-3 text-xs sm:h-8 text-fg hover:border-accent"
            >
              Today
            </button>
          )}
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => go(shiftMonth(month, -1))}
            className="hit flex size-9 items-center justify-center rounded-md border border-line text-fg hover:border-accent sm:size-8"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => go(shiftMonth(month, 1))}
            className="hit flex size-9 items-center justify-center rounded-md border border-line text-fg hover:border-accent sm:size-8"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <ViewTransition key={month} enter={MONTH_IN} exit={MONTH_OUT} default="none">
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
            if (!iso) return <div key={`x${i}`} className="min-h-12 bg-bg sm:min-h-20 lg:min-h-28" />
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
                  'no-press flex min-h-12 flex-col items-stretch gap-1 p-1 text-left transition-colors sm:min-h-20 sm:p-1.5 lg:min-h-28',
                  // Past days: the blank cells' quiet fill with faded content. (Fading the whole cell let the grid
                  // lines show through, so they read heavier than the days to come.)
                  isSel ? 'bg-raised ring-1 ring-fg/50 ring-inset' : iso < today ? 'bg-bg hover:bg-raised/60' : 'bg-surface hover:bg-raised/60',
                  iso < today && '[&>*]:opacity-50',
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
                  {list.slice(0, 2).map((e) => (
                    <span
                      key={`${e.item.id}:${e.event.kind}`}
                      className="flex items-center gap-1 truncate rounded bg-raised px-1 py-0.5 text-[11px] text-fg"
                      title={`${e.item.title.title}, ${eventLabel(e.event)}`}
                    >
                      <Thumb entry={e} className="h-5 w-3.5 rounded-sm border-0" />
                      <span className="truncate">{e.item.title.title}</span>
                    </span>
                  ))}
                  {list.length > 2 && <span className="px-1 text-[11px] text-muted">+{list.length - 2} more</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      </ViewTransition>

      {day && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">
            {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          {dayEntries.length === 0 ? (
            <p className="text-sm text-muted">Nothing out this day.</p>
          ) : (
            <EntryList entries={dayEntries} />
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
  usePageTitle('Calendar')
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
    // The list reads best narrow; the month grid gets the room it needs for titles in each day. The header and
    // controls keep the list's width in both views, so switching views never moves them (only the grid is wider).
    <div className="max-w-7xl">
      <div className="max-w-4xl">
      <PageHeader title="Calendar" meta={isLoading ? undefined : `${entries.length} upcoming`}>
        <button
          type="button"
          onClick={() => setShowFeed((s) => !s)}
          aria-expanded={showFeed}
          className={clsx(
            'flex h-11 items-center gap-2 rounded-md border px-4 text-sm sm:h-9',
            showFeed ? 'border-accent text-fg' : 'border-line text-fg hover:border-accent',
          )}
        >
          <CalendarPlus className="size-4" />
          Add to your calendar
        </button>
      </PageHeader>

      {showFeed && (
        <div className="mb-6 rounded-lg border border-line bg-surface p-4">
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
      </div>

      {isLoading ? null : view === 'month' ? (
        <CalendarView entries={entries} month={month} setMonth={(ym) => set('month', ym === todayIso().slice(0, 7) ? null : ym)} />
      ) : entries.length === 0 ? (
        <div className="max-w-4xl rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Nothing upcoming{type ? ' of this type' : ''}. Add an unreleased movie, show or game, or a show that’s
          airing or has a new season announced, and it’ll show up here with its date.
        </div>
      ) : (
        <div className="max-w-4xl">
          <ListView entries={entries} />
        </div>
      )}
    </div>
  )
}
