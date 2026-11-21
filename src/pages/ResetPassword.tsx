import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Wordmark } from '../components/Logo'
import { useAuth } from '../lib/auth'
import { recoveryTokens, supabase } from '../lib/supabase'

const inputClass =
  'h-10 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint focus:border-accent'

/** Reads Supabase's error from the link (?error_description=… or #error_description=…). */
function linkError(): string | null {
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const msg = params.get('error_description') ?? hash.get('error_description')
  return msg ? msg.replace(/\+/g, ' ') : null
}

/**
 * Landing page for the password-reset email.
 *  - #access_token=…&type=recovery  (what On Deck requests; works on any device) — the tokens were captured
 *                                    in lib/supabase.ts before the client loaded and become a session here.
 *  - ?token_hash=…&type=recovery    (only if the email template is ever customised) — verified here.
 */
export function ResetPassword() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [verifying, setVerifying] = useState(false)
  const [linkProblem, setLinkProblem] = useState<string | null>(linkError)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (!supabase || started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    if (recoveryTokens) {
      setVerifying(true)
      supabase.auth
        .setSession(recoveryTokens)
        .then(({ error }) => {
          if (error) setLinkProblem('This reset link is invalid or has expired.')
        })
        .finally(() => setVerifying(false))
    } else if (tokenHash && params.get('type') === 'recovery') {
      setVerifying(true)
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        .then(({ error }) => {
          if (error) setLinkProblem(error.message)
        })
        .finally(() => setVerifying(false))
    }
    // Drop tokens / codes from the address bar once read.
    if (window.location.search || window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    if (password !== confirm) {
      setError('The two passwords don’t match.')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
    setTimeout(() => navigate('/', { replace: true }), 1500)
  }

  let body
  if (loading || verifying) {
    body = (
      <div className="grid place-items-center py-6 text-muted">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  } else if (done) {
    body = <p className="text-sm text-good">Password updated — taking you to your library…</p>
  } else if (!user) {
    body = (
      <div className="space-y-3 text-sm text-muted">
        <p className="text-bad">
          {linkProblem ?? 'This reset link is invalid or has expired.'}
        </p>
        <Link to="/login" className="inline-block text-accent-ink hover:underline">
          Request a new link
        </Link>
      </div>
    )
  } else {
    body = (
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">
          Choose a new password for <span className="text-fg">{user.email}</span>.
        </p>
        <label className="block space-y-1.5">
          <span className="text-xs text-muted">New password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <span className="text-xs text-faint">At least 8 characters.</span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-muted">Confirm new password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-accent-fg hover:brightness-95 disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Save new password
        </button>
      </form>
    )
  }

  return (
    <div className="mx-auto mt-6 max-w-sm space-y-6 rounded-xl border border-line bg-surface p-6 md:mt-12">
      <Wordmark />
      <h1 className="text-lg font-semibold tracking-tight text-fg">Set a new password</h1>
      {body}
    </div>
  )
}
