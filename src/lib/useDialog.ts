import { useEffect, useRef } from 'react'

/**
 * Shared behaviour for sheets and dialogs: Escape closes, focus moves inside on open and returns to whatever
 * opened it on close, and the page behind doesn't scroll. Put the returned ref on the dialog panel.
 */
export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const panel = ref.current
    // Focus the first control, or the panel itself.
    const first = panel?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ;(first ?? panel)?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus?.({ preventScroll: true })
    }
  }, [open])
  return ref
}
