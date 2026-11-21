// Sends Web Push messages to all of a user's devices (push_subscriptions), and cleans up dead subscriptions.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sendPush, type VapidKeys } from './webpush.ts'

export interface PushMessage {
  title: string
  body: string
  /** App path to open on tap, relative to the app (e.g. "title/<id>"). */
  url?: string
  /** Same tag = replaces the earlier notification on the device. */
  tag?: string
}

let cached: VapidKeys | null | undefined
/** VAPID keys from secrets, or null when push isn't configured. */
export function vapidKeys(): VapidKeys | null {
  if (cached !== undefined) return cached
  try {
    const privateJwk = JSON.parse(Deno.env.get('VAPID_PRIVATE_JWK') ?? 'null')
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    cached = privateJwk && publicKey ? { privateJwk, publicKey, subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://tulosi.github.io/on-deck/' } : null
  } catch {
    cached = null
  }
  return cached
}

/** Sends each message to each of the user's devices. Returns how many deliveries the push services accepted. */
export async function pushToUser(db: SupabaseClient, userId: string, messages: PushMessage[]): Promise<{ sent: number; devices: number }> {
  const keys = vapidKeys()
  if (!keys || messages.length === 0) return { sent: 0, devices: 0 }
  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
  let sent = 0
  for (const s of subs ?? []) {
    let delivered = false
    for (const m of messages) {
      try {
        const r = await sendPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, m, keys)
        if (r.gone) {
          await db.from('push_subscriptions').delete().eq('id', s.id)
          break
        }
        if (r.status >= 200 && r.status < 300) {
          sent++
          delivered = true
        } else {
          console.warn('push rejected', r.status, new URL(s.endpoint).host)
        }
      } catch (err) {
        console.warn('push failed', String(err))
      }
    }
    if (delivered) await db.from('push_subscriptions').update({ last_push_at: new Date().toISOString() }).eq('id', s.id)
  }
  return { sent, devices: (subs ?? []).length }
}
