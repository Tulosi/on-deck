import { useSyncExternalStore } from 'react'

/**
 * Whether the sample-library card is up on Home. While it is, the card carries the Sign in call, so the top bar's
 * Sign in goes quiet and Home's footer note steps aside. Closing it lasts for the visit (sessionStorage).
 */
const KEY = 'ondeck.sampleWelcomeClosed'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== '1'
  } catch {
    return true
  }
}

let open = read()

export function closeSampleCard() {
  open = false
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    // Storage blocked: it comes back on the next load.
  }
  listeners.forEach((l) => l())
}

export function useSampleCardOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => open,
  )
}
