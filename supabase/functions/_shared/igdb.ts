// IGDB (via Twitch app credentials). Server-side only: the client secret never leaves Supabase.
import { HttpError, secret } from './http.ts'

// deno-lint-ignore no-explicit-any
export type Json = Record<string, any>

let token: { value: string; expires: number } | null = null

async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expires - 60_000) return token.value
  const url = new URL('https://id.twitch.tv/oauth2/token')
  url.searchParams.set('client_id', secret('TWITCH_CLIENT_ID'))
  url.searchParams.set('client_secret', secret('TWITCH_CLIENT_SECRET'))
  url.searchParams.set('grant_type', 'client_credentials')
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) throw new HttpError(502, `twitch_auth_${res.status}`)
  const d = await res.json()
  token = { value: d.access_token, expires: Date.now() + d.expires_in * 1000 }
  return token.value
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

/**
 * Runs an IGDB "apicalypse" query against an endpoint (e.g. "games").
 * IGDB allows about 4 requests a second; a bulk import goes over that, so a 429 waits and retries
 * (backing off, with jitter so parallel calls don't retry in lockstep) instead of failing the title.
 */
export async function igdb(endpoint: string, query: string): Promise<Json[]> {
  let res: Response
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': secret('TWITCH_CLIENT_ID'),
        Authorization: `Bearer ${await accessToken()}`,
        Accept: 'application/json',
        'Content-Type': 'text/plain',
      },
      body: query,
    })
    if (res.status !== 429 || attempt >= 5) break
    await res.body?.cancel()
    await sleep(300 * 2 ** attempt + Math.random() * 300)
  }
  if (!res.ok) {
    console.error('igdb error', res.status, await res.text().catch(() => ''))
    throw new HttpError(502, `igdb_error_${res.status}`)
  }
  return res.json()
}

export const igdbImage = (imageId: string | undefined | null, size: 't_cover_big' | 't_1080p' | 't_cover_small') =>
  imageId ? `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg` : null

/** IGDB "PC (Microsoft Windows)" platform id — On Deck tracks PC games only. */
export const PC = 6
