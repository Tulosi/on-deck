import { friendlyError } from './integrations'

/** Known messages from the network, Supabase Auth and Postgres, in plain words. Matched case-insensitively. */
const KNOWN: [RegExp, string][] = [
  [/failed to fetch|networkerror|load failed|network request failed/i, 'Couldn’t reach On Deck. Check your connection and try again.'],
  [/invalid login credentials/i, 'That email and password don’t match.'],
  [/email not confirmed/i, 'Confirm your email first: the link is in your inbox.'],
  [/user already registered/i, 'There’s already an account with that email. Sign in instead.'],
  [/rate limit|too many requests|for security purposes/i, 'Too many tries in a row. Wait a minute, then try again.'],
  [/jwt expired|invalid jwt|refresh token/i, 'You’ve been signed out. Sign in again to keep going.'],
  [/duplicate key|already exists/i, 'That’s already there.'],
  [/row-level security|permission denied/i, 'You don’t have access to that.'],
  [/timeout|timed out/i, 'That took too long. Try again.'],
  [/email link is invalid|otp.*expired|token has expired/i, 'That link has expired. Ask for a new one.'],
]

/** Looks like a code or a database message rather than a sentence meant for people. */
const TECHNICAL = /^[a-z0-9]+(_[a-z0-9]+)+$|PGRST|violates|column|relation|syntax|constraint|undefined|null|[{}<>]|^\w*Error\b/i

/**
 * Turns an error into a sentence for the screen. Integration codes (Seerr, Plex, Steam) get their own words;
 * known network, sign-in and database messages are rewritten; anything else technical becomes `fallback`.
 */
export function plainError(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (!raw) return fallback
  const integration = friendlyError(raw)
  if (integration !== raw) return integration
  for (const [re, text] of KNOWN) if (re.test(raw)) return text
  return TECHNICAL.test(raw) ? fallback : raw
}
