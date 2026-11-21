// Helpers shared by every Edge Function.
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Throw this to return a specific status + error code from a handler. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code)
  }
}

/** Read a required secret or fail with a clear 500. */
export function secret(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new HttpError(500, `missing_secret_${name}`)
  return value
}

/** Wraps a handler with CORS preflight + error handling. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
      return await handler(req)
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code }, err.status)
      console.error(err)
      return json({ error: 'internal_error' }, 500)
    }
  })
}

/** Placeholder response for functions that aren't implemented yet. */
export function notImplemented(name: string, requiredSecrets: string[]): Response {
  const missing = requiredSecrets.filter((s) => !Deno.env.get(s))
  return json({ function: name, status: 'not_implemented', missingSecrets: missing }, 501)
}

// ─── Supabase access ───────────────────────────────────────────────────────

function serverKey(): string {
  // New-style projects expose secret keys as JSON ({"default": "sb_secret_…"}); fall back to the legacy key.
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    const key = keys.default ?? Object.values(keys)[0]
    if (key) return key
  } catch {
    // fall through
  }
  return secret('SUPABASE_SERVICE_ROLE_KEY')
}

let adminClient: SupabaseClient | null = null

/** Service-role client: bypasses RLS. Only for writing shared caches — never return its data unfiltered. */
export function admin(): SupabaseClient {
  adminClient ??= createClient(secret('SUPABASE_URL'), serverKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return adminClient
}

/**
 * Verifies the caller's Supabase session (the user access token supabase-js sends as the Bearer token).
 * Functions set verify_jwt = false in config.toml and check here instead, because the gateway check
 * doesn't support this project's new-style API keys.
 */
export async function requireUser(req: Request): Promise<User> {
  // The `daily` job calls functions on a user's behalf with the private JOB_SECRET and that user's id.
  const job = jobUserId(req)
  if (job) return { id: job } as User
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'not_signed_in')
  const { data, error } = await admin().auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'not_signed_in')
  return data.user
}

// ─── Scheduled job access ─────────────────────────────────────────────────

/** Constant-time string comparison. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

/** True when the request carries the private job secret (`x-job-secret` = JOB_SECRET). */
export function isJob(req: Request): boolean {
  const expected = Deno.env.get('JOB_SECRET')
  const given = req.headers.get('x-job-secret')
  return !!expected && expected.length >= 32 && !!given && sameSecret(given, expected)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * For job calls: the user to act for (`x-job-user`), or the nil id for user-independent work (refreshing a
 * shared title). Null when this isn't a job call.
 */
function jobUserId(req: Request): string | null {
  if (!isJob(req)) return null
  const id = req.headers.get('x-job-user')
  return id && UUID.test(id) ? id : '00000000-0000-0000-0000-000000000000'
}
