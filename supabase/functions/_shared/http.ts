// Helpers shared by every Edge Function.

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

/** Read a required secret; returns null (and the caller responds 500) if it isn't set yet. */
export function secret(name: string): string | null {
  return Deno.env.get(name) ?? null
}

/** Wraps a handler with CORS preflight + error handling. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
      return await handler(req)
    } catch (err) {
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
