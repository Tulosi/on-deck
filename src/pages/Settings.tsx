import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
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
import { CalendarFeed } from '../components/CalendarFeed'
import { ShareLinksSettings } from '../components/ShareLinks'
import { PhoneTabsSettings } from '../components/NavSettings'
import { StatusPanel } from '../components/StatusPanel'
import { BackupPanel } from '../components/BackupPanel'
import { BUILTIN_COLLECTIONS } from '../lib/collections'
import { useNavLayout } from '../lib/navLayout'
import { usePush } from '../lib/push'
import { checkSteamOwned, startSteamLogin, steamReplyParams, unlinkSteam, verifySteam } from '../lib/steam'

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
  // Before "Show all": your services plus the 5 most popular others.
  const visible = q || showAll ? matching : matching.slice(0, selected.size + 5)

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

function SteamSection() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const profile = useProfile()
  const updateProfile = useUpdateProfile()
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const handled = useRef(false)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['library', user?.id] }),
    ])

  async function checkLibrary() {
    const r = await checkSteamOwned()
    await refresh()
    if (r.private) {
      setMessage({
        ok: false,
        text: 'Your Steam game details are private, so On Deck can’t see your library. Set Steam → Profile → Edit Profile → Privacy → Game details to Public.',
      })
    } else {
      setMessage({
        ok: true,
        text:
          [
            r.newlyOwned ? `Marked ${r.newlyOwned} game${r.newlyOwned === 1 ? '' : 's'} as In Your Library.` : '',
            r.newlyStarted ? `Moved ${r.newlyStarted} to In Progress (played on Steam).` : '',
          ]
            .filter(Boolean)
            .join(' ') || 'Library checked — nothing new to mark.',
      })
    }
  }

  // Returning from Steam's sign-in page: verify the reply on the server, then tidy the URL.
  useEffect(() => {
    const params = steamReplyParams(location.search)
    if (!params || handled.current) return
    handled.current = true
    navigate('/settings', { replace: true })
    setBusy(true)
    verifySteam(params)
      .then(async (r) => {
        await refresh()
        setMessage({ ok: true, text: `Connected to Steam as ${r.name ?? r.steamId}.` })
        await checkLibrary()
      })
      .catch((err) => setMessage({ ok: false, text: friendlyError(err) }))
      .finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setMessage(null)
    try {
      await fn()
    } catch (err) {
      setMessage({ ok: false, text: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  const linked = !!profile.data?.steam_id
  return (
    <Section
      title="Steam"
      description="Connect Steam so games you own are marked In Your Library, and games you’ve played move to In Progress."
    >
      {profile.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted" />
      ) : linked ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-good">
            <Check className="size-4" /> Connected as {profile.data?.steam_name ?? profile.data?.steam_id}
          </span>
          <button type="button" onClick={() => run(checkLibrary)} disabled={busy} className={buttonClass}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Check Steam library
          </button>
          <Link to="/import/steam" className={primaryButtonClass}>
            Import from Steam…
          </Link>
          <button
            type="button"
            onClick={() =>
              run(async () => {
                await unlinkSteam()
                await refresh()
              })
            }
            disabled={busy}
            className={buttonClass}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button type="button" onClick={startSteamLogin} disabled={busy} className={primaryButtonClass}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Connect Steam
        </button>
      )}
      {linked && (
        <Toggle
          checked={!!profile.data?.steam_sync}
          onChange={(on) =>
            run(async () => {
              // Switching on takes a fresh baseline: only games bought from now on are offered.
              await updateProfile({ steam_sync: on, ...(on ? { steam_seen_appids: null } : {}) })
              await queryClient.invalidateQueries({ queryKey: ['steam-new'] })
            })
          }
          label="Ask about new Steam games"
          hint="When a game you didn’t have before shows up in your Steam library, Home asks whether to add it to On Deck."
        />
      )}
      <p className="text-xs text-faint">
        You sign in on steamcommunity.com — On Deck never sees your Steam password. Your Steam profile’s
        Game details must be Public. Anything you change yourself (In Your Library or Status) is never changed by the check.
      </p>
      {message && <p className={`text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
    </Section>
  )
}

const hostOf = (u: string) => {
  try {
    return new URL(u).host
  } catch {
    return u
  }
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
  const [editingUrl, setEditingUrl] = useState(false)
  const savedUrl = profile.data?.seerr_url ?? null
  const savedHost = savedUrl ? hostOf(savedUrl) : ''
  // Live check of the saved Seerr, so it shows Connected like Plex and Steam do.
  const seerrCheck = useQuery({
    queryKey: ['seerr-test', user?.id, savedUrl],
    enabled: !!savedUrl && !!plex.data?.linked,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () => testSeerr(savedUrl!),
  })

  useEffect(() => {
    if (profile.data) setUrl(profile.data.seerr_url ?? '')
  }, [profile.data])

  async function disconnectSeerr() {
    setMessage(null)
    setUrl('')
    await update({ seerr_url: null })
    setMessage({ ok: true, text: 'Seerr disconnected.' })
  }

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
        queryClient.setQueryData(['seerr-test', user?.id, trimmed], result)
        await update({ seerr_url: trimmed })
        setMessage({ ok: true, text: `Connected to Seerr${result.seerrUser ? ` as ${result.seerrUser}` : ''}.` })
      } else {
        await update({ seerr_url: null })
        setMessage({ ok: true, text: 'Seerr disconnected.' })
      }
      setEditingUrl(false)
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
            <Link to="/import/plex" className={primaryButtonClass}>
              Import from Plex…
            </Link>
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
        <p className="font-mono text-[11px] tracking-wider text-faint uppercase">2 · Seerr</p>
        {savedUrl && !editingUrl ? (
          <div className="flex flex-wrap items-center gap-3">
            {!plex.data?.linked ? (
              <span className="text-sm text-muted">Saved ({savedHost}). Connect Plex to use it.</span>
            ) : seerrCheck.isLoading ? (
              <span className="flex items-center gap-1.5 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" /> Checking {savedHost}…
              </span>
            ) : seerrCheck.data?.ok ? (
              <span className="flex items-center gap-1.5 text-sm text-good">
                <Check className="size-4" /> Connected{seerrCheck.data.seerrUser ? ` as ${seerrCheck.data.seerrUser}` : ''} ·{' '}
                {savedHost}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-bad">
                <X className="size-4" /> {seerrCheck.error ? friendlyError(seerrCheck.error) : 'Couldn’t connect to Seerr.'}
              </span>
            )}
            <button type="button" onClick={() => setEditingUrl(true)} className={buttonClass}>
              Change
            </button>
            <button type="button" onClick={() => void disconnectSeerr()} className={buttonClass}>
              Disconnect
            </button>
          </div>
        ) : (
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
            {savedUrl && (
              <button
                type="button"
                onClick={() => {
                  setUrl(savedUrl)
                  setEditingUrl(false)
                }}
                className={buttonClass}
              >
                Cancel
              </button>
            )}
          </div>
        )}
        <p className="text-xs text-faint">Overseerr, Jellyseerr or Seerr — it must be reachable over https.</p>
      </div>

      {message && <p className={`text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
    </Section>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
      />
      <span>
        <span className="block text-sm text-fg">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  )
}

const DEFAULT_DEAL_PCT = 30

/** % off slider for deep-discount alerts. Saves shortly after you stop dragging. */
function DealThreshold({ value, disabled, onSave }: { value: number; disabled: boolean; onSave: (pct: number) => void }) {
  const [pct, setPct] = useState(value)
  const saved = useRef(value)
  useEffect(() => {
    setPct(value)
    saved.current = value
  }, [value])
  useEffect(() => {
    if (pct === saved.current) return
    const t = setTimeout(() => {
      saved.current = pct
      onSave(pct)
    }, 600)
    return () => clearTimeout(t)
  }, [pct, onSave])
  return (
    <div className={clsx('ml-7 space-y-1.5', disabled && 'opacity-50')}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="deal-threshold" className="text-xs text-muted">
          Alert at
        </label>
        <span className="font-mono text-sm font-semibold text-fg">{pct}% off or more</span>
      </div>
      <input
        id="deal-threshold"
        type="range"
        min={10}
        max={90}
        step={5}
        value={pct}
        disabled={disabled}
        onChange={(e) => setPct(Number(e.target.value))}
        aria-valuetext={`${pct}% off or more`}
        className="w-full max-w-sm accent-[var(--color-accent)]"
      />
      <div className="flex max-w-sm justify-between font-mono text-[11px] text-faint">
        <span>10%</span>
        <span>50%</span>
        <span>90%</span>
      </div>
    </div>
  )
}

type AlertSettings = { price_low?: boolean; deep_discount?: boolean; deep_discount_pct?: number }

function PushControls() {
  const push = usePush()
  const [tested, setTested] = useState<string | null>(null)
  const others = push.devices.filter((d) => d.endpoint !== push.endpoint)
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <p className="font-mono text-[11px] tracking-wider text-faint uppercase">Push notifications</p>
      {push.support === 'ios-needs-home-screen' ? (
        <p className="text-sm text-muted">
          On iPhone and iPad, push works from the home-screen app: in Safari tap Share → <b>Add to Home Screen</b>, open
          On Deck from there, then turn this on. (iOS 16.4 or later.)
        </p>
      ) : push.support === 'unsupported' ? (
        <p className="text-sm text-muted">This browser doesn’t support push notifications. Alerts still appear under the bell.</p>
      ) : (
        <>
          <Toggle
            checked={push.enabled}
            onChange={(v) => void (v ? push.enable() : push.disable())}
            label="Push to this device"
            hint="Alerts also pop up on this phone or computer, even when On Deck is closed."
          />
          {push.enabled && (
            <div className="ml-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={buttonClass}
                onClick={async () => {
                  setTested(null)
                  const r = await push.test()
                  if (r) setTested(r.sent > 0 ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}.` : 'No device accepted it.')
                }}
              >
                Send a test
              </button>
              {tested && <span className="text-xs text-muted">{tested}</span>}
            </div>
          )}
          {push.busy && <Loader2 className="ml-7 size-4 animate-spin text-muted" />}
        </>
      )}
      {others.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted">Also receiving push:</p>
          <ul className="space-y-1">
            {others.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-fg">{d.device ?? 'Device'}</span>
                <button type="button" onClick={() => void push.removeDevice(d.id)} className="text-xs text-muted hover:text-bad">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {push.error && <p className="text-sm text-bad">{push.error}</p>}
      {push.error && push.detail && <p className="font-mono text-[11px] text-faint">{push.detail}</p>}
    </div>
  )
}

/** Default collections (Waitlist, Early Access, Deals): show or hide each one. */
function DefaultCollectionsSection() {
  const [layout, save] = useNavLayout()
  const hidden = new Set(layout.hidden ?? [])
  return (
    <Section title="Collections" description="Default collections that update themselves. Hide any you don't want; they come back here.">
      <div className="space-y-3">
        {BUILTIN_COLLECTIONS.map((c) => (
          <Toggle
            key={c.id}
            checked={!hidden.has(c.id)}
            onChange={(on) => {
              const next = new Set(hidden)
              if (on) next.delete(c.id)
              else next.add(c.id)
              save('hidden', [...next])
            }}
            label={c.name}
            hint={c.description ?? ''}
          />
        ))}
      </div>
    </Section>
  )
}

function NotificationsSection() {
  const profile = useProfile()
  const update = useUpdateProfile()
  const [error, setError] = useState<string | null>(null)
  const settings: AlertSettings = profile.data?.alert_settings ?? {}
  const latest = useRef(settings)
  latest.current = settings
  const set = async (patch: AlertSettings) => {
    setError(null)
    try {
      await update({ alert_settings: { ...latest.current, ...patch } })
    } catch (err) {
      setError(friendlyError(err))
    }
  }
  // Stable, so the slider's save timer isn't reset on every render.
  const saveDealPct = useCallback((pct: number) => void set({ deep_discount_pct: pct }), [])
  return (
    <Section
      title="Notifications"
      description="Alerts appear under the bell in the top bar, checked every few hours. Turn them off for a single title on its page."
    >
      {profile.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted" />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Always on: release days, one week before, date changes, new seasons, and when something you want lands
            on Plex or your services.
          </p>
          <p className="font-mono text-[11px] tracking-wider text-faint uppercase">Game prices (games you want and don’t own)</p>
          <Toggle
            checked={settings.price_low !== false}
            onChange={(v) => set({ price_low: v })}
            label="Lowest price ever"
            hint="When a game hits its all-time low."
          />
          <Toggle
            checked={settings.deep_discount !== false}
            onChange={(v) => set({ deep_discount: v })}
            label="Deep discounts"
            hint="When a game is on a big sale, measured against Steam’s full price. Once per sale, or again if it drops further."
          />
          <DealThreshold
            value={settings.deep_discount_pct ?? DEFAULT_DEAL_PCT}
            disabled={settings.deep_discount === false}
            onSave={saveDealPct}
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          <PushControls />
        </div>
      )}
    </Section>
  )
}

export function Settings() {
  const { user, loading } = useAuth()
  const { hash } = useLocation()
  // Links like /settings#navigation jump to that section once the page has rendered.
  useEffect(() => {
    if (!hash || loading) return
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    return () => clearTimeout(t)
  }, [hash, loading])

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
          <div id="accounts" className="scroll-mt-20 space-y-6">
            <PlexSection />
            <SteamSection />
          </div>
          <StreamingSection />
          <NotificationsSection />
          <DefaultCollectionsSection />
          <section id="navigation" className="scroll-mt-20">
            <Section
              title="Navigation"
              description="Choose the tabs on your phone’s bottom bar and their order. On a computer, drag the sidebar to rearrange it."
            >
              <PhoneTabsSettings />
            </Section>
          </section>
          <section id="calendar" className="rounded-xl border border-line bg-surface p-5">
            <CalendarFeed />
          </section>
          <section id="status" className="scroll-mt-20">
            <Section title="Status" description="Is everything working? Service checks, background jobs, and how fresh your data is.">
              <StatusPanel />
            </Section>
          </section>
          <section id="backup" className="scroll-mt-20">
            <Section title="Backup & Restore" description="Export your library and settings to a file, or restore from one (it merges).">
              <BackupPanel onSetUpAccounts={() => document.getElementById('accounts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
            </Section>
          </section>
          <Section title="Sharing">
            <ShareLinksSettings />
          </Section>
        </>
      )}
    </div>
  )
}
