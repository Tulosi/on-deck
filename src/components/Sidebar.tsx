import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { Settings } from 'lucide-react'
import { primaryNav, type NavItem } from './nav'
import { Wordmark } from './Logo'

function SideLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        clsx(
          'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          isActive ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />}
          <Icon className={clsx('size-[18px]', isActive && 'text-accent-ink')} strokeWidth={1.75} />
          {item.label}
        </>
      )}
    </NavLink>
  )
}

/** Desktop / tablet sidebar. Hidden below md, where BottomNav takes over. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex h-14 items-center px-4">
        <NavLink to="/">
          <Wordmark />
        </NavLink>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {primaryNav.map((item) => (
          <SideLink key={item.to} item={item} />
        ))}
      </nav>
      <div className="border-t border-line px-2 py-2">
        <SideLink item={{ to: '/settings', label: 'Settings', icon: Settings }} />
      </div>
    </aside>
  )
}

/** Phone tab bar. */
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {primaryNav.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]',
                isActive ? 'text-accent-ink' : 'text-muted',
              )
            }
          >
            <Icon className="size-5" strokeWidth={1.75} />
            {item.label.replace(' Shows', '')}
          </NavLink>
        )
      })}
    </nav>
  )
}
