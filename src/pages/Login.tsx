import { useState, type FormEvent } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import { authRedirectUrl, resetRedirectUrl, useAuth } from '../lib/auth'
import { requestPasswordReset, supabase } from '../lib/supabase'
import { plainError } from '../lib/errors'

type Mode = 'sign-in' | 'sign-up' | 'forgot'

const inputClass =
  'h-11 w-full rounded-md border border-line bg-bg px-3 text-sm sm:h-10 text-fg outline-none placeholder:text-faint focus:border-accent aria-invalid:border-bad'

export function Login() {
  const { user, loading } = useAuth()
  // ?mode=sign-up opens on Create account (the sample library's welcome card links there).
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'sign-up' ? 'sign-up' : 'sign-in')
  usePageTitle(mode === 'sign-up' ? 'Create account' : 'Sign in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Field problems, shown under each field in the app's words (instead of the browser's popups).
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  if (!loading && user) return <Navigate to="/" replace />

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
    setFieldErrors({})
  }

  /** What's wrong with the fields, if anything. The 8-character minimum is only for new passwords. */
  function check(): { email?: string; password?: string } {
    const problems: { email?: string; password?: string } = {}
    const trimmed = email.trim()
    if (!trimmed) problems.email = 'Enter your email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) problems.email = 'That doesn’t look like an email address.'
    if (mode !== 'forgot') {
      if (!password) problems.password = mode === 'sign-up' ? 'Choose a password.' : 'Enter your password.'
      else if (mode === 'sign-up' && password.length < 8) problems.password = 'Use at least 8 characters.'
    }
    return problems
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    const problems = check()
    setFieldErrors(problems)
    if (problems.email || problems.password) {
      document.getElementById(problems.email ? 'email' : 'password')?.focus()
      return
    }
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
    <div className="mx-auto mt-6 max-w-sm md:mt-12">
    {/* One line on what this is, for anyone arriving here first. */}
    {mode !== 'forgot' && (
      <p className="mb-4 text-center text-sm text-pretty text-muted">
        Keep track of the movies, shows, games and books you’re watching, playing and reading.
      </p>
    )}
    <div className="space-y-6 rounded-lg border border-line bg-surface p-6">
      {/* The logo is in the top bar already; the heading is for screen readers. */}
      {mode !== 'forgot' && <h1 className="sr-only">{mode === 'sign-up' ? 'Create an On Deck account' : 'Sign in to On Deck'}</h1>}

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
            // A two-way switch: screen readers hear which one is picked, not just see the shading.
            <div role="radiogroup" aria-label="Sign in or create an account" className="flex gap-1 rounded-lg border border-line bg-bg p-1">
              {(['sign-in', 'sign-up'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
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

          <form onSubmit={submit} noValidate className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs text-muted">Email</span>
              <input
                name="email"
                id="email"
                spellCheck={false}
                type="email"
                required
                autoComplete="email"
                value={email}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setFieldErrors((f) => ({ ...f, email: undefined }))
                }}
                className={inputClass}
              />
              {fieldErrors.email && (
                <span id="email-error" className="block text-xs text-bad">
                  {fieldErrors.email}
                </span>
              )}
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
                  name="password"
                  id="password"
                  type="password"
                  required
                  minLength={mode === 'sign-up' ? 8 : undefined}
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  value={password}
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'password-error' : mode === 'sign-up' ? 'password-hint' : undefined}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setFieldErrors((f) => ({ ...f, password: undefined }))
                  }}
                  className={inputClass}
                />
                {fieldErrors.password ? (
                  <span id="password-error" className="block text-xs text-bad">
                    {fieldErrors.password}
                  </span>
                ) : (
                  mode === 'sign-up' && (
                    <span id="password-hint" className="text-xs text-faint">
                      At least 8 characters.
                    </span>
                  )
                )}
              </div>
            )}

            {/* Announced by screen readers as soon as they appear. */}
            {error && (
              <p role="alert" className="text-sm text-bad">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-good">
                {notice}
              </p>
            )}

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
      <p className="mt-4 text-center">
        <Link to="/" className="hit text-sm text-muted hover:text-fg">
          Back to the sample library
        </Link>
      </p>
    </div>
  )
}
