import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { ComingSoon, PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import {
  friendlyError,
  linkPlex,
  testSeerr,
  unlinkPlex,
  usePlexStatus,
  useProfile,
  useServiceList,
  useUpdateProfile,
} from '../lib/integrations'

// Regions offered for streaming availability (and, later, game prices).
const COUNTRIES = [
  'US', 'CA', 'GB', 'IE', 'AU', 'NZ', 'DE', 'AT', 'CH', 'FR', 'BE', 'NL', 'ES', 'PT', 'IT',
  'SE', 'NO', 'DK', 'FI', 'PL', 'BR', 'MX', 'AR', 'IN', 'JP', 'KR', 'SG', 'ZA',
]
const regionName = (() => {
  try {
    const names = new Intl.DisplayNames(undefined, { type: 'region' })
    return (code: string) => names.of(code) ?? code
  } catch {
    return (code: string) => code
  }
})()

const inputClass =
  'h-9 rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint focus:border-accent'
const buttonClass =
  'flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-fg hover:border-accent disabled:opacity-60'
const primaryButtonClass =
  'flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:brightness-95 disabled:opacity-60'

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function RegionSection() {
  const profile = useProfile()
  const update = useUpdateProfile()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Section title="Region" description="Used for streaming services (and game prices, later).">
      {profile.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted" />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Region"
            value={profile.data?.country_code ?? 'US'}
            onChange={async (e) => {
              setError(null)
              setSaved(false)
              try {
                await update({ country_code: e.target.value })
                setSaved(true)
              } catch (err) {
                setError(friendlyError(err))
              }
            }}
            className={inputClass}
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {regionName(c)}
              </option>
            ))}
          </select>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-good">
              <Check className="size-4" /> Saved
            </span>
          )}
          {error && <span className="text-sm text-bad">{error}</span>}
        </div>
      )}
    </Section>
  )
}

function StreamingSection() {
  const profile = useProfile()
  const update = useUpdateProfile()
  const country = profile.data?.country_code
  const list = useServiceList(country)
  const [filter, setFilter] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = new Set(profile.data?.streaming_services ?? [])

  async function toggle(name: string) {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setError(null)
    try {
      await update({ streaming_services: [...next].sort() })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  const services = list.data?.services ?? []
  const q = filter.trim().toLowerCase()
  // Your services first, then the most popular in your region.
  const ordered = [...services.filter((s) => selected.has(s.name)), ...services.filter((s) => !selected.has(s.name))]
  const matching = q ? ordered.filter((s) => s.name.toLowerCase().includes(q)) : ordered
  const visible = q || showAll ? matching : matching.slice(0, Math.max(24, selected.size))

  return (
    <Section
      title="Streaming services"
      description="Pick the services you have. Title pages show where to watch on these only."
    >
      {profile.isLoading || list.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted" />
      ) : list.error ? (
        <p className="text-sm text-bad">Couldn’t load services: {friendlyError(list.error)}</p>
      ) : (
        <div className="space-y-3">
          <input
            type="search"
            placeholder={`Search ${services.length} services in ${country ? regionName(country) : 'your region'}…`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={`${inputClass} w-full`}
          />
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visible.map((s) => {
              const on = selected.has(s.name)
              return (
                <li key={s.name}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(s.name)}
                    className={`flex h-11 w-full items-center gap-3 rounded-lg border px-2 text-left text-sm transition-colors ${
                      on ? 'border-accent bg-raised text-fg' : 'border-line text-muted hover:border-faint hover:text-fg'
                    }`}
                  >
                    {s.logoUrl ? (
                      <img src={s.logoUrl} alt="" loading="lazy" className="size-7 rounded-md" />
                    ) : (
                      <span className="size-7 rounded-md bg-raised" />
                    )}
                    <span className="flex-1 truncate">{s.name}</span>
                    {on && <Check className="size-4 text-accent-ink" />}
                  </button>
                </li>
              )
            })}
          </ul>
          {!q && matching.length > visible.length && (
            <button type="button" onClick={() => setShowAll(true)} className="text-sm text-muted hover:text-fg">
              Show all {matching.length}
            </button>
          )}
          <p className="text-xs text-faint">
            {selected.size} selected · Changing your region shows that region’s services. Data by JustWatch.
          </p>
          {error && <p className="text-sm text-bad">{error}</p>}
        </div>
      )}
    </Section>
  )
}

