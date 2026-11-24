// Poster chip display mode, one global setting, switched by the toolbar's Labels button: "show" (default) or
// "hide". "hover" (revealed on hover / keyboard focus) is from the old three-way switch; still honoured if saved.
// Saved to the profile when signed in (profiles.card_chips = { "all": mode }) so it follows the user across
// devices; remembered in this browser when signed out.
import { useState, useSyncExternalStore } from 'react'
import { useAuth } from './auth'
import { useProfile, useUpdateProfile } from './integrations'

export type ChipMode = 'show' | 'hover' | 'hide'

const STORAGE_KEY = 'ondeck.chips'
const isMode = (v: unknown): v is ChipMode => v === 'show' || v === 'hover' || v === 'hide'

function readLocal(): ChipMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isMode(v) ? v : 'show'
  } catch {
    return 'show'
  }
}

// Signed out: a tiny store over localStorage, so every poster updates the moment the setting changes
// (reading localStorage once per render left already-drawn posters on the old setting until a reload).
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function writeLocal(mode: ChipMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // storage unavailable — the choice just won't persist
  }
  listeners.forEach((fn) => fn())
}

/** Current chip mode (read-only), for posters. */
export function useChipMode(): ChipMode {
  const { user } = useAuth()
  const profile = useProfile()
  const local = useSyncExternalStore(subscribe, readLocal, readLocal)
  if (!user) return local
  const saved = (profile.data?.card_chips as Record<string, unknown> | undefined)?.all
  return isMode(saved) ? saved : 'show'
}

/** Current mode plus a setter — for the toolbar's Display control. */
export function useChipModeControl(): [ChipMode, (mode: ChipMode) => void] {
  const { user } = useAuth()
  const current = useChipMode()
  const update = useUpdateProfile()
  const [pending, setPending] = useState<ChipMode | null>(null)
  const mode = pending ?? current

  const set = (next: ChipMode) => {
    if (!user) {
      writeLocal(next)
      return
    }
    setPending(next) // instant feedback; cleared once the profile reloads with it
    update({ card_chips: next === 'show' ? {} : { all: next } })
      .catch(() => undefined)
      .finally(() => setPending(null))
  }
  return [mode, set]
}

/**
 * Extra classes for chips in a given mode. "hover" reveals them when the poster link (the Tailwind
 * `group`) is hovered or keyboard-focused. Returns null for "hide" (don't render chips at all).
 */
export function chipVisibility(mode: ChipMode): string | null {
  if (mode === 'hide') return null
  if (mode === 'hover') return 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'
  return ''
}
