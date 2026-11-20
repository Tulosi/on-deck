// Games: search, details, genres, co-op/multiplayer modes, Steam app id (IGDB via Twitch OAuth).
// STUB — returns 501 until implemented. Required secrets: TWITCH_CLIENT_ID,TWITCH_CLIENT_SECRET
import { notImplemented, serve } from '../_shared/http.ts'

serve(async (_req) => notImplemented('igdb', ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET']))