function PlexSection() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const plex = usePlexStatus()
  const profile = useProfile()
  const update = useUpdateProfile()
  const [linking, setLinking] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (profile.data) setUrl(profile.data.seerr_url ?? '')
  }, [profile.data])

  const refreshPlex = () => queryClient.invalidateQueries({ queryKey: ['plex', user?.id] })

  async function connect() {
    setMessage(null)
    setLinking(true)
    abort.current = new AbortController()
    try {
      const result = await linkPlex(abort.current.signal)
      setMessage({ ok: true, text: `Connected to Plex as ${result.username ?? 'your account'}.` })
    } catch (err) {
      if (!(err instanceof Error && err.message === 'cancelled')) setMessage({ ok: false, text: friendlyError(err) })
    } finally {
      setLinking(false)
      await refreshPlex()
    }
  }

  async function disconnect() {
    setMessage(null)
    await unlinkPlex()
    await refreshPlex()
    await queryClient.invalidateQueries({ queryKey: ['seerr'] })
  }

  async function saveUrl() {
    setBusy(true)
    setMessage(null)
    const trimmed = url.trim().replace(/\/+$/, '')
    try {
      if (trimmed) {
        if (!plex.data?.linked) throw new Error('plex_not_linked')
        const result = await testSeerr(trimmed)
        await update({ seerr_url: trimmed })
        setMessage({ ok: true, text: `Connected to Seerr${result.seerrUser ? ` as ${result.seerrUser}` : ''}.` })
      } else {
        await update({ seerr_url: null })
        setMessage({ ok: true, text: 'Seerr URL removed.' })
      }
    } catch (err) {
      setMessage({ ok: false, text: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title="Plex & Seerr"
      description="See whether a movie or show is already on your Plex, and request it through Seerr if it isn’t."
    >
      <div className="space-y-2">
        <p className="font-mono text-[11px] tracking-wider text-faint uppercase">1 · Plex account</p>
        {plex.isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted" />
        ) : plex.data?.linked ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-good">
              <Check className="size-4" /> Connected{plex.data.username ? ` as ${plex.data.username}` : ''}
            </span>
            <button type="button" onClick={disconnect} className={buttonClass}>
              Disconnect
            </button>
          </div>
        ) : linking ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Waiting for you to approve On Deck in the Plex window…
            <button type="button" onClick={() => abort.current?.abort()} className={buttonClass}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={connect} className={primaryButtonClass}>
            Connect Plex
          </button>
        )}
        <p className="text-xs text-faint">You sign in on plex.tv — On Deck never sees your Plex password.</p>
      </div>

      <div className="space-y-2 pt-2">
        <p className="font-mono text-[11px] tracking-wider text-faint uppercase">2 · Seerr URL</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            inputMode="url"
            placeholder="https://requests.example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button type="button" onClick={saveUrl} disabled={busy || profile.isLoading} className={buttonClass}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Save &amp; test
          </button>
        </div>
        <p className="text-xs text-faint">Overseerr, Jellyseerr or Seerr — it must be reachable over https.</p>
      </div>

      {message && <p className={`text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
    </Section>
  )
}

export function Settings() {
  const { user, loading } = useAuth()

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" />
      {!loading && !user ? (
        <p className="text-sm text-muted">
          <Link to="/login" className="text-accent-ink hover:underline">
            Sign in
          </Link>{' '}
          to change your settings.
        </p>
      ) : (
        <>
          <RegionSection />
          <PlexSection />
          <StreamingSection />
          <Section title="Sharing">
            <ComingSoon>Create and revoke read-only share links for your library, a category or a collection.</ComingSoon>
          </Section>
        </>
      )}
    </div>
  )
}
