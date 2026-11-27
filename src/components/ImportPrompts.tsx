import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Gamepad2, Loader2, Plus, Tv, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { usePlexStatus, useProfile } from '../lib/integrations'
import { fetchPlexRecent, fetchSkips, fetchSteamNew, importCandidates, markSteamSeen, skipCandidate, type Candidate, type CandidateList } from '../lib/importer'
import { plainError } from '../lib/errors'
import { POSTER_W } from '../lib/posterWidth'

const PLEX_SHOWN = 5
const small = 'flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-xs disabled:opacity-50'

/** A poster with Add / Skip under it. */
function PromptTile({
  c,
  busy,
  onAdd,
  onSkip,
  skipLabel,
}: {
  c: Candidate
  busy: boolean
  onAdd: () => void
  onSkip: () => void
  skipLabel: string
}) {
  const Icon = c.mediaType === 'game' ? Gamepad2 : Tv
  return (
    <div className={POSTER_W}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-raised">
        {c.poster ? (
          <img src={c.poster} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center p-2 text-center text-xs text-muted">
            <Icon className="mb-1 size-4" />
            {c.title}
          </div>
        )}
      </div>
      <p className="mt-1.5 truncate text-sm font-medium text-fg" title={c.title}>
        {c.title}
      </p>
      <p className="flex gap-2 truncate text-xs text-muted">
        {c.year != null && <span className="font-mono">{c.year}</span>}
        <span className="truncate">{c.detail}</span>
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <button type="button" onClick={onAdd} disabled={busy} className={`${small} bg-accent font-medium text-accent-fg hover:brightness-95`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          title={skipLabel}
          aria-label={`${skipLabel}: ${c.title}`}
          className={`${small} max-w-9 border border-line text-muted hover:border-accent hover:text-fg`}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

function PromptRow({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
        <span className="text-xs text-faint">{hint}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto overflow-y-hidden px-4 pb-1 sm:gap-4">{children}</div>
    </section>
  )
}

/** Shared add / skip handling for a prompt list kept in the query cache. */
function usePromptActions(queryKey: unknown[], onAnswered?: (c: Candidate) => Promise<unknown>) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const drop = async (c: Candidate) => {
    // A fetch already on its way would bring the answered title back.
    await queryClient.cancelQueries({ queryKey })
    queryClient.setQueryData<CandidateList>(queryKey, (d) => (d ? { ...d, candidates: d.candidates.filter((x) => x.key !== c.key) } : d))
  }
  const add = async (c: Candidate) => {
    setBusy(c.key)
    setError(null)
    try {
      const r = await importCandidates(user!.id, [c], [], () => {})
      if (r.failed.length) throw new Error(`${c.title} couldn’t be added`)
      await onAnswered?.(c)
      await drop(c)
      await queryClient.invalidateQueries({ queryKey: ['library'] })
    } catch (e) {
      setError(plainError(e, 'Couldn’t add that. Try again.'))
    } finally {
      setBusy(null)
    }
  }
  const skip = async (c: Candidate, how: (c: Candidate) => Promise<unknown>) => {
    setBusy(c.key)
    setError(null)
    try {
      await how(c)
      await drop(c)
    } catch {
      setError('Couldn’t save that. Please try again.')
    } finally {
      setBusy(null)
    }
  }
  return { busy, error, add, skip }
}

/** Ongoing Steam sync: "New on Steam — add to On Deck?" (only when switched on in Settings). */
function SteamNewPrompt() {
  const { user } = useAuth()
  const profile = useProfile()
  const on = !!profile.data?.steam_id && !!profile.data?.steam_sync
  const queryKey = ['steam-new', user?.id]
  const q = useQuery({ queryKey, enabled: on, staleTime: 60 * 60_000, retry: false, queryFn: fetchSteamNew })
  const seen = (c: Candidate) => (c.appid ? markSteamSeen([c.appid]) : Promise.resolve())
  const { busy, error, add, skip } = usePromptActions(queryKey, seen)
  const list = q.data?.candidates ?? []
  if (!on || list.length === 0) return null
  return (
    <PromptRow title="New on Steam" hint="Add to On Deck?">
      {list.map((c) => (
        <PromptTile key={c.key} c={c} busy={busy === c.key} onAdd={() => void add(c)} onSkip={() => void skip(c, seen)} skipLabel="No thanks" />
      ))}
      {error && <p className="self-center text-sm text-bad">{error}</p>}
    </PromptRow>
  )
}

/** Recently watched on Plex but not in the library: the latest 5, with the full picker one click away. */
function PlexRecentPrompt() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const plex = usePlexStatus()
  const queryKey = ['plex-recent', user?.id]
  const q = useQuery({ queryKey, enabled: !!plex.data?.linked, staleTime: 30 * 60_000, retry: false, queryFn: fetchPlexRecent })
  // Titles you said "Not interested" to, read again whenever the app comes back to the front: the list above is
  // kept for 30 minutes, and a skip made on another device (or by an earlier visit) must still hide the title here.
  const skipsKey = ['import-skips', user?.id]
  const skips = useQuery({ queryKey: skipsKey, enabled: !!plex.data?.linked, staleTime: 0, refetchOnWindowFocus: true, queryFn: fetchSkips })
  const notInterested = async (c: Candidate) => {
    await skipCandidate(user!.id, c)
    await queryClient.cancelQueries({ queryKey: skipsKey })
    queryClient.setQueryData<Set<string>>(skipsKey, (s) => new Set([...(s ?? []), c.key]))
  }
  const { busy, error, add, skip } = usePromptActions(queryKey)
  const list = (q.data?.candidates ?? []).filter((c) => !skips.data?.has(c.key)).slice(0, PLEX_SHOWN)
  if (!plex.data?.linked || list.length === 0) return null
  return (
    <PromptRow
      title="Watched on Plex"
      hint="Not in your library yet"
      action={
        <Link to="/import/plex" className="text-xs text-muted hover:text-fg">
          More…
        </Link>
      }
    >
      {list.map((c) => (
        <PromptTile
          key={c.key}
          c={c}
          busy={busy === c.key}
          onAdd={() => void add(c)}
          onSkip={() => void skip(c, notInterested)}
          skipLabel="Not interested"
        />
      ))}
      {error && <p className="self-center text-sm text-bad">{error}</p>}
    </PromptRow>
  )
}

/** Home prompts from linked accounts (docs/ROADMAP.md → Group F2). */
export function ImportPrompts() {
  return (
    <>
      <SteamNewPrompt />
      <PlexRecentPrompt />
    </>
  )
}
