import { useLayoutEffect, useState } from 'react'

/**
 * A highlight that slides between options instead of jumping. Put the returned (callback) ref on the
 * relatively positioned group, and an `<span className="slide-ind …" aria-hidden />` as its first child; the span is
 * placed over whichever child has aria-checked="true". It appears in place on first render and only slides on
 * later changes (see `.slide-ind` in index.css). Works for groups that wrap onto several rows.
 */
export function useSlidingIndicator<T extends HTMLElement>(selected: unknown) {
  // A callback ref, so a group that appears later (conditionally rendered) still gets measured.
  const [el, setEl] = useState<T | null>(null)
  useLayoutEffect(() => {
    if (!el) return
    const place = () => {
      const sel = el.querySelector<HTMLElement>(':scope > [aria-checked="true"]')
      el.style.setProperty('--ind-o', sel ? '1' : '0')
      if (!sel) return
      el.style.setProperty('--ind-x', `${sel.offsetLeft}px`)
      el.style.setProperty('--ind-y', `${sel.offsetTop}px`)
      el.style.setProperty('--ind-w', `${sel.offsetWidth}px`)
      el.style.setProperty('--ind-h', `${sel.offsetHeight}px`)
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    // Turn the slide on only after the first placement has painted.
    const raf = requestAnimationFrame(() => el.setAttribute('data-ind-ready', ''))
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [el, selected])
  return setEl
}
