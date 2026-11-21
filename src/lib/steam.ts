// Steam account link (Steam OpenID — the user signs in on steamcommunity.com) and the ownership check.
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import { functionError, libraryKey } from './library'
import { supabase } from './supabase'

const OPENID = 'https://steamcommunity.com/openid/login'
const ID_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select'

/** Where Steam sends the user back to (the Settings page) — must start with the realm. */
const returnTo = () => `${window.location.origin}${import.meta.env.BASE_URL}settings?steam=callback`

/** Sends the browser to Steam's sign-in page. */
export function startSteamLogin() {
  const p = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo(),
    'openid.realm': `${window.location.origin}${import.meta.env.BASE_URL}`,
    'openid.identity': ID_SELECT,
    'openid.claimed_id': ID_SELECT,
  })
  window.location.assign(`${OPENID}?${p}`)
}

/** The openid.* parameters if the current URL is Steam's sign-in reply, else null. */
export function steamReplyParams(search: string): Record<string, string> | null {
  const q = new URLSearchParams(search)
  if (q.get('steam') !== 'callback' || q.get('openid.mode') !== 'id_res') return null
  const params: Record<string, string> = {}
  q.forEach((v, k) => {
    if (k.startsWith('openid.')) params[k] = v
  })
  return params
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('steam', { body })
  if (error) throw await functionError(error)
  return data as T
}

export const verifySteam = (params: Record<string, string>) =>
  call<{ linked: true; steamId: string; name: string | null }>({ action: 'verify', params })

export const unlinkSteam = () => call<{ linked: false }>({ action: 'unlink' })

export interface OwnedResult {
  checked: number
  newlyOwned: number
  linked: boolean
  private?: boolean
}

/** Marks games in the user's Steam library as In Your Library (never ones they changed by hand). */
export const checkSteamOwned = (titleIds?: string[]) => call<OwnedResult>({ action: 'owned', ...(titleIds ? { titleIds } : {}) })

const ownershipStarted = new Set<string>()

/** Once per app load: picks up games bought on Steam since last time. Mount once (AppShell). */
export function useSteamOwnershipCheck() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!user || !supabase || ownershipStarted.has(user.id)) return
    ownershipStarted.add(user.id)
    checkSteamOwned()
      .then((r) => (r.newlyOwned > 0 ? queryClient.invalidateQueries({ queryKey: libraryKey(user.id) }) : undefined))
      .catch(() => undefined)
  }, [user, queryClient])
}
