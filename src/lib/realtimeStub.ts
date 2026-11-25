// On Deck doesn't use Supabase's live updates (realtime), but supabase-js builds a realtime client whenever it starts,
// which put ~100 kB of websocket code in every first load. vite.config.ts points '@supabase/realtime-js' here
// instead. If live updates are ever wanted, remove that alias.
export class RealtimeClient {
  constructor(_url?: string, _options?: unknown) {}
  setAuth(_token?: string | null) {
    return Promise.resolve()
  }
  channel(): never {
    throw new Error('Live updates are turned off in this build (see src/lib/realtimeStub.ts).')
  }
  getChannels() {
    return []
  }
  removeChannel() {
    return Promise.resolve('ok' as const)
  }
  removeAllChannels() {
    return Promise.resolve([])
  }
}
