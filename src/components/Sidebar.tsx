import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { Archive, GripVertical, Layers, Settings, Sparkles } from 'lucide-react'
import { useCollectionList } from '../lib/collections'
import { DEFAULT_MAIN, DEFAULT_TYPES, moveTo, nudge, ordered, useNavLayout, type Section } from '../lib/navLayout'
import { primaryNav, type NavItem } from './nav'
import { Wordmark } from './Logo'

const hrefOf = (item: NavItem) =>
  item.libraryType !== undefined ? `/library${item.libraryType ? `?type=${item.libraryType}` : ''}` : item.to!

/** Library shortcuts are active when the Library shows exactly that type (Library = no type). */
function useIsActive() {
  const { pathname, search } = useLocation()
  const params = new URLSearchParams(search)
  const type = params.get('type')
  const inArchive = params.get('archived') === 'only' // Archive has its own link
  return (item: NavItem) => {
    if (item.libraryType !== undefined) return pathname === '/library' && !inArchive && (type ?? null) === item.libraryType
    return item.to === '/' ? pathname === '/' : pathname.startsWith(item.to!)
  }
}

function SideLink({
  to,
  label,
  icon: Icon,
  active,
  indent,
  onKeyDown,
}: {
  to: string
  label: string
  icon: NavItem['icon']
  active: boolean
  indent?: boolean
  onKeyDown?: (e: KeyboardEvent) => void
}) {
  return (
    <Link
      to={to}
      draggable={false}
      onKeyDown={onKeyDown}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'relative flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        active ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg',
        indent && 'pl-6',
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />}
      <Icon className={clsx('size-[18px] shrink-0', active && 'text-accent-ink')} strokeWidth={1.75} />
      <span className="truncate">{label}</span>
    </Link>
  )
}

/**
 * A list whose rows can be dragged to reorder (mouse) or moved with Alt + ↑/↓ (keyboard). Rows only move
 * within their own section, so nothing crosses the divider.
 */
function Reorderable({
  section,
  keys,
  onReorder,
  render,
}: {
  section: Section
  keys: string[]
  onReorder: (order: string[]) => void
  /** `grip` is this row's drag handle; the row places it at the right end of its own line. */
  render: (key: string, keyNav: (e: KeyboardEvent) => void, grip: ReactNode) => ReactNode
}) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ before: string | null } | null>(null)
  const mime = `application/x-ondeck-${section}`

  const keyNav = (key: string) => (e: KeyboardEvent) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const next = nudge(keys, key, e.key === 'ArrowUp' ? -1 : 1)
    if (next !== keys) onReorder(next)
    // Keep focus on the moved link after the re-render.
    const el = e.currentTarget as HTMLElement
    requestAnimationFrame(() => el.focus())
  }

  const over = (key: string) => (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(mime)) return // another section: not a drop target
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const after = e.clientY > box.top + box.height / 2
    const i = keys.indexOf(key)
    setDrop({ before: after ? (keys[i + 1] ?? null) : key })
  }

  return (
    <div
      onDragLeave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDrop(null)
      }}
    >
      {keys.map((key) => (
        <div
          key={key}
          draggable
          onDragStart={(e) => {
            e.stopPropagation() // a type row inside Library must not also drag the Library block
            e.dataTransfer.setData(mime, key)
            e.dataTransfer.effectAllowed = 'move'
            setDragging(key)
          }}
          onDragEnd={() => {
            setDragging(null)
            setDrop(null)
          }}
          onDragOver={over(key)}
          onDrop={(e) => {
            const moved = e.dataTransfer.getData(mime)
            if (!moved || !drop) return
            e.preventDefault()
            const next = moveTo(keys, moved, drop.before === moved ? keys[keys.indexOf(moved) + 1] ?? null : drop.before)
            if (next.join() !== keys.join()) onReorder(next)
            setDrop(null)
          }}
          className={clsx('relative', dragging === key && 'opacity-40')}
        >
          {drop?.before === key && dragging !== key && <span className="absolute inset-x-2 -top-px h-0.5 rounded bg-accent" />}
          {render(
            key,
            keyNav(key),
            <GripVertical
              aria-hidden="true"
              className="mr-1 size-3.5 shrink-0 cursor-grab text-faint opacity-0 transition-opacity group-hover/line:opacity-100"
            />,
          )}
        </div>
      ))}
      {drop && drop.before === null && <span className="mx-2 block h-0.5 rounded bg-accent" />}
    </div>
  )
}

