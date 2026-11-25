import { useEffect, useRef } from 'react'

/** True while the user is typing somewhere, so single-key shortcuts leave the keystroke alone. */
export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

/**
 * A single-key shortcut handler (no Cmd, Ctrl or Alt), skipped while typing or while a dialog is open.
 * The handler returns true when it used the key, which stops the browser's own handling.
 */
export function useKeys(handler: (key: string, e: KeyboardEvent) => boolean | void, enabled = true) {
  const fn = useRef(handler)
  fn.current = handler
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented || isTyping(e.target)) return
      if (document.querySelector('[aria-modal="true"]')) return
      if (fn.current(e.key, e)) e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled])
}

/**
 * The number keys' statuses on the title page you're on ("Want to play", "Playing it"…), so the shortcuts sheet can
 * list them. Set by the title page's tracking card while it's on screen; null elsewhere.
 */
let statusKeys: string[] | null = null
export const currentStatusKeys = () => statusKeys
export function useStatusKeys(labels: string[]) {
  const joined = labels.join('\n')
  useEffect(() => {
    statusKeys = joined.split('\n')
    return () => {
      statusKeys = null
    }
  }, [joined])
}
