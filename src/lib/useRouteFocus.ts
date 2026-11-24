import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * After moving to a new page, put keyboard and screen-reader focus on its heading, so the next Tab starts on
 * the new page (not back up in the sidebar) and the page's name is read out. Not on Back/Forward (scroll memory
 * puts you back where you were), and not when only the query string changes (filters).
 */
export function useRouteFocus() {
  const { pathname } = useLocation()
  const navType = useNavigationType()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false // first load: leave focus where the browser puts it
      return
    }
    if (navType === 'POP') return
    let frame = 0
    let tries = 0
    const focus = () => {
      const h1 = document.querySelector<HTMLElement>('main h1')
      if (h1) {
        if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1')
        h1.focus({ preventScroll: true })
      } else if (tries++ < 30) frame = requestAnimationFrame(focus) // lazy page still loading
    }
    frame = requestAnimationFrame(focus)
    return () => cancelAnimationFrame(frame)
  }, [pathname, navType])
}
