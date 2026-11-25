// Settings → Notifications — push, price alerts and default collections.
import { Toggle, buttonClass, Section } from './settingsParts'
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import { friendlyError, useProfile, useUpdateProfile } from '../lib/integrations'
import { BUILTIN_COLLECTIONS } from '../lib/collections'
import { useNavLayout } from '../lib/navLayout'
import { usePush } from '../lib/push'
import { undoable } from '../lib/toast'

export const DEFAULT_DEAL_PCT = 30

/** % off slider for deep-discount alerts. Saves shortly after you stop dragging. */
export function DealThreshold({ value, disabled, onSave }: { value: number; disabled: boolean; onSave: (pct: number) => void }) {
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
      <div className="flex max-w-sm items-baseline justify-between gap-3">
        <label htmlFor="deal-threshold" className="text-xs text-muted">
          Alert at
        </label>
        <span className="text-sm font-medium text-fg tabular-nums">{pct}% off or more</span>
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
      <div className="flex max-w-sm justify-between text-[11px] text-faint tabular-nums">
        <span>10%</span>
        <span>50%</span>
        <span>90%</span>
      </div>
    </div>
  )
}

export type AlertSettings = { price_low?: boolean; deep_discount?: boolean; deep_discount_pct?: number }

export function PushControls() {
  const push = usePush()
  const [tested, setTested] = useState<string | null>(null)
  // Removed devices hide at once; the delete waits for the Undo window to pass.
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const others = push.devices.filter((d) => d.endpoint !== push.endpoint && !hidden.has(d.id))
  const toggleHidden = (id: string, on: boolean) =>
    setHidden((h) => {
      const next = new Set(h)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <p className="text-xs font-medium text-muted">Push notifications</p>
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
          <ul className="space-y-2">
            {others.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  {/* Saved labels read "Windows · Firefox"; shown with a comma like the rest of the app. */}
                  <p className="text-fg">{(d.device ?? 'Device').replace(' · ', ', ')}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {d.ip
                      ? [d.city, d.region ?? d.country].filter(Boolean).concat(d.ip).join(', ')
                      : 'Location shows the next time this device opens On Deck.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    undoable({
                      message: `Removed ${(d.device ?? 'device').replace(' · ', ', ')}`,
                      hide: () => toggleHidden(d.id, true),
                      commit: () => push.removeDevice(d.id),
                      restore: () => toggleHidden(d.id, false),
                    })
                  }
                  className="hit text-xs text-muted hover:text-bad"
                >
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
export function DefaultCollectionsSection() {
  const [layout, save] = useNavLayout()
  const hidden = new Set(layout.hidden ?? [])
  return (
    <Section id="collections" title="Default collections" description="Collections that fill themselves. Hide any you don’t want; you can bring them back here.">
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

export function NotificationsSection() {
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
      id="notifications"
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
          <p className="text-xs font-medium text-muted">Game prices (games you want and don’t own)</p>
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
