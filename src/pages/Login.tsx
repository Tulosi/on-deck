import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import { Wordmark } from '../components/Logo'
import { authRedirectUrl, resetRedirectUrl, useAuth } from '../lib/auth'
import { requestPasswordReset, supabase } from '../lib/supabase'
import { plainError } from '../lib/errors'

type Mode = 'sign-in' | 'sign-up' | 'forgot'

const inputClass =
  'h-11 w-full rounded-md border border-line bg-bg px-3 text-sm sm:h-10 text-fg outline-none placeholder:text-faint focus:border-accent'

export function Login() {
  const { user, loading } = useAuth()
  // ?mode=sign-up opens on Create account (the sample library's welcome card links there).
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'sign-up' ? 'sign-up' : 'sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!loading && user) return <Navigate to="/" replace />

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
  }

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
      } else if (mode === 'forgot') {
        await requestPasswordReset(email, resetRedirectUrl())
        // Same message whether or not the address has an account, so it can't be used to probe for users.
        setNotice(`If ${email} has an On Deck account, a reset link is on its way.`)
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
      setError(plainError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-sm space-y-6 rounded-lg border border-line bg-surface p-6 md:mt-12">
      <Wordmark />

      {!supabase ? (
        <p className="text-sm text-muted">
          Sign-in needs Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.
        </p>
      ) : (
        <>
          {mode === 'forgot' ? (
            <div className="space-y-1">
              <h1 className="text-lg font-semibold tracking-tight text-fg">Reset your password</h1>
              <p className="text-sm text-muted">We’ll email you a link to set a new one.</p>
            </div>
          ) : (
            <div className="flex gap-1 rounded-lg border border-line bg-bg p-1">
              {(['sign-in', 'sign-up'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={clsx(
                    'flex-1 rounded-md py-3 text-sm transition-colors sm:py-1.5',
                    mode === m ? 'bg-raised text-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  {m === 'sign-in' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          )}

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
            {mode !== 'forgot' && (
              <div className="space-y-1.5">
                <span className="flex items-baseline justify-between">
                  <label htmlFor="password" className="text-xs text-muted">
                    Password
                  </label>
                  {mode === 'sign-in' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="hit text-xs text-accent-ink hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </span>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
                {mode === 'sign-up' && <span className="text-xs text-faint">At least 8 characters.</span>}
              </div>
            )}

            {error && <p className="text-sm text-bad">{error}</p>}
            {notice && <p className="text-sm text-good">{notice}</p>}

            <button
              type="submit"
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent sm:h-10 text-sm font-medium text-accent-fg hover:brightness-95 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send reset link'}
            </button>
          </form>

          {mode === 'forgot' && (
            <button type="button" onClick={() => switchMode('sign-in')} className="hit text-sm text-muted hover:text-fg">
              ← Back to sign in
            </button>
          )}
        </>
      )}
    </div>
  )
}
