import { ExternalLink } from 'lucide-react'
import { steamLaunch, steamStore } from '../lib/steam'
import { SteamIcon } from './SteamIcon'

/** Title page, Steam games: the store listing (in the browser) and, on a computer, Launch in the Steam app. */
/** `launch: false` leaves out Launch (a game you haven't added, so likely don't own). */
export function SteamButtons({ appId, launch: canLaunch = true }: { appId: number; launch?: boolean }) {
  const store = steamStore(appId)
  const launch = canLaunch ? steamLaunch(appId) : null
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={store.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:brightness-105 active:scale-[0.98]"
      >
        {store.label}
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </a>
      {launch && (
        <a
          href={launch.href}
          title="Start the game in the Steam app"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm text-fg hover:bg-raised"
        >
          <SteamIcon className="size-3.5" />
          {launch.label}
        </a>
      )}
    </div>
  )
}
