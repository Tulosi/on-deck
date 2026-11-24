import { useEffect, useRef, useState, type PointerEvent } from 'react'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, GripVertical, Minus, Plus } from 'lucide-react'
import { nudge, useNavLayout } from '../lib/navLayout'
import { DEFAULT_TABS, MAX_TABS, NAV_KEYS, navItem, tabsFrom, type NavKey } from './nav'

const iconBtn = 'grid size-8 place-items-center rounded-full text-muted hover:bg-raised hover:text-fg disabled:opacity-30'

/**
 * Settings → Navigation: which pages are phone tabs, and their order (the rest live under More).
 * Rows drag by their handle (mouse or touch, via pointer events) or move with ↑ / ↓.
 */
export function PhoneTabsSettings() {
  const [layout, save] = useNavLayout()
  const saved = tabsFrom(layout.tabs)
  // Local copy while dragging, so the list moves under your finger before it's saved.
  const [tabs, setTabs] = useState<NavKey[]>(saved)
  const [dragging, setDragging] = useState<NavKey | null>(null)
  const rows = useRef(new Map<NavKey, HTMLLIElement>())
  const savedKey = saved.join()
  useEffect(() => {
    if (!dragging) setTabs(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, dragging])

  const commit = (next: NavKey[]) => {
    setTabs(next)
    save('tabs', next)
  }
  const available = NAV_KEYS.filter((k) => !tabs.includes(k))
  const full = tabs.length >= MAX_TABS

  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    const y = e.clientY
    // Swap with whichever row's middle the pointer has passed.
    const i = tabs.indexOf(dragging)
    for (const [key, el] of rows.current) {
      if (key === dragging) continue
      const box = el.getBoundingClientRect()
      const j = tabs.indexOf(key)
      if ((j < i && y < box.top + box.height / 2) || (j > i && y > box.top + box.height / 2)) {
        const next = [...tabs]
        next.splice(i, 1)
        next.splice(j, 0, dragging)
        setTabs(next)
        return
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">
          Tab bar ({tabs.length} of {MAX_TABS})
        </p>
        <ul className="space-y-1.5" onPointerMove={onMove}>
          {tabs.map((k, i) => {
            const item = navItem(k)
            const Icon = item.icon
            return (
              <li
                key={k}
                ref={(el) => {
                  if (el) rows.current.set(k, el)
                  else rows.current.delete(k)
                }}
                className={clsx(
                  'flex items-center gap-2 rounded-lg border bg-bg py-1 pr-1 pl-1',
                  dragging === k ? 'border-accent shadow-lg' : 'border-line',
                )}
              >
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Drag ${item.label}`}
                  onPointerDown={(e) => {
                    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                    setDragging(k)
                  }}
                  onPointerUp={() => {
                    if (dragging) commit(tabs)
                    setDragging(null)
                  }}
                  onPointerCancel={() => setDragging(null)}
                  className="grid size-8 cursor-grab touch-none place-items-center text-faint"
                >
                  <GripVertical className="size-4" />
                </span>
                <Icon className="size-4 text-muted" strokeWidth={1.75} />
                <span className="flex-1 text-sm text-fg">{item.label}</span>
                <button type="button" className={iconBtn} disabled={i === 0} onClick={() => commit(nudge(tabs, k, -1) as NavKey[])} aria-label={`Move ${item.label} up`}>
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  className={iconBtn}
                  disabled={i === tabs.length - 1}
                  onClick={() => commit(nudge(tabs, k, 1) as NavKey[])}
                  aria-label={`Move ${item.label} down`}
                >
                  <ArrowDown className="size-4" />
                </button>
                <button
                  type="button"
                  className={clsx(iconBtn, 'hover:text-bad')}
                  disabled={tabs.length <= 1}
                  onClick={() => commit(tabs.filter((x) => x !== k))}
                  aria-label={`Move ${item.label} to More`}
                >
                  <Minus className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">Under More</p>
        {available.length === 0 ? (
          <p className="text-xs text-faint">Everything is in the tab bar.</p>
        ) : (
          <ul className="space-y-1.5">
            {available.map((k) => {
              const item = navItem(k)
              const Icon = item.icon
              return (
                <li key={k} className="flex items-center gap-2 rounded-lg border border-dashed border-line py-1 pr-1 pl-3">
                  <Icon className="size-4 text-faint" strokeWidth={1.75} />
                  <span className="flex-1 text-sm text-muted">{item.label}</span>
                  <button
                    type="button"
                    className={iconBtn}
                    disabled={full}
                    onClick={() => commit([...tabs, k])}
                    aria-label={`Add ${item.label} to the tab bar`}
                    title={full ? `The tab bar holds ${MAX_TABS}; remove one first` : undefined}
                  >
                    <Plus className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-xs text-faint">
          More always holds the rest, plus your collections and Settings.
          {full && ` The bar holds ${MAX_TABS} tabs; remove one to add another.`}
        </p>
      </div>

      {tabs.join() !== DEFAULT_TABS.join() && (
        <button type="button" onClick={() => commit(DEFAULT_TABS)} className="text-xs text-muted hover:text-fg">
          Reset to default
        </button>
      )}
    </div>
  )
}