/** One sidebar line: the link, then its drag handle (shown on hover of this line only). */
function Line({ children, grip }: { children: ReactNode; grip: ReactNode }) {
  return (
    <div className="group/line flex items-center">
      {children}
      {grip}
    </div>
  )
}

/** Desktop / tablet sidebar. Hidden below md, where BottomNav takes over. */
export function Sidebar() {
  const isActive = useIsActive()
  const { pathname, search } = useLocation()
  const archiveActive = pathname === '/library' && new URLSearchParams(search).get('archived') === 'only'
  const [layout, save] = useNavLayout()
  const { list: collections } = useCollectionList()

  const byKey = new Map<string, NavItem>([
    ['home', primaryNav.find((i) => i.to === '/')!],
    ['library', primaryNav.find((i) => i.libraryType === null)!],
    ['waitlist', primaryNav.find((i) => i.to === '/calendar')!], // key kept as 'waitlist' so saved orders still work
    ...primaryNav.filter((i) => i.libraryType).map((i) => [i.libraryType!, i] as [string, NavItem]),
  ])
  const main = ordered(DEFAULT_MAIN, layout.main)
  const types = ordered(DEFAULT_TYPES, layout.types)
  const colOrder = ordered(collections.map((c) => c.id), layout.collections)
  const colById = new Map(collections.map((c) => [c.id, c]))

  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex h-14 items-center px-4">
        <NavLink to="/">
          <Wordmark />
        </NavLink>
      </div>
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
        {/* Media categories */}
        <Reorderable
          section="main"
          keys={main}
          onReorder={(o) => save('main', o)}
          render={(key, keyNav, grip) => {
            const item = byKey.get(key)!
            const line = (
              <Line grip={grip}>
                <SideLink to={hrefOf(item)} label={item.label} icon={item.icon} active={isActive(item)} onKeyDown={keyNav} />
              </Line>
            )
            if (key !== 'library') return line
            // Library has its own handle on its own line; its types reorder among themselves underneath, each
            // with a handle in the same right-hand column.
            return (
              <div>
                {line}
                <Reorderable
                  section="types"
                  keys={types}
                  onReorder={(o) => save('types', o)}
                  render={(t, tNav, tGrip) => {
                    const ti = byKey.get(t)!
                    return (
                      <Line grip={tGrip}>
                        <SideLink to={hrefOf(ti)} label={ti.label} icon={ti.icon} active={isActive(ti)} indent onKeyDown={tNav} />
                      </Line>
                    )
                  }}
                />
              </div>
            )
          }}
        />

        {/* Collections, below a divider */}
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex">
            <SideLink to="/collections" label="Collections" icon={Layers} active={pathname === '/collections'} />
          </div>
          {colOrder.length === 0 ? (
            <Link to="/collections" className="block px-3 py-1.5 pl-6 text-xs text-faint hover:text-fg">
              Make a collection
            </Link>
          ) : (
            <Reorderable
              section="collections"
              keys={colOrder}
              onReorder={(o) => save('collections', o)}
              render={(id, cNav, cGrip) => {
                const c = colById.get(id)!
                return (
                  <Line grip={cGrip}>
                  <SideLink
                    to={`/collections/${id}`}
                    label={c.name}
                    icon={c.rules != null ? Sparkles : Layers}
                    active={pathname === `/collections/${id}`}
                    indent
                    onKeyDown={cNav}
                  />
                  </Line>
                )
              }}
            />
          )}
        </div>

        {/* Archive: its own quiet section under Collections */}
        <div className="mt-3 border-t border-line pt-2">
          <Link
            to="/library?archived=only"
            aria-current={archiveActive ? 'page' : undefined}
            className={clsx(
              'flex items-center gap-3 rounded-md px-3 py-1.5 text-xs transition-colors',
              archiveActive ? 'bg-raised text-fg' : 'text-faint hover:bg-raised/60 hover:text-muted',
            )}
          >
            <Archive className="size-4 shrink-0" strokeWidth={1.75} />
            Archive
          </Link>
        </div>
      </nav>
      <div className="border-t border-line px-2 py-2">
        <div className="flex">
          <SideLink to="/settings" label="Settings" icon={Settings} active={pathname.startsWith('/settings')} />
        </div>
        <p className="px-3 pt-1 text-[10px] text-faint">Drag to rearrange · Alt + ↑/↓</p>
      </div>
    </aside>
  )
}
