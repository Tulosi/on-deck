import { useCallback, useEffect, useRef } from 'react'
import { springCurve, type Spring } from './spring'

/**
 * Horizontal swipe, without an animation library. Behaves like Motion's `drag="x"`:
 * - follows the finger 1:1, after a 10 px direction lock so vertical scrolling still works (`touch-action: pan-y`);
 * - past an allowed edge it moves at half speed (Motion's default `dragElastic: 0.5`);
 * - on release it settles with a spring that starts at the finger's speed;
 * - it can be caught mid-settle and carries on from where it is.
 * On top of that, a swipe "commits" past `threshold` of the width, or on a quick flick, in an allowed direction.
 *
 * Writes `transform` straight to the element (no React render per frame) and sets `--swipe` (−1…1, the share
 * of the commit distance) and `data-swiping` (while the finger is down) on its parent, so a background behind it
 * can follow the finger and fade out as it settles.
 */
export interface SwipeOptions {
  /** Directions that can commit. The other direction rubber-bands. */
  dir: 'left' | 'right' | 'both'
  /** Share of the element's width that commits on release. */
  threshold?: number
  /** Release speed (px/ms) in an allowed direction that commits even when short. */
  flick?: number
  /** What the element does after committing: spring back into place, or fly off the way it was thrown. */
  after: 'return' | 'away'
  onCommit: (dir: -1 | 1) => void
  disabled?: boolean
}

/** Fitted to Motion's drag release (`dragSnapToOrigin`): every sampled frame within a few px (see docs/DESIGN-PLAN.md, stage 10). */
export const SWIPE_SPRING: Spring = { stiffness: 200, damping: 40, mass: 1 }
const ELASTIC = 0.5
const LOCK = 10

export function useSwipe<T extends HTMLElement>(opts: SwipeOptions) {
  const ref = useRef<T | null>(null)
  const o = useRef(opts)
  useEffect(() => {
    o.current = opts
  })

  const setRef = useCallback((el: T | null) => {
    ref.current = el
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.touchAction = 'pan-y'

    let x = 0 // current offset
    let start: { px: number; py: number; x: number; id: number } | null = null
    let locked: 'x' | 'y' | null = null
    let samples: { t: number; x: number }[] = []
    let moved = false
    let settling = false

    const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const allowed = (d: number) => {
      const { dir } = o.current
      return dir === 'both' || (dir === 'left' ? d < 0 : d > 0)
    }
    const set = (nx: number) => {
      x = nx
      el.style.transform = nx ? `translateX(${nx}px)` : ''
      const w = el.offsetWidth * (o.current.threshold ?? 0.4) || 1
      el.parentElement?.style.setProperty('--swipe', String(Math.max(-1, Math.min(1, nx / w))))
    }
    const currentX = () => {
      const m = getComputedStyle(el).transform
      if (!m || m === 'none') return 0
      return new DOMMatrixReadOnly(m).m41
    }
    let pending: ((e: TransitionEvent) => void) | null = null
    const stopSettle = () => {
      if (pending) el.removeEventListener('transitionend', pending)
      pending = null
      settling = false
    }
    const animateTo = (target: number, velocity: number, done?: () => void, away = false) => {
      stopSettle()
      const dist = target - x
      // Like Motion: a throw away from where it's going doesn't carry it further first.
      if (Math.sign(velocity) !== Math.sign(dist)) velocity = 0
      if (reduce() || Math.abs(dist) < 0.5) {
        el.style.transition = ''
        set(target)
        done?.()
        return
      }
      // Thrown off: a short ease-out that starts at speed. Settling back: Motion's spring.
      const { easing, ms } = away ? { easing: 'cubic-bezier(0.23, 1, 0.32, 1)', ms: 220 } : springCurve(dist, velocity, SWIPE_SPRING)
      el.style.transition = `transform ${ms}ms ${easing}`
      settling = true
      set(target)
      el.parentElement?.style.setProperty('--swipe', '0')
      // Only this element's own transform finishing counts (children's colour transitions bubble up too).
      pending = (e: TransitionEvent) => {
        if (e.target !== el || e.propertyName !== 'transform') return
        stopSettle()
        el.style.transition = ''
        done?.()
      }
      el.addEventListener('transitionend', pending)
    }
    const velocity = () => {
      // Speed over the last ~80 ms of movement, like Motion's pan velocity.
      const now = performance.now()
      const recent = samples.filter((s) => now - s.t < 80)
      if (recent.length < 2) return 0
      const a = recent[0]
      const b = recent[recent.length - 1]
      return (b.x - a.x) / Math.max(1, b.t - a.t)
    }

    const down = (e: PointerEvent) => {
      // A second finger during a sideways drag is ignored; otherwise a new press starts afresh.
      if (o.current.disabled || (e.pointerType === 'mouse' && e.button !== 0) || (start && locked === 'x')) return
      // Catch it mid-settle: freeze where it is and carry on from there.
      if (settling) {
        const cx = currentX()
        stopSettle()
        el.style.transition = 'none'
        set(cx)
      }
      start = { px: e.clientX, py: e.clientY, x, id: e.pointerId }
      locked = null
      moved = false
      samples = [{ t: performance.now(), x }]
    }
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.px
      const dy = e.clientY - start.py
      if (!locked) {
        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return
        locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
        // Vertical: it's a scroll, not a swipe. Let go now (its release may land on another element).
        if (locked === 'y') {
          start = null
          return
        }
        el.setPointerCapture(e.pointerId)
        // Any transition the element has of its own (a toast's entrance) would make it lag the finger.
        el.style.transition = 'none'
        el.parentElement?.setAttribute('data-swiping', '')
        moved = true
      }
      if (locked !== 'x') return
      e.preventDefault()
      const raw = start.x + dx
      // Past an edge that can't commit: half speed.
      const nx = allowed(raw) || raw === 0 ? raw : raw * ELASTIC
      set(nx)
      samples.push({ t: performance.now(), x: nx })
      if (samples.length > 20) samples.shift()
    }
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const wasX = locked === 'x'
      start = null
      el.parentElement?.removeAttribute('data-swiping')
      if (!wasX) {
        if (x !== 0) animateTo(0, 0)
        return
      }
      const v = velocity()
      const { threshold = 0.4, flick = 0.5, after, onCommit } = o.current
      const w = el.offsetWidth
      const d = x < 0 ? -1 : 1
      const commit = allowed(x) && (Math.abs(x) > w * threshold || (Math.abs(v) > flick && Math.sign(v) === d))
      if (!commit) return animateTo(0, v)
      if (after === 'away') {
        animateTo(d * (w + 32), v, () => onCommit(d), true)
      } else {
        onCommit(d)
        if ('vibrate' in navigator) navigator.vibrate?.(8)
        animateTo(0, v)
      }
    }
    const cancel = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      start = null
      el.parentElement?.removeAttribute('data-swiping')
      animateTo(0, 0)
    }
    // A drag isn't a tap: swallow the click that follows it.
    const click = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault()
        e.stopPropagation()
        moved = false
      }
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    el.addEventListener('click', click, true)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
      el.removeEventListener('click', click, true)
    }
  }, [])

  return setRef
}
