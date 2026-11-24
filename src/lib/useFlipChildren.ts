import { useLayoutEffect } from 'react'

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'

/**
 * When a child of `box` comes or goes (a Home row emptying, or coming back on Undo), the children that stay slide from
 * where they were to where they are now, and one that's added fades in. Positions are read relative to the container
 * (give it `relative`), so scrolling between changes doesn't throw them off. Nothing moves with reduced motion.
 * Takes the element itself (from a callback ref), so it starts watching whenever the container mounts.
 */
export function useFlipChildren(box: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!box) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    const at = (el: HTMLElement) => ({ x: el.offsetLeft, y: el.offsetTop })
    let last = new Map<Element, { x: number; y: number }>()
    const measure = () => {
      last = new Map([...box.children].map((el) => [el, at(el as HTMLElement)]))
    }
    measure()

    const mo = new MutationObserver((records) => {
      const added = new Set(records.flatMap((r) => [...r.addedNodes]))
      if (!reduce.matches) {
        for (const el of box.children) {
          const was = last.get(el)
          if (added.has(el) || !was) {
            el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: EASE })
            continue
          }
          const now = at(el as HTMLElement)
          const dx = was.x - now.x
          const dy = was.y - now.y
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 280, easing: EASE })
          }
        }
      }
      measure()
    })
    mo.observe(box, { childList: true })
    // A window resize moves things without a change of children: just take the new positions.
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => {
      mo.disconnect()
      ro.disconnect()
    }
  }, [box])
}
