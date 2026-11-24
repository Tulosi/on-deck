import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, Check, CircleDashed, Loader2, RefreshCw, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { callFn, useProfile } from '../lib/integrations'
import { supabase } from '../lib/supabase'

type State = 'ok' | 'limited' | 'refused' | 'error' | 'off'
interface Check {
  service: string
  label: string
  state: State
  status: number | null
  ms: number | null
  message: string
}
interface JobRun {
  job: string
  ran_at: string
  ok: boolean
  summary: Record<string, unknown>
}

const STATE_UI: Record<State, { icon: typeof Check; className: string; word: string }> = {
  ok: { icon: Check, className: 'text-good', word: 'OK' },
  limited: { icon: AlertTriangle, className: 'text-warn', word: 'Rate limited' },
  refused: { icon: X, className: 'text-bad', word: 'Refused' },
  error: { icon: X, className: 'text-bad', word: 'Error' },
  off: { icon: CircleDashed, className: 'text-faint', word: 'Not set up' },
}

function ago(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

const JOBS: { job: string; label: string; every: string }[] = [
  { job: 'daily', label: 'Refresh & alerts', every: 'every 3 hours' },
  { job: 'keyshop', label: 'Key-shop prices', every: 'every 6 hours' },
]

/** Settings → Status: service checks, background job runs, and how fresh this user's data is. */
export function StatusPanel() {
  const { user } = useAuth()
  const profile = useProfile()

  const check = useMutation({ mutationFn: () => callFn<{ checks: Check[]; checkedAt: string }>('status', { action: 'check' }) })

  const jobs = useQuery({
    queryKey: ['job-runs'],
    enabled: !!user && !!supabase,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, JobRun | null> = {}
      for (const j of JOBS) {
        const { data } = await supabase!.from('job_runs').select('job, ran_at, ok, summary').eq('job', j.job).order('ran_at', { ascending: false }).limit(1)
        out[j.job] = (data?.[0] as JobRun | undefined) ?? null
      }
      return out
    },
  })

  const fresh = useQuery({
    queryKey: ['data-freshness', user?.id],
    enabled: !!user && !!supabase,
    staleTime: 60_000,
    queryFn: async () => {
      const latest = async (table: string, col: string, filter?: (q: any) => any) => {
        let q = supabase!.from(table).select(col).order(col, { ascending: false, nullsFirst: false }).limit(1)
        if (filter) q = filter(q)
        const { data } = await q
        return ((data?.[0] as Record<string, string> | undefined)?.[col] as string | undefined) ?? null
      }
      const [availability, plex] = await Promise.all([
        latest('user_availability', 'checked_at'),
        latest('user_items', 'plex_checked_at'),
      ])
      const { data: d } = await supabase!.from('profiles').select('daily_checked_at').eq('user_id', user!.id).maybeSingle()
      return { availability, plex, daily: (d?.daily_checked_at as string | null) ?? null }
    },
  })

  return (
    <div className="space-y-5">
      {/* Services */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted">Services</p>
          <button
            type="button"
            onClick={() => check.mutate()}
            disabled={check.isPending}
            className="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs text-fg hover:border-accent disabled:opacity-60"
          >
            {check.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {check.data ? 'Check again' : 'Check now'}
          </button>
        </div>
        {check.error && <p className="text-sm text-bad">Couldn’t run the checks. Please try again.</p>}
        {!check.data && !check.isPending && (
          <p className="text-xs text-muted">Tests each service On Deck uses: keys, tokens, rate limits and your linked accounts.</p>
        )}
        {check.data && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {check.data.checks.map((c) => {
              const ui = STATE_UI[c.state]
              const Icon = ui.icon
              return (
                <li key={c.service} className="flex items-start gap-3 px-3 py-2.5">
                  <Icon className={clsx('mt-0.5 size-4 shrink-0', ui.className)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">{c.label}</p>
                    <p className={clsx('text-xs', c.state === 'ok' || c.state === 'off' ? 'text-muted' : ui.className)}>{c.message}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-faint">
                    {c.ms != null ? `${c.ms} ms` : ''}
                    {c.status && c.state !== 'ok' ? ` (${c.status})` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Background jobs */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">Background jobs</p>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {JOBS.map((j) => {
            const run = jobs.data?.[j.job] ?? null
            const errors = (run?.summary?.errors ?? {}) as Record<string, number>
            const errorText = Object.entries(errors)
              .map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ''}`)
              .join(', ')
            const limited = !!run?.summary?.rateLimited
            return (
              <li key={j.job} className="flex items-start gap-3 px-3 py-2.5">
                {!run ? (
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-faint" />
                ) : run.ok ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-good" />
                ) : limited ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
                ) : (
                  <X className="mt-0.5 size-4 shrink-0 text-bad" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">
                    {j.label} <span className="text-xs text-faint">· {j.every}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {jobs.isLoading
                      ? 'Loading…'
                      : !run
                        ? 'No runs recorded yet'
                        : `Last run ${ago(run.ran_at)}, ${run.ok ? 'no problems' : limited ? 'rate limited' : 'had errors'}`}
                  </p>
                  {run && (errorText || typeof run.summary.error === 'string') && (
                    <p className="mt-0.5 font-mono text-[11px] break-words text-bad">{errorText || String(run.summary.error)}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Your data */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">Your data</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted">Alerts & refresh</dt>
          <dd className="text-fg">{fresh.isLoading ? '…' : ago(fresh.data?.daily)}</dd>
          <dt className="text-muted">Where to watch / Plex availability</dt>
          <dd className="text-fg">{fresh.isLoading ? '…' : ago(fresh.data?.availability)}</dd>
          <dt className="text-muted">Plex watch progress</dt>
          <dd className="text-fg">{fresh.isLoading ? '…' : ago(fresh.data?.plex)}</dd>
          <dt className="text-muted">Price region</dt>
          <dd className="text-fg">{profile.data?.country_code ?? '…'}</dd>
        </dl>
      </div>
    </div>
  )
}
