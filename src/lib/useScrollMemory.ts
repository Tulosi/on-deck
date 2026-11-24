import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/** Scroll position per history entry, for this tab's session. */
const positions = new Map<string, number>()

/**
 * Back/Forward put you where you were (e.g. halfway down a long Library), and a new page starts at the top.
 * Done by hand because BrowserRouter has no ScrollRestoration, and the browser's own restore runs before the
 * page has rendered its posters. Waits up to a second for the page to grow tall enough.
 */
export function useScrollMemory() {
  const location = useLocation()
  const navType = useNavigationType()
  const prevPath = useRef(location.pathname)

  useEffect(() => {
    history.scrollRestoration = 'manual'
  }, [])

  // Remember where the current entry is scrolled to, once scrolling settles. Waiting matters: as the page swaps,
  // the browser nudges the scroll position for the new layout, and that nudge mustn't be saved as the old page's.
  const currentKey = useRef(location.key)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const save = () => {
      clearTimeout(timer)
      timer = setTimeout(() => positions.set(currentKey.current, window.scrollY), 150)
    }
    window.addEventListener('scroll', save, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', save)
    }
  }, [])

  useLayoutEffect(() => {
    currentKey.current = location.key
    const samePage = prevPath.current === location.pathname
    prevPath.current = location.pathname
    if (navType === 'POP') {
      const y = positions.get(location.key)
      if (y == null) return
      let frame = 0
      const started = performance.now()
      const tryScroll = () => {
        const room = document.documentElement.scrollHeight - window.innerHeight
        if (room >= y || performance.now() - started > 1000) window.scrollTo(0, Math.min(y, room))
        else frame = requestAnimationFrame(tryScroll)
      }
      tryScroll()
      return () => cancelAnimationFrame(frame)
    }
    // A new page starts at the top; changing filters on the same page (query string only) doesn't jump.
    if (!samePage && !location.hash) window.scrollTo(0, 0)
  }, [location.key, location.pathname, location.hash, navType])
}
