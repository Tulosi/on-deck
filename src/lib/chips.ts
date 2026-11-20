// Poster chip display mode — one global setting, chosen from the toolbar's Display control:
//   "show" (default) · "hover" (revealed on hover / keyboard focus) · "hide".
// Saved to the profile when signed in (profiles.card_chips = { "all": mode }) so it follows the user across
// devices; remembered in this browser when signed out.
import { useState } from 'react'
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

/** Current chip mode (read-only), for posters. */
export function useChipMode(): ChipMode {
  const { user } = useAuth()
  const profile = useProfile()
  if (!user) return readLocal()
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
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // storage unavailable — the choice just won't persist
      }
      setPending(next)
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
