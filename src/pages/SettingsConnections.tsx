// Settings → Connections — Steam, Plex and Seerr.
import { Section, buttonClass, primaryButtonClass, Toggle, inputClass } from './settingsParts'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { friendlyError, linkPlex, testSeerr, unlinkPlex, usePlexStatus, useProfile, useUpdateProfile } from '../lib/integrations'
import { checkSteamOwned, startSteamLogin, steamReplyParams, unlinkSteam, verifySteam } from '../lib/steam'

export function SteamSection() {
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
            r.newlyOwned ? `Marked ${r.newlyOwned} game${r.newlyOwned === 1 ? '' : 's'} as In your library.` : '',
            r.newlyStarted ? `Moved ${r.newlyStarted} to In progress (played on Steam).` : '',
          ]
            .filter(Boolean)
            .join(' ') || 'Library checked. Nothing new to mark.',
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
      sub
      title="Steam"
      description="Connect Steam so games you own are marked In your library, and games you’ve played move to In progress."
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
        You sign in on steamcommunity.com, so On Deck never sees your Steam password. Your Steam profile’s
        Game details must be Public. Anything you change yourself (In your library or Status) is never changed by the check.
      </p>
      {message && <p className={`text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
    </Section>
  )
}

export const hostOf = (u: string) => {
  try {
    return new URL(u).host
  } catch {
    return u
  }
}

export function PlexSection() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const plex = usePlexStatus()
  const profile = useProfile()
  const update = useUpdateProfile()
  const [linking, setLinking] = useState(false)
  const abort = useRef<AbortController | null>(null)
  // What you've typed; until you type, the box shows the saved address. (Copying the saved one in with an effect
  // would wipe your typing whenever the profile reloads, e.g. after saving another setting.)
  const [draft, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ on: 'plex' | 'seerr'; ok: boolean; text: string } | null>(null)
  const [editingUrl, setEditingUrl] = useState(false)
  const savedUrl = profile.data?.seerr_url ?? null
  const savedHost = savedUrl ? hostOf(savedUrl) : ''
  const url = draft ?? savedUrl ?? ''
  // Live check of the saved Seerr, so it shows Connected like Plex and Steam do.
  const seerrCheck = useQuery({
    queryKey: ['seerr-test', user?.id, savedUrl],
    enabled: !!savedUrl && !!plex.data?.linked,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () => testSeerr(savedUrl!),
  })

  async function disconnectSeerr() {
    setMessage(null)
    setUrl('')
    await update({ seerr_url: null })
    setMessage({ on: 'seerr', ok: true, text: 'Seerr disconnected.' })
  }

  const refreshPlex = () => queryClient.invalidateQueries({ queryKey: ['plex', user?.id] })

  async function connect() {
    setMessage(null)
    setLinking(true)
    abort.current = new AbortController()
    try {
      const result = await linkPlex(abort.current.signal)
      setMessage({ on: 'plex', ok: true, text: `Connected to Plex as ${result.username ?? 'your account'}.` })
    } catch (err) {
      if (!(err instanceof Error && err.message === 'cancelled')) setMessage({ on: 'plex', ok: false, text: friendlyError(err) })
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
        setMessage({ on: 'seerr', ok: true, text: `Connected to Seerr${result.seerrUser ? ` as ${result.seerrUser}` : ''}.` })
      } else {
        await update({ seerr_url: null })
        setMessage({ on: 'seerr', ok: true, text: 'Seerr disconnected.' })
      }
      setEditingUrl(false)
    } catch (err) {
      setMessage({ on: 'seerr', ok: false, text: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <Section sub title="Plex" description="See whether a movie or show is already on your Plex server.">
      <div className="space-y-2">
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
        <p className="text-xs text-faint">You sign in on plex.tv, so On Deck never sees your Plex password.</p>
      </div>
      {message?.on === 'plex' && <p className={`text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
    </Section>

    <Section sub title="Seerr" description="Request movies and shows that aren’t on your Plex yet. Needs Plex connected.">
      <div className="space-y-2">
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
                <Check className="size-4" /> Connected{seerrCheck.data.seerrUser ? ` as ${seerrCheck.data.seerrUser}` : ''}, {savedHost}
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
              name="seerr-url"
              autoComplete="off"
              aria-label="Seerr address"
              placeholder="https://requests.example.com…"
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
        <p className="text-xs text-faint">Overseerr, Jellyseerr or Seerr. It must be reachable over https.</p>
      </div>
      {message?.on === 'seerr' && <p className={`text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
    </Section>
    </>
  )
}
