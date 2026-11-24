import { useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Check, ExternalLink, Loader2, Plus, Server } from 'lucide-react'
import {
  friendlyError,
  useProfile,
  useProviders,
  useRequestOnSeerr,
  useSeerrStatus,
  type Provider,
  type SeasonInfo,
  type SeerrStatus,
} from '../lib/integrations'
import type { Title } from '../types'

const plexCopy: Record<SeerrStatus, { label: string; tone: string }> = {
  available: { label: 'On your Plex', tone: 'text-good' },
  partial: { label: 'Partly on your Plex', tone: 'text-good' },
  processing: { label: 'Requested', tone: 'text-info' }, // approved; "— downloading" added only when one is active
  pending: { label: 'Requested, awaiting approval', tone: 'text-info' },
  missing: { label: 'Not on your Plex', tone: 'text-muted' },
}

function PlexRow({ title }: { title: Title }) {
  const seerr = useSeerrStatus(title)
  const request = useRequestOnSeerr(title)
  const [requesting, setRequesting] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const box = 'flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3'
  const icon = <Server className="size-5 shrink-0 text-accent-ink" strokeWidth={1.75} />

  if (seerr.isLoading) {
    return (
      <div className={box}>
        {icon}
        <span className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Checking your Plex…
        </span>
      </div>
    )
  }

  // Not set up: a quiet prompt rather than an error.
  if (seerr.data && !seerr.data.configured) {
    return (
      <div className={box}>
        {icon}
        <span className="text-sm text-muted">
          <Link to="/settings" className="text-accent-ink hover:underline">
            Connect Plex &amp; Seerr
          </Link>{' '}
          to see if this is on your Plex and request it if not.
        </span>
      </div>
    )
  }

  if (seerr.error || !seerr.data) {
    return (
      <div className={box}>
        {icon}
        <span className="text-sm text-bad">{friendlyError(seerr.error)}</span>
        <button type="button" onClick={() => seerr.refetch()} className="text-sm text-muted hover:text-fg">
          Retry
        </button>
      </div>
    )
  }

  const { status, requested, plexUrl, seerrUrl, seasons } = seerr.data
  const onPlex = status === 'available' || status === 'partial'
  const copy =
    status === 'processing' && seerr.data.downloading
      ? { label: 'Requested, downloading', tone: 'text-info' }
      : plexCopy[status]
  // TV decides per season; movies by overall state.
  const canRequest = seasons ? !!seerr.data.canRequest : (status === 'missing' || status === 'partial') && !requested

  async function doRequest(chosen?: number[]) {
    setRequesting(true)
    setError(null)
    try {
      await request(chosen)
      setPicking(false)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setRequesting(false)
    }
  }

  // One clear secondary line, and a "Requested" badge only when there's nothing left to request.
  const someSeasonsRequested = !!seasons?.some((s) => s.requested)
  const note = seasons
    ? someSeasonsRequested && canRequest
      ? 'Some seasons requested'
      : status === 'partial' && requested
        ? 'The rest has been requested'
        : null
    : null
  // Nothing left to request and not fully on Plex → say so, rather than leaving the user wondering.
  const showRequestedBadge = !canRequest && status !== 'available' && status !== 'pending' && status !== 'processing'
  const pill = 'flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs'

  return (
    <div className="space-y-2">
      <div className={box}>
        {/* Status keeps a minimum width; when space runs out the action group wraps below it as a unit. */}
        <div className="flex min-w-[12rem] flex-1 items-center gap-3">
          {icon}
          <div className="min-w-0">
            <p className={clsx('flex items-center gap-1.5 text-sm font-medium', copy.tone)}>
              {onPlex && <Check className="size-4 shrink-0" />}
              {copy.label}
            </p>
            {note && <p className="text-xs text-info">{note}</p>}
            {error && <p className="text-xs text-bad">{error}</p>}
          </div>
        </div>
        {(onPlex && plexUrl) || seerrUrl || showRequestedBadge || canRequest ? (
          <div className="flex flex-wrap items-center gap-2">
            {onPlex && plexUrl && (
              <a
                href={plexUrl}
                target="_blank"
                rel="noreferrer"
                className={`${pill} border border-line text-fg hover:border-accent`}
              >
                Open in Plex <ExternalLink className="size-3.5" />
              </a>
            )}
            {seerrUrl && (
              <a
                href={seerrUrl}
                target="_blank"
                rel="noreferrer"
                className={`${pill} border border-line text-fg hover:border-accent`}
              >
                Open in Seerr <ExternalLink className="size-3.5" />
              </a>
            )}
            {showRequestedBadge && (
              <span className={`${pill} border border-line text-info`}>
                <Check className="size-3.5" /> Already Requested
              </span>
            )}
            {canRequest && (
              <button
                type="button"
                onClick={() => (seasons ? setPicking((p) => !p) : doRequest())}
                disabled={requesting}
                aria-expanded={seasons ? picking : undefined}
                className={`${pill} bg-accent font-medium text-accent-fg hover:brightness-95 disabled:opacity-60`}
              >
                {requesting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                {seasons ? 'Request seasons' : 'Request on Seerr'}
              </button>
            )}
          </div>
        ) : null}
      </div>
    {seasons && picking && (
      <SeasonPicker seasons={seasons} busy={requesting} onCancel={() => setPicking(false)} onRequest={doRequest} />
    )}
    </div>
  )
}

const seasonState = (s: SeasonInfo) =>
  s.status === 'available'
    ? { label: 'On Plex', tone: 'text-good' }
    : s.requested
      ? { label: 'Requested', tone: 'text-info' }
      : s.status === 'partial'
        ? { label: 'Partly on Plex', tone: 'text-good' }
        : null

/** Pick which TV seasons to request — like Seerr's own dialog: individual seasons or all missing ones. */
function SeasonPicker({
  seasons,
  busy,
  onCancel,
  onRequest,
}: {
  seasons: SeasonInfo[]
  busy: boolean
  onCancel: () => void
  onRequest: (seasons: number[]) => void
}) {
  const open = seasons.filter((s) => s.requestable)
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(open.map((s) => s.number)))
  const allChosen = open.length > 0 && open.every((s) => chosen.has(s.number))

  const toggle = (n: number) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <label className="flex items-center gap-3 border-b border-line px-1 pb-2.5 text-sm font-medium text-fg">
        <input
          type="checkbox"
          checked={allChosen}
          onChange={() => setChosen(allChosen ? new Set() : new Set(open.map((s) => s.number)))}
          className="size-4 accent-[var(--od-accent)]"
        />
        All missing seasons
        <span className="font-mono text-xs text-faint">{open.length}</span>
      </label>
      <ul className="max-h-72 overflow-y-auto overscroll-contain py-1">
        {seasons.map((s) => {
          const state = seasonState(s)
          const selectable = open.some((o) => o.number === s.number)
          return (
            <li key={s.number}>
              <label
                className={clsx(
                  'flex items-center gap-3 rounded-md px-1 py-1.5 text-sm',
                  selectable ? 'cursor-pointer text-fg hover:bg-raised/60' : 'text-muted',
                )}
              >
                <input
                  type="checkbox"
                  disabled={!selectable}
                  checked={selectable ? chosen.has(s.number) : true}
                  onChange={() => toggle(s.number)}
                  className="size-4 accent-[var(--od-accent)] disabled:opacity-40"
                />
                <span className="flex-1 truncate">{s.name}</span>
                {s.episodes != null && <span className="font-mono text-xs text-faint">{s.episodes} ep</span>}
                {state && <span className={clsx('w-24 text-right text-xs', state.tone)}>{state.label}</span>}
                {!state && <span className="w-24" />}
              </label>
            </li>
          )
        })}
      </ul>
      <div className="flex justify-end gap-2 border-t border-line pt-2.5">
        <button type="button" onClick={onCancel} className="h-8 rounded-md px-3 text-xs text-muted hover:text-fg">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || chosen.size === 0}
          onClick={() => onRequest([...chosen].sort((a, b) => a - b))}
          className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg hover:brightness-95 disabled:opacity-60"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Request {chosen.size} {chosen.size === 1 ? 'season' : 'seasons'}
        </button>
      </div>
    </div>
  )
}

