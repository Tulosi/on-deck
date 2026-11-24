import { useEffect, useRef, useState } from 'react'
import { useDialog } from '../lib/useDialog'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { Archive, Layers, MoreHorizontal, Settings, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { useCollectionList } from '../lib/collections'
import { ordered, useNavLayout } from '../lib/navLayout'
import { NAV_KEYS, navItem, tabsFrom, type NavItem, type NavKey } from './nav'

const hrefOf = (item: NavItem) =>
  item.libraryType !== undefined ? `/library${item.libraryType ? `?type=${item.libraryType}` : ''}` : item.to!

function useIsActive() {
  const { pathname, search } = useLocation()
  const type = new URLSearchParams(search).get('type')
  return (item: NavItem) => {
    if (item.libraryType !== undefined) return pathname === '/library' && (type ?? null) === item.libraryType
    return item.to === '/' ? pathname === '/' : pathname.startsWith(item.to!)
  }
}

/** Sheet above the tab bar: everything not in the bar, your collections, and Settings. */
function MoreSheet({ keys, onClose }: { keys: NavKey[]; onClose: () => void }) {
  const panel = useDialog<HTMLDivElement>(true, onClose)
  const isActive = useIsActive()
  const { pathname } = useLocation()
  const [layout] = useNavLayout()
  const { list: collections } = useCollectionList()
  const colOrder = ordered(collections.map((c) => c.id), layout.collections)
  const byId = new Map(collections.map((c) => [c.id, c]))
  const row = 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm'

  return createPortal(
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="More">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className="absolute inset-x-0 bottom-0 max-h-[75dvh] outline-none overflow-y-auto rounded-t-2xl border-t border-line bg-surface pb-[calc(env(safe-area-inset-bottom)+4rem)]">
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
          <p className="text-sm font-semibold text-fg">More</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted hover:bg-raised">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-0.5 p-2">
          {keys.map((k) => {
            const item = navItem(k)
            const Icon = item.icon
            const active = isActive(item)
            return (
              <Link key={k} to={hrefOf(item)} onClick={onClose} className={clsx(row, active ? 'bg-raised text-fg' : 'text-muted')}>
                <Icon className={clsx('size-[18px]', active && 'text-accent-ink')} strokeWidth={1.75} /> {item.label}
              </Link>
            )
          })}
        </div>
        {/* Collections, below a divider (as in the sidebar) */}
        <div className="space-y-0.5 border-t border-line p-2">
          <Link to="/collections" onClick={onClose} className={clsx(row, pathname === '/collections' ? 'bg-raised text-fg' : 'text-muted')}>
            <Layers className="size-[18px]" strokeWidth={1.75} /> Collections
          </Link>
          {colOrder.map((id) => {
            const c = byId.get(id)!
            const Icon = c.rules != null ? Sparkles : Layers
            const active = pathname === `/collections/${id}`
            return (
              <Link key={id} to={`/collections/${id}`} onClick={onClose} className={clsx(row, 'pl-8', active ? 'bg-raised text-fg' : 'text-muted')}>
                <Icon className="size-4 shrink-0" strokeWidth={1.75} /> <span className="truncate">{c.name}</span>
              </Link>
            )
          })}
        </div>
        <div className="border-t border-line p-2">
          <Link to="/library?archived=only" onClick={onClose} className={clsx(row, 'text-muted')}>
            <Archive className="size-[18px]" strokeWidth={1.75} /> Archive
          </Link>
        </div>
        <div className="space-y-0.5 border-t border-line p-2">
          <Link to="/settings" onClick={onClose} className={clsx(row, 'text-muted')}>
            <Settings className="size-[18px]" strokeWidth={1.75} /> Settings
          </Link>
          <Link to="/settings#navigation" onClick={onClose} className={clsx(row, 'text-muted')}>
            <SlidersHorizontal className="size-[18px]" strokeWidth={1.75} /> Customize tab bar
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Phone tab bar: your chosen tabs (Settings → Navigation) plus More for everything else. */
export function BottomNav() {
  const isActive = useIsActive()
  const [layout] = useNavLayout()
  const [more, setMore] = useState(false)
  const { pathname, search } = useLocation()
  const tabs = tabsFrom(layout.tabs)
  const rest = NAV_KEYS.filter((k) => !tabs.includes(k) && k !== 'collections')

  // Close the sheet whenever the page changes.
  useEffect(() => setMore(false), [pathname, search])

  // On a title page, keep the tab you came from lit (it isn't a place of its own). Otherwise "More" lights up
  // when you're on a page that isn't one of your tabs.
  const current = tabs.find((k) => isActive(navItem(k))) ?? null
  const origin = useRef<NavKey | null>(current)
  const onTitle = pathname.startsWith('/title/')
  if (!onTitle) origin.current = current
  const litTab = onTitle ? origin.current : current
  const moreActive = more || (!litTab && pathname !== '/login')

  return (
    <>
      {more && <MoreSheet keys={rest} onClose={() => setMore(false)} />}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {tabs.map((k) => {
          const item = navItem(k)
          const Icon = item.icon
          const active = !more && litTab === k
          return (
            <Link
              key={k}
              to={hrefOf(item)}
              aria-current={active ? 'page' : undefined}
              className={clsx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]', active ? 'text-accent-ink' : 'text-muted')}
            >
              <Icon className="size-5" strokeWidth={1.75} />
              {item.short ?? item.label}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className={clsx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]', moreActive ? 'text-accent-ink' : 'text-muted')}
        >
          <MoreHorizontal className="size-5" strokeWidth={1.75} />
          More
        </button>
      </nav>
    </>
  )
}
