import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import clsx from 'clsx'
import { useSlidingIndicator } from '../lib/useSlidingIndicator'
import type { Priority } from '../types'

type Level = Priority | 'none'

const LEVELS: { value: Level; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

/** Three rising bars, `level` of them filled: the order reads at a glance, like a signal-strength mark. */
function Bars({ level }: { level: number }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3 flex-none">
      {[4, 7, 10].map((h, i) => (
        <rect key={h} x={1 + i * 4} y={11 - h} width="2.5" height={h} rx="0.75" fill="currentColor" opacity={i < level ? 1 : 0.28} />
      ))}
    </svg>
  )
}

/**
 * Priority as a four-notch scale. Tap a level, or press and drag along the row: the highlight follows the
 * finger notch by notch and the level is saved on release. Arrow keys step through levels. A drag that turns
 * into a vertical scroll is cancelled and nothing changes.
 */
export function PriorityScale({ value, onChange }: { value: Level; onChange: (v: Level) => void }) {
  const [preview, setPreview] = useState<Level | null>(null)
  const shown = preview ?? value
  const group = useSlidingIndicator<HTMLDivElement>(shown)
  const el = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const handled = useRef(false)

  // Stable, so React doesn't detach and re-attach it (and re-measure) on every render.
  const setRefs = useCallback(
    (n: HTMLDivElement | null) => {
      el.current = n
      group(n)
    },
    [group],
  )

  // Nearest level to a pointer x: the option whose centre is closest.
  const levelAt = (clientX: number): Level => {
    const buttons = [...(el.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])]
    let best = 0
    let dist = Infinity
    buttons.forEach((b, i) => {
      const r = b.getBoundingClientRect()
      const d = Math.abs(clientX - (r.left + r.width / 2))
      if (d < dist) {
        dist = d
        best = i
      }
    })
    return LEVELS[best].value
  }

  const step = (to: Level) => {
    setPreview((p) => {
      if ((p ?? value) !== to && 'vibrate' in navigator) navigator.vibrate?.(4)
      return to
    })
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    handled.current = false
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.moved) {
      const dx = Math.abs(e.clientX - d.x)
      const dy = Math.abs(e.clientY - d.y)
      if (dx < 6 && dy < 6) return
      // Mostly vertical: a scroll, not a drag.
      if (dy > dx) {
        drag.current = null
        return
      }
      d.moved = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    step(levelAt(e.clientX))
  }
  const finish = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    // A plain tap is left to the button's click; a drag commits here and swallows that click.
    if (!d.moved) return
    handled.current = true
    const to = levelAt(e.clientX)
    setPreview(null)
    if (commit && to !== value) onChange(to)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = LEVELS.findIndex((l) => l.value === value)
    const to = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? LEVELS.length - 1 : -2
    if (to === -2) return
    e.preventDefault()
    const next = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, to))].value
    if (next !== value) onChange(next)
    el.current?.querySelectorAll<HTMLElement>('[role="radio"]')[LEVELS.findIndex((l) => l.value === next)]?.focus()
  }

  return (
    // Narrow cards (phones): full width, bars above each label. From 24rem: one compact row.
    <div className="@container/prio space-y-1.5">
      <p className="text-xs font-medium text-muted">Priority</p>
      <div
        ref={setRefs}
        role="radiogroup"
        aria-label="Priority"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, true)}
        onPointerCancel={(e) => {
          finish(e, false)
          setPreview(null)
        }}
        onKeyDown={onKeyDown}
        className="relative grid w-full touch-pan-y grid-flow-col auto-cols-fr gap-1 rounded-lg border border-line bg-bg p-1 select-none @[24rem]/prio:w-fit"
      >
        <span aria-hidden="true" className="slide-ind rounded-md bg-raised shadow-[inset_0_0_0_1px_var(--color-line)]" />
        {LEVELS.map((l, i) => {
          const on = shown === l.value
          return (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={on}
              // Roving focus: Tab lands on the chosen level, arrows move between levels.
              tabIndex={l.value === value ? 0 : -1}
              onClick={() => {
                if (handled.current) {
                  handled.current = false
                  return
                }
                if (l.value !== value) onChange(l.value)
              }}
              className={clsx(
                'relative flex flex-col items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-sm leading-tight transition-colors @[24rem]/prio:flex-row @[24rem]/prio:gap-1.5 @[24rem]/prio:px-2.5',
                on ? 'font-medium text-fg' : 'text-muted hover:text-fg',
              )}
            >
              <Bars level={i} />
              {l.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
