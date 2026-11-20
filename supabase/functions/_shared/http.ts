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
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'not_signed_in')
  const { data, error } = await admin().auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'not_signed_in')
  return data.user
}
