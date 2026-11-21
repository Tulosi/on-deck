// Profile settings (region, Seerr URL), Plex linking, and "where to watch" lookups.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaType, Title } from '../types'
import { useAuth } from './auth'
import { functionError, refreshAvailability, refreshPrices } from './library'
import { supabase } from './supabase'

async function callFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke(name, { body })
  if (error) throw await functionError(error)
  return data as T
}

/** Turns function error codes into something a person can act on. */
export function friendlyError(err: unknown): string {
  const code = err instanceof Error ? err.message : String(err)
  const messages: Record<string, string> = {
    seerr_unreachable: 'Couldn’t reach your Seerr. Check the URL and that it’s online.',
    seerr_login_denied: 'Seerr refused the Plex sign-in. Make sure your Plex account can sign in to that Seerr.',
    seerr_no_session: 'Seerr didn’t start a session. Is that URL really a Seerr / Overseerr / Jellyseerr?',
    seerr_url_invalid: 'That doesn’t look like a valid URL.',
    seerr_url_not_https: 'The Seerr URL must start with https://',
    seerr_url_private: 'The Seerr URL must be reachable from the internet (not a local address).',
    seerr_request_not_allowed: 'Your Seerr account isn’t allowed to make requests.',
    plex_not_linked: 'Connect your Plex account first.',
    plex_unreachable: 'Couldn’t reach Plex. Try again in a moment.',
    pin_expired: 'The Plex sign-in timed out. Try again.',
    steam_bad_reply: 'Steam’s sign-in reply looked wrong. Try connecting again.',
    steam_not_verified: 'Steam couldn’t confirm that sign-in (it may have expired). Try connecting again.',
  }
  if (messages[code]) return messages[code]
  if (code.startsWith('seerr_')) return `Seerr returned an error (${code}).`
  return code
}

// ─── Profile ───────────────────────────────────────────────────────────────

export interface Profile {
  country_code: string
  currency: string
  seerr_url: string | null
  /** Streaming services the user opted in to (normalised names, e.g. "Netflix"). */
  streaming_services: string[]
  /** Linked Steam account (set by the `steam` function after verifying the sign-in). */
  steam_id: string | null
  steam_name: string | null
  /** Poster chip visibility: { chip: "show" | "hover" | "hide" } (see lib/chips.ts). */
  card_chips: Record<string, 'show' | 'hover' | 'hide'>
}

export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user && !!supabase,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('profiles')
        .select('country_code, currency, seerr_url, streaming_services, card_chips, steam_id, steam_name')
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return data as Profile
    },
  })
}

export function useUpdateProfile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return async (patch: Partial<Profile>) => {
    const { error } = await supabase!.from('profiles').update(patch).eq('user_id', user!.id)
    if (error) throw error
    await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
    await queryClient.invalidateQueries({ queryKey: ['providers'] })
    await queryClient.invalidateQueries({ queryKey: ['seerr'] })
    // Region, services or Seerr changed → stored availability is out of date; re-check everything.
    if ('country_code' in patch || 'streaming_services' in patch || 'seerr_url' in patch) {
      void (async () => {
        try {
          const before = new Date().toISOString()
          let remaining = await refreshAvailability({ before })
          for (let i = 0; i < 10 && remaining > 0; i++) remaining = await refreshAvailability({ before })
          if ('country_code' in patch) {
            let left = await refreshPrices({ before })
            for (let i = 0; i < 5 && left > 0; i++) left = await refreshPrices({ before })
          }
        } finally {
          await queryClient.invalidateQueries({ queryKey: ['library', user?.id] })
        }
      })()
    }
  }
}

// ─── Plex ──────────────────────────────────────────────────────────────────

export interface PlexStatus {
  linked: boolean
  username: string | null
}

export function usePlexStatus() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['plex', user?.id],
    enabled: !!user && !!supabase,
    queryFn: () => callFn<PlexStatus>('plex-link', { action: 'status' }),
  })
}

/**
 * Plex PIN sign-in. Opens app.plex.tv in a new window (opened synchronously from the click so it
 * isn't popup-blocked), then polls until the user approves, `signal` aborts (Cancel), or 3 minutes pass.
 * Doesn't rely on `popup.closed`: Plex's page may cut the link to its opener, which makes that unreliable.
 */
export async function linkPlex(signal: AbortSignal): Promise<PlexStatus> {
  const popup = window.open('about:blank', 'plex-auth', 'width=600,height=720')
  try {
    const { pinId, authUrl } = await callFn<{ pinId: number; authUrl: string }>('plex-link', { action: 'start' })
    if (popup) popup.location.href = authUrl
    else window.open(authUrl, '_blank')

    const deadline = Date.now() + 3 * 60_000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000))
      if (signal.aborted) throw new Error('cancelled')
      const result = await callFn<PlexStatus>('plex-link', { action: 'check', pinId })
      if (result.linked) return result
    }
    throw new Error('pin_expired')
  } finally {
    try {
      popup?.close()
    } catch {
      // window already gone or no longer ours
    }
  }
}

export const unlinkPlex = () => callFn<PlexStatus>('plex-link', { action: 'unlink' })

export const testSeerr = (seerrUrl: string) =>
  callFn<{ ok: boolean; seerrUser: string | null }>('seerr', { action: 'test', seerrUrl })

// ─── Where to watch ────────────────────────────────────────────────────────

export interface Provider {
  id: number
  name: string
  logoUrl: string | null
}

export interface Providers {
  country: string
  link: string | null
  stream: Provider[]
  free: Provider[]
}

export interface ServiceOption {
  name: string
  logoUrl: string | null
}

