// Web Push helpers for the app. Caller must be signed in.
//   POST { action: 'test' } → sends a test notification to all of the caller's devices → { sent, devices }
import { admin, HttpError, json, requireUser, serve } from '../_shared/http.ts'
import { pushToUser, vapidKeys } from '../_shared/push.ts'

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  const user = await requireUser(req)
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (body?.action !== 'test') throw new HttpError(400, 'unknown_action')
  if (!vapidKeys()) throw new HttpError(500, 'push_not_configured')
  const result = await pushToUser(admin(), user.id, [
    { title: 'On Deck', body: 'Push notifications are working on this device.', url: '', tag: 'on-deck-test' },
  ])
  return json(result)
})