function ProviderList({ label, providers }: { label: string; providers: Provider[] }) {
  if (providers.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <ul className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <li
            key={p.name}
            className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface pr-3 pl-1.5 text-sm text-fg"
          >
            {p.logoUrl ? (
              <img src={p.logoUrl} alt="" loading="lazy" className="size-7 rounded-md" />
            ) : (
              <span className="size-7 rounded-md bg-raised" />
            )}
            {p.name}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Title page section: Plex first (via the user's Seerr), then the streaming services they opted in to. */
export function WhereToWatch({ title }: { title: Title }) {
  const providers = useProviders(title)
  const profile = useProfile()
  const mine = new Set(profile.data?.streaming_services ?? [])
  const data = providers.data
  const stream = data?.stream.filter((p) => mine.has(p.name)) ?? []
  const free = data?.free.filter((p) => mine.has(p.name)) ?? []

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight text-fg">Where to watch</h2>
      <PlexRow title={title} />

      {mine.size === 0 && profile.isSuccess ? (
        <p className="text-sm text-muted">
          <Link to="/settings" className="text-accent-ink hover:underline">
            Choose your streaming services
          </Link>{' '}
          to see which of them have this.
        </p>
      ) : providers.isLoading || profile.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Checking your streaming services…
        </p>
      ) : providers.error ? (
        <p className="text-sm text-bad">Couldn’t load streaming services: {friendlyError(providers.error)}</p>
      ) : data ? (
        <div className="space-y-4">
          {stream.length + free.length === 0 ? (
            <p className="text-sm text-muted">Not on any of your streaming services right now.</p>
          ) : (
            <>
              <ProviderList label="On your services" providers={stream} />
              <ProviderList label="Free on your services" providers={free} />
            </>
          )}
          <p className="text-xs text-faint">
            Region {data.country}.{' '}
            <Link to="/settings" className="hover:text-fg hover:underline">
              Your services
            </Link>
            .{' '}
            {data.link && (
              <>
                <a href={data.link} target="_blank" rel="noreferrer" className="hover:text-fg hover:underline">
                  All options
                </a>
                .{' '}
              </>
            )}
            Streaming data by{' '}
            <a href="https://www.justwatch.com" target="_blank" rel="noreferrer" className="hover:text-fg hover:underline">
              JustWatch
            </a>.
          </p>
        </div>
      ) : null}
    </section>
  )
}