/** All streaming services in a country, most popular first — for the Settings opt-in list. */
export function useServiceList(country: string | undefined) {
  return useQuery({
    queryKey: ['service-list', country],
    enabled: !!country,
    staleTime: 24 * 60 * 60_000,
    queryFn: () => callFn<{ services: ServiceOption[] }>('tmdb', { action: 'provider-list', country }),
  })
}

export type SeerrStatus = 'available' | 'partial' | 'processing' | 'pending' | 'missing'

export type SeerrResult =
  | { configured: false; missing: ('plex' | 'seerr')[] }
  | {
      configured: true
      /** What's on Plex. */
      status: SeerrStatus
      /** An open request exists (awaiting approval or downloading) — independent of `status`. */
      requested: boolean
      /** A download is actually in progress (not just approved / waiting for release). */
      downloading?: boolean
      plexUrl?: string | null
      /** This title's page in the user's Seerr. */
      seerrUrl?: string | null
      /** TV only: per-season state for the season picker (specials left out). */
      seasons?: SeasonInfo[]
      /** TV only: at least one season can still be requested. */
      canRequest?: boolean
    }

export interface SeasonInfo {
  number: number
  name: string
  episodes: number | null
  status: SeerrStatus
  requested: boolean
  /** Seerr only accepts seasons with nothing on Plex yet that aren't already requested. */
  requestable: boolean
}

function tmdbRef(title: Title): { tmdbId: number; mediaType: 'movie' | 'tv' } | null {
  if (!title.sourceKey) return null
  const [mediaType, source, id] = title.sourceKey.split(':')
  if (source !== 'tmdb' || (mediaType !== 'movie' && mediaType !== 'tv')) return null
  return { tmdbId: Number(id), mediaType }
}

export function useProviders(title: Title) {
  const profile = useProfile()
  const ref = tmdbRef(title)
  const country = profile.data?.country_code ?? 'US'
  return useQuery({
    queryKey: ['providers', ref?.mediaType, ref?.tmdbId, country],
    enabled: !!ref && profile.isSuccess,
    staleTime: 60 * 60_000,
    queryFn: () => callFn<Providers>('tmdb', { action: 'providers', ...ref, country }),
  })
}

export function useSeerrStatus(title: Title) {
  const { user } = useAuth()
  const ref = tmdbRef(title)
  return useQuery({
    queryKey: ['seerr', user?.id, ref?.mediaType, ref?.tmdbId],
    enabled: !!user && !!ref,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => callFn<SeerrResult>('seerr', { action: 'status', ...ref }),
  })
}

export function useRequestOnSeerr(title: Title) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const ref = tmdbRef(title)
  /** TV: `seasons` to request; omitted → every season not already on Plex or requested. */
  return async (seasons?: number[]) => {
    const result = await callFn<SeerrResult>('seerr', { action: 'request', ...ref, ...(seasons ? { seasons } : {}) })
    queryClient.setQueryData(['seerr', user?.id, ref?.mediaType, ref?.tmdbId], result)
    return result
  }
}

export const supportsWhereToWatch = (mediaType: MediaType) => mediaType === 'movie' || mediaType === 'tv'

export type PlexWatch =
  | { configured: false }
  | { configured: true; found: false; reason: 'not_on_plex' | 'no_reachable_server' }
  | {
      configured: true
      found: true
      server: string
      /** TV */
      lastWatched?: { season: number; episode: number } | null
      watchedCount?: number
      plexEpisodes?: number
      /** Movies */
      movie?: { state: 'watched' | 'in_progress' | 'unwatched'; percent: number }
    }

/** The user's Plex watch state for a show (last watched episode) or movie. Only runs once Plex is linked. */
export function usePlexWatch(title: Title) {
  const { user } = useAuth()
  const plex = usePlexStatus()
  const ref = tmdbRef(title)
  return useQuery({
    queryKey: ['plex-watch', user?.id, ref?.mediaType, ref?.tmdbId],
    enabled: !!user && !!ref && !!plex.data?.linked,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () =>
      callFn<PlexWatch>('plex-watch', {
        action: 'sync',
        tmdbId: ref!.tmdbId,
        title: title.title,
        mediaType: ref!.mediaType,
      }),
  })
}

export type Availability =
  | { state: 'loading' }
  | { state: 'no-sources' } // no Plex/Seerr and no streaming services picked
  | { state: 'available'; via: string[] } // e.g. ["Plex", "Netflix"]
  | { state: 'unavailable' }

/**
 * Is this movie/show watchable through any of the user's sources: on their Plex (fully or partly) or on
 * one of their opted-in streaming services (subscription or free)? Reuses the Where-to-watch queries,
 * so it costs no extra requests.
 */
export function useAvailability(title: Title): Availability {
  const seerr = useSeerrStatus(title)
  const providers = useProviders(title)
  const profile = useProfile()

  const mine = new Set(profile.data?.streaming_services ?? [])
  const plexConfigured = !!seerr.data?.configured
  if (profile.isLoading || seerr.isLoading || (mine.size > 0 && providers.isLoading)) return { state: 'loading' }
  if (!plexConfigured && mine.size === 0) return { state: 'no-sources' }

  const via: string[] = []
  if (seerr.data?.configured && (seerr.data.status === 'available' || seerr.data.status === 'partial')) via.push('Plex')
  for (const p of [...(providers.data?.stream ?? []), ...(providers.data?.free ?? [])]) {
    if (mine.has(p.name) && !via.includes(p.name)) via.push(p.name)
  }
  return via.length > 0 ? { state: 'available', via } : { state: 'unavailable' }
}
