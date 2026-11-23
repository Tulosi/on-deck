// Plex servers the user can reach, and a JSON GET helper. Shared by plex-watch and importer.
import { HttpError } from './http.ts'
import { plexHeaders } from './plex.ts'

// deno-lint-ignore no-explicit-any
type Json = any

export interface Server {
  name: string
  token: string
  uris: string[]
}

/** Servers this user can reach, with remote https connections first (Supabase can't reach LAN addresses). */
export async function servers(clientId: string, plexToken: string): Promise<Server[]> {
  const res = await fetch('https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1', {
    headers: plexHeaders(clientId, plexToken),
    signal: AbortSignal.timeout(8000),
  })
  if (res.status === 401) throw new HttpError(401, 'plex_token_invalid')
  if (!res.ok) throw new HttpError(502, 'plex_unreachable')
  const list = (await res.json()) as Json[]
  return list
    .filter((r) => String(r.provides ?? '').includes('server') && r.accessToken)
    .map((r) => ({
      name: r.name,
      token: r.accessToken,
      uris: ((r.connections ?? []) as Json[])
        .filter((c) => !c.local && c.protocol === 'https')
        .sort((a, b) => Number(a.relay) - Number(b.relay)) // direct before relay
        .map((c) => c.uri as string),
    }))
    .filter((s) => s.uris.length > 0)
}

export async function plexGet(uri: string, path: string, token: string, timeoutMs = 6000): Promise<Json | null> {
  try {
    const res = await fetch(uri + path, {
      headers: { Accept: 'application/json', 'X-Plex-Token': token },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

