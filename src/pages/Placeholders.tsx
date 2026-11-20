import { Link, useParams } from 'react-router-dom'
import { ComingSoon, PageHeader } from '../components/PageHeader'
import { Wordmark } from '../components/Logo'
import { isSupabaseConfigured } from '../lib/supabase'

export function Collections() {
  return (
    <div>
      <PageHeader title="Collections" />
      <ComingSoon>Named lists that can mix movies, shows, games and books — e.g. “Cyberpunk” or “Co-op with Sam”.</ComingSoon>
    </div>
  )
}

export function Settings() {
  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader title="Settings" />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Region &amp; currency</h2>
        <ComingSoon>Pick the country and currency used for Steam and gg.deals prices.</ComingSoon>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Plex &amp; Seerr</h2>
        <ComingSoon>Link your Plex account and enter your Seerr URL to see what’s on your server and request what isn’t.</ComingSoon>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Sharing</h2>
        <ComingSoon>Create and revoke read-only share links for your library, a category or a collection.</ComingSoon>
      </section>
    </div>
  )
}

export function Login() {
  return (
    <div className="mx-auto mt-10 max-w-sm space-y-6 rounded-xl border border-line bg-surface p-6">
      <Wordmark />
      <p className="text-sm text-muted">
        {isSupabaseConfigured
          ? 'Sign-in UI coming next: Google, or email + password.'
          : 'Sign-in needs Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local (see docs/API-KEYS.md).'}
      </p>
      <button disabled className="w-full rounded-md border border-line py-2 text-sm text-muted opacity-60">
        Continue with Google
      </button>
      <button disabled className="w-full rounded-md bg-accent py-2 text-sm font-medium text-accent-fg opacity-60">
        Sign in with email
      </button>
    </div>
  )
}

/** Public, read-only view of someone's shared list. Lives outside the app shell. */
export function SharedList() {
  const { token } = useParams()
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Wordmark />
      <div className="mt-8">
        <ComingSoon>Shared list <code className="font-mono">{token}</code> will render here, read-only.</ComingSoon>
      </div>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="font-mono text-sm text-faint">404</p>
      <p className="mt-2 text-fg">That page isn’t on deck.</p>
      <Link to="/" className="mt-4 inline-block text-sm text-accent-ink hover:underline">
        Go home
      </Link>
    </div>
  )
}
