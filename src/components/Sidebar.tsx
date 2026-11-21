import { Link, NavLink, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { Settings } from 'lucide-react'
import { primaryNav, type NavItem } from './nav'
import { Wordmark } from './Logo'

const hrefOf = (item: NavItem) =>
  item.libraryType !== undefined ? `/library${item.libraryType ? `?type=${item.libraryType}` : ''}` : item.to!

/** Library shortcuts are active when the Library shows exactly that type (Library = no type). */
function useIsActive() {
  const { pathname, search } = useLocation()
  const type = new URLSearchParams(search).get('type')
  return (item: NavItem) => {
    if (item.libraryType !== undefined) return pathname === '/library' && (type ?? null) === item.libraryType
    return item.to === '/' ? pathname === '/' : pathname.startsWith(item.to!)
  }
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      to={hrefOf(item)}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        active ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg',
        // Type shortcuts sit indented under Library.
        item.libraryType && 'pl-6',
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />}
      <Icon className={clsx('size-[18px]', active && 'text-accent-ink')} strokeWidth={1.75} />
      {item.label}
    </Link>
  )
}

/** Desktop / tablet sidebar. Hidden below md, where BottomNav takes over. */
export function Sidebar() {
  const isActive = useIsActive()
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex h-14 items-center px-4">
        <NavLink to="/">
          <Wordmark />
        </NavLink>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {primaryNav.map((item) => (
          <SideLink key={item.label} item={item} active={isActive(item)} />
        ))}
      </nav>
      <div className="border-t border-line px-2 py-2">
        <SideLink item={{ to: '/settings', label: 'Settings', icon: Settings }} active={isActive({ to: '/settings', label: 'Settings', icon: Settings })} />
      </div>
    </aside>
  )
}

/**
 * Phone tab bar: Home, Library, Movies, TV, Games and Waitlist. Books (not built yet) and Collections live in
 * the sidebar for now, so the bar keeps six tabs.
 */
export function BottomNav() {
  const isActive = useIsActive()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {primaryNav
        .filter((item) => item.to !== '/collections' && item.libraryType !== 'book')
        .map((item) => {
          const Icon = item.icon
          const active = isActive(item)
          return (
            <Link
              key={item.label}
              to={hrefOf(item)}
              aria-current={active ? 'page' : undefined}
              className={clsx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]', active ? 'text-accent-ink' : 'text-muted')}
            >
              <Icon className="size-5" strokeWidth={1.75} />
              {item.short ?? item.label}
            </Link>
          )
        })}
    </nav>
  )
}
