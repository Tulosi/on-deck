import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { friendlyError, useProfile, useServiceList, useUpdateProfile } from '../lib/integrations'
import { ShareLinksSettings } from '../components/ShareLinks'
import { PhoneTabsSettings } from '../components/NavSettings'
import { StatusPanel } from '../components/StatusPanel'
import { BackupPanel } from '../components/BackupPanel'
import { useTheme, type Theme } from '../lib/theme'
import { useSlidingIndicator } from '../lib/useSlidingIndicator'
import { inputClass, Section } from './settingsParts'
import { SteamSection, PlexSection } from './SettingsConnections'
import { DefaultCollectionsSection, NotificationsSection } from './SettingsNotifications'

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

/** Region: streaming services listed, and the stores and currency game prices come from. */
function RegionSection() {
  const profile = useProfile()
  const update = useUpdateProfile()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Section id="region" title="Region" description="Decides which streaming services are listed and which stores and currency game prices come from.">
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
      id="streaming"
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
            name="service-search"
            autoComplete="off"
            aria-label="Search streaming services"
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
            {selected.size} selected. Changing your region shows that region’s services. Data by JustWatch.
          </p>
          {error && <p className="text-sm text-bad">{error}</p>}
        </div>
      )}
    </Section>
  )
}

/** "2026-11-23" → "23 Nov 2026" (the commit date; no time zone shift). */
function versionDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const options: { value: Theme; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ]
  const group = useSlidingIndicator<HTMLDivElement>(theme)
  return (
    // Compact, beside the page title: one switch doesn't need a card. Saved on this device.
    <div ref={group} role="radiogroup" aria-label="Theme (saved on this device)" className="relative inline-flex rounded-lg border border-line bg-bg p-1">
        <span aria-hidden="true" className="slide-ind rounded-md bg-raised" />
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={theme === o.value}
            onClick={() => setTheme(o.value)}
            className={clsx(
              'hit relative h-7 rounded-md px-3 text-sm',
              theme === o.value ? 'font-medium text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        ))}
    </div>
  )
}

/** Service checks and background jobs: collapsed, since it's for when something looks wrong. Opens for /settings#status. */
function StatusSection({ open }: { open: boolean }) {
  const [isOpen, setOpen] = useState(open)
  useEffect(() => {
    if (open) setOpen(true)
  }, [open])
  return (
    <details
      id="status"
      open={isOpen}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group scroll-mt-20 border-t border-line pt-5"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md select-none [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-fg">Status</h3>
          <p className="mt-1 text-sm text-muted">Service checks, background jobs, and how fresh your data is.</p>
        </div>
        <ChevronDown className="size-4 flex-none text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      {isOpen && (
        <div className="pt-3">
          <StatusPanel />
        </div>
      )}
    </details>
  )
}

/**
 * Phone tab bar card. Open on phones, where it applies; collapsed on a computer (md and up, where the sidebar shows),
 * unless a link points at it.
 */
function PhoneTabsSection({ open }: { open: boolean }) {
  const [isOpen, setOpen] = useState(() => open || !window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    if (open) setOpen(true)
  }, [open])
  return (
    <details
      id="navigation"
      open={isOpen}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group scroll-mt-20 rounded-lg border border-line bg-surface"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg p-4 select-none sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-fg">Phone tab bar</h2>
          <p className="mt-1 text-sm text-muted">
            Pick up to five pages for the bar at the bottom of your phone; everything else sits under More. On a
            computer, drag the sidebar to rearrange it.
          </p>
        </div>
        <ChevronDown className="size-4 flex-none text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <PhoneTabsSettings />
      </div>
    </details>
  )
}

const JUMPS: [id: string, label: string][] = [
  ['accounts', 'Connections'],
  ['region', 'Region'],
  ['streaming', 'Streaming'],
  ['notifications', 'Notifications'],
  ['collections', 'Collections'],
  ['navigation', 'Phone tab bar'],
  ['data', 'Your data'],
]

/** What each part of Settings does once you're signed in, so signed out isn't a blank page. */
const PREVIEW: [title: string, what: string][] = [
  ['Connections', 'Link Plex to see what’s already on your server, Seerr to request what isn’t, and Steam to bring in your games and playtime.'],
  ['Region and streaming', 'Pick your country and services, so “where to watch” and game prices match what you can use.'],
  ['Notifications', 'New episodes, release days and price drops, sent to this device.'],
  ['Collections', 'Turn the default Waitlist, Early Access and Deals collections on or off.'],
  ['Phone tab bar', 'Choose which pages sit in the bar at the bottom of your phone.'],
  ['Your data', 'Share your list, back it up to a file, or bring one in.'],
]

function SignedOutSettings() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">These are set per account, so they open once you sign in. The theme above works now.</p>
      <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
        {PREVIEW.map(([title, what]) => (
          <div key={title} className="px-4 py-3">
            <dt className="text-sm font-medium text-fg">{title}</dt>
            <dd className="mt-0.5 text-sm text-muted">{what}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Link to="/login" className="flex h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:brightness-105 sm:h-9">
          Sign in
        </Link>
        <Link
          to="/login?mode=sign-up"
          className="flex h-11 items-center rounded-lg border border-line bg-surface px-4 text-sm text-fg hover:border-faint sm:h-9"
        >
          Create an account
        </Link>
      </div>
    </div>
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Settings</h1>
          <p className="mt-1 text-xs text-faint tabular-nums" title={`Build ${__APP_VERSION__.build}, ${__APP_VERSION__.sha}`}>
            v{__APP_VERSION__.build}
            {__APP_VERSION__.date && `, ${versionDate(__APP_VERSION__.date)}`}
          </p>
        </div>
        <ThemeToggle />
      </div>
      {!loading && !user ? (
        <SignedOutSettings />
      ) : (
        <>
          {/* Phones: one row that scrolls sideways. From sm, where most or all of them fit: wrap, so none is cut off. */}
          <nav
            aria-label="Settings sections"
            // On phones the row fades at the right edge, so it's clear there's more to swipe to.
            className="no-scrollbar -mx-4 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)] sm:mx-0 sm:overflow-visible sm:px-0 sm:[mask-image:none]"
          >
            <ul className="flex gap-1 sm:flex-wrap">
              {JUMPS.map(([id, label]) => (
                <li key={id} className="flex-none">
                  <a
                    href={`#${id}`}
                    onClick={(e) => {
                      e.preventDefault()
                      history.replaceState(null, '', `#${id}`)
                      const el = document.getElementById(id)
                      // A collapsed card opens when you jump to it.
                      if (el instanceof HTMLDetailsElement) el.open = true
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                    className="flex h-8 items-center rounded-full border border-line px-2 text-sm whitespace-nowrap text-muted hover:border-accent hover:text-fg"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <Section id="accounts" title="Connections" description="Link the services On Deck checks for you. Each one is optional.">
            <PlexSection />
            <SteamSection />
          </Section>
          <RegionSection />
          <StreamingSection />
          <NotificationsSection />
          <DefaultCollectionsSection />
          <PhoneTabsSection open={hash === '#navigation'} />
          <Section id="data" title="Your data" description="Share your list, keep a copy of it, and check that everything is running.">
            <Section sub id="sharing" title="Sharing">
              <ShareLinksSettings />
            </Section>
            <Section sub id="backup" title="Backup & Restore" description="Save your library, collections and settings to a file, or import one, either added to what you have or replacing it. Account links aren’t included.">
              <BackupPanel onSetUpAccounts={() => document.getElementById('accounts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
            </Section>
            <StatusSection open={hash === '#status'} />
          </Section>
        </>
      )}
    </div>
  )
}
