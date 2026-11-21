// TMDB watch providers (data by JustWatch), shared by the `tmdb` and `availability` functions.
// Subscription ("stream") and free/ad-supported only — rent/buy is deliberately left out.
import { HttpError, secret } from './http.ts'

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

export interface Provider {
  id: number
  name: string
  logoUrl: string | null
}

export interface WatchProviders {
  country: string
  link: string | null
  stream: Provider[]
  free: Provider[]
}

const IMG = 'https://image.tmdb.org/t/p'

export async function tmdbGet(path: string, params: Record<string, string> = {}): Promise<Json> {
  const url = new URL('https://api.themoviedb.org/3' + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret('TMDB_READ_TOKEN')}`, accept: 'application/json' },
  })
  if (res.status === 404) throw new HttpError(404, 'tmdb_not_found')
  if (!res.ok) throw new HttpError(502, `tmdb_error_${res.status}`)
  return res.json()
}

// "Shudder Amazon Channel", "AMC Plus Apple TV channel" … → the underlying service.
const CHANNEL_SUFFIX = /\s+(amazon channel|apple tv channel|apple tv\+? channel|roku premium channel|prime video channel)$/i
const ALIASES: Record<string, string> = { 'AMC Plus': 'AMC+', 'Amazon Prime Video with Ads': 'Amazon Prime Video' }

export function normaliseName(name: string) {
  const base = name.replace(CHANNEL_SUFFIX, '').trim()
  return ALIASES[base] ?? base
}

export function toProviders(list: Json[] | undefined): Provider[] {
  const seen = new Map<string, Provider>()
  for (const p of [...(list ?? [])].sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))) {
    const name = normaliseName(p.provider_name)
    if (!seen.has(name)) {
      seen.set(name, { id: p.provider_id, name, logoUrl: p.logo_path ? `${IMG}/w92${p.logo_path}` : null })
    }
  }
  return [...seen.values()]
}

/** Where to stream one title in one country (subscription + free). */
export async function watchProviders(tmdbId: number, mediaType: 'movie' | 'tv', country: string): Promise<WatchProviders> {
  const data = await tmdbGet(`/${mediaType}/${tmdbId}/watch/providers`)
  const r = (data.results ?? {})[country] as Json | undefined
  const stream = toProviders(r?.flatrate)
  const streamNames = new Set(stream.map((p) => p.name))
  const free = toProviders([...(r?.free ?? []), ...(r?.ads ?? [])]).filter((p) => !streamNames.has(p.name))
  return { country, link: r?.link ?? null, stream, free }
}
