// Web Push on this device: subscribe / unsubscribe and save the subscription (push_subscriptions).
// The server side is supabase/functions/_shared/push.ts; the handler is public/push-sw.js.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'

/** VAPID public key (public by design; the private key is a Supabase secret). */
export const VAPID_PUBLIC_KEY = 'BPvzzG70nvYgf9eHNy4BEu_-1AQDD9heOiWbd91E1IgY24UXV-0SbAfIVjAJhOeEfNcGbTO7Q9ALJgxqXj-HH-0'

const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

export type PushSupport =
  | 'supported'
  | 'ios-needs-home-screen' // iPhone/iPad Safari: only works from the home-screen app (iOS 16.4+)
  | 'unsupported'

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported'
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (ios && !standalone) return 'ios-needs-home-screen'
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'supported' : 'unsupported'
}

/** "iPhone · Safari", "Mac · Chrome" … for the device list. */
function deviceLabel(): string {
  const ua = navigator.userAgent
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Device'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'
  return `${os} · ${browser}`
}

/** Brave exposes navigator.brave.isBrave(); its user agent looks like Chrome. */
async function isBrave(): Promise<boolean> {
  try {
    const b = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave
    return !!(await b?.isBrave?.())
  } catch {
    return false
  }
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // The service worker only exists in the built app (not the dev server); don't wait forever.
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('no_service_worker')), 8000)),
  ])
  return reg
}

export interface PushDevice {
  id: string
  endpoint: string
  device: string | null
  createdAt: string
  lastPushAt: string | null
}

/** This device's push state plus the user's other devices. */
export function usePush() {
  const { user } = useAuth()
  const [support] = useState(pushSupport)
  const [enabled, setEnabled] = useState(false)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Technical detail for the error (browser's own message), shown small under it. */
  const [detail, setDetail] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user || !supabase) return
    const { data } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, device, created_at, last_push_at')
      .order('created_at', { ascending: false })
    const list = (data ?? []).map((d) => ({
      id: d.id as string,
      endpoint: d.endpoint as string,
      device: d.device as string | null,
      createdAt: d.created_at as string,
      lastPushAt: d.last_push_at as string | null,
    }))
    setDevices(list)
    if (support !== 'supported') return
    try {
      const reg = await registration()
      const sub = await reg.pushManager.getSubscription()
      setEndpoint(sub?.endpoint ?? null)
      setEnabled(!!sub && Notification.permission === 'granted' && list.some((d) => d.endpoint === sub.endpoint))
    } catch {
      setEnabled(false)
    }
  }, [user, support])

  useEffect(() => {
    void load()
  }, [load])

  const enable = async () => {
    setError(null)
    setDetail(null)
    setBusy(true)
    const brave = await isBrave()
    const android = /Android/.test(navigator.userAgent)
    const browser = brave ? 'Brave' : 'your browser'
    try {
      // 1. Permission (asks only if it hasn't been decided yet).
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') {
        setDetail(`Notification permission: ${permission}`)
        setError(
          android
            ? `${brave ? 'Brave' : 'The browser'} reports notifications as blocked. Check both: this site's permission (tap the icon left of the address → Permissions/Notifications → Allow), and Android Settings → Apps → ${brave ? 'Brave' : 'your browser'} → Notifications → on. Then try again.`
            : `Notifications are blocked for this site. Allow them in ${browser}'s site settings (the icon left of the address), then try again.`,
        )
        return
      }

      // 2. Service worker (only on the live site / installed app).
      let reg: ServiceWorkerRegistration
      try {
        reg = await registration()
      } catch {
        setError('Push needs the installed app or the live site (it doesn’t work on the local dev server).')
        return
      }

      // 3. Subscribe with the browser's push service.
      let sub: PushSubscription
      try {
        sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(VAPID_PUBLIC_KEY) }))
      } catch (err) {
        const e = err as DOMException
        setDetail(`${e?.name ?? 'Error'}: ${e?.message ?? String(err)}`)
        setError(
          brave
            ? 'Brave blocks web push by default. In Brave, open Settings → Privacy and security → turn on “Use Google services for push messaging”, restart Brave, then try again.'
            : 'Notifications are allowed, but the browser’s push service refused to register this device. Check that push isn’t disabled in your browser’s privacy settings, then try again.',
        )
        return
      }

      // 4. Save it.
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      const { error: insertError } = await supabase!.from('push_subscriptions').insert({
        user_id: user!.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        device: `${deviceLabel()}${brave ? ' (Brave)' : ''}`,
      })
      // Already saved (same endpoint) is fine.
      if (insertError && insertError.code !== '23505') {
        setDetail(insertError.message)
        setError('Couldn’t save this device. Please try again.')
        return
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setError(null)
    setBusy(true)
    try {
      const reg = await registration().catch(() => null)
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await supabase!.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  const removeDevice = async (id: string) => {
    await supabase!.from('push_subscriptions').delete().eq('id', id)
    await load()
  }

  const test = async (): Promise<{ sent: number; devices: number } | null> => {
    setError(null)
    const { data, error: fnError } = await supabase!.functions.invoke('push', { body: { action: 'test' } })
    if (fnError) {
      setError('Couldn’t send a test notification.')
      return null
    }
    return data as { sent: number; devices: number }
  }

  return { support, enabled, endpoint, devices, busy, error, detail, enable, disable, removeDevice, test }
}
