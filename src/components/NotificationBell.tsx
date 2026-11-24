import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Bell, CalendarClock, CalendarDays, CalendarPlus, PercentCircle, PlayCircle, Tag } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMarkRead, useNotifications, type Notification } from '../lib/notifications'

const ICON: Record<string, LucideIcon> = {
  release_day: CalendarDays,
  week_before: CalendarClock,
  date_changed: CalendarClock,
  announced: CalendarPlus,
  available: PlayCircle,
  price_low: Tag,
  price_deal: PercentCircle,
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Row({ n, onOpen }: { n: Notification; onOpen: () => void }) {
  const Icon = ICON[n.kind] ?? Bell
  const body = (
    <>
      <Icon className={clsx('mt-0.5 size-4 shrink-0', n.readAt ? 'text-faint' : 'text-accent-ink')} />
      <span className="min-w-0 flex-1">
        <span className={clsx('block text-sm', n.readAt ? 'text-muted' : 'text-fg')}>{n.message}</span>
        <span className="mt-0.5 block font-mono text-[11px] text-faint">{ago(n.createdAt)}</span>
      </span>
      {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
    </>
  )
  const cls = 'flex items-start gap-3 px-4 py-3 hover:bg-raised/60'
  return (
    <li>
      {n.titleId ? (
        <Link to={`/title/${n.titleId}`} onClick={onOpen} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onOpen} className={clsx(cls, 'w-full text-left')}>
          {body}
        </button>
      )}
    </li>
  )
}

/** Top-bar bell: unread count + inbox of release, availability and price alerts. */
export function NotificationBell() {
  const { data: list = [] } = useNotifications()
  const markRead = useMarkRead()
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const unread = list.filter((n) => !n.readAt).length

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative grid size-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-fg"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[10px] leading-4 font-semibold text-accent-fg">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="pop-in origin-top-right absolute right-0 top-11 z-40 max-sm:origin-top w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl shadow-black/40 max-sm:fixed max-sm:inset-x-3 max-sm:top-14 max-sm:w-auto">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold text-fg">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => markRead.mutate(undefined)} className="text-xs text-muted hover:text-fg">
                Mark all read
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              Nothing yet. You’ll hear here when something in your library comes out, gets a date, lands on your
              services, or a game you want goes on a big sale.
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto overscroll-contain">
              {list.map((n) => (
                <Row
                  key={n.id}
                  n={n}
                  onOpen={() => {
                    if (!n.readAt) markRead.mutate([n.id])
                    setOpen(false)
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
