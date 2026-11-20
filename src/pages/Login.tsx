import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import { Wordmark } from '../components/Logo'
import { authRedirectUrl, useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type Mode = 'sign-in' | 'sign-up'

const inputClass =
  'h-10 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint focus:border-accent'

export function Login() {
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!loading && user) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authRedirectUrl() },
        })
        if (error) throw error
        // With email confirmation on, there's no session until the link is clicked.
        if (!data.session) setNotice(`Check ${email} for a confirmation link, then come back and sign in.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-sm space-y-6 rounded-xl border border-line bg-surface p-6 md:mt-12">
      <Wordmark />

      {!supabase ? (
        <p className="text-sm text-muted">
          Sign-in needs Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.
        </p>
      ) : (
        <>
          <div className="flex gap-1 rounded-lg border border-line bg-bg p-1">
            {(['sign-in', 'sign-up'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setError(null)
                  setNotice(null)
                }}
                className={clsx(
                  'flex-1 rounded-md py-1.5 text-sm transition-colors',
                  mode === m ? 'bg-raised text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {m === 'sign-in' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-muted">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted">Password</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              {mode === 'sign-up' && <span className="text-xs text-faint">At least 8 characters.</span>}
            </label>

            {error && <p className="text-sm text-bad">{error}</p>}
            {notice && <p className="text-sm text-good">{notice}</p>}

            <button
              type="submit"
              disabled={busy}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-accent-fg hover:brightness-95 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <button
            type="button"
            disabled
            title="Coming soon"
            className="h-10 w-full rounded-md border border-line text-sm text-muted opacity-60"
          >
            Continue with Google · soon
          </button>
        </>
      )}
    </div>
  )
}
