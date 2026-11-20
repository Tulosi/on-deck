import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Password-reset links are sent in the "implicit" style (tokens in the #fragment) so they work on any
 * device — the default PKCE style only works in the browser that asked for the reset, and changing the
 * email template to fix that needs custom SMTP. The main client is PKCE and would reject a fragment
 * link, so the tokens are captured and removed from the address bar here, before the client is created.
 * The reset page then turns them into a session (see pages/ResetPassword.tsx).
 */
function captureRecoveryTokens() {
  if (typeof window === 'undefined') return null
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const access_token = hash.get('access_token')
  const refresh_token = hash.get('refresh_token')
  if (hash.get('type') !== 'recovery' || !access_token || !refresh_token) return null
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return { access_token, refresh_token }
}

export const recoveryTokens = captureRecoveryTokens()

/**
 * Null until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set (see .env.example).
 * The app runs in "preview mode" on sample data while this is null.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true },
      })
    : null

export const isSupabaseConfigured = supabase !== null

/** Emails a password-reset link that works on any device (implicit flow; see captureRecoveryTokens). */
export async function requestPasswordReset(email: string, redirectTo: string) {
  if (!url || !anonKey) throw new Error('Supabase is not configured')
  const resetClient = createClient(url, anonKey, {
    auth: {
      flowType: 'implicit',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'ondeck-reset-request',
    },
  })
  const { error } = await resetClient.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw error
}
