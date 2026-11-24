import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { usePlexStatus, useProfile } from '../lib/integrations'

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

/**
 * One quiet line at the top of Home: which of your services are linked, and when the background refresh
 * last ran. Links to Settings → Status for detail. Hidden until something is linked.
 */
export function SyncLine() {
  const { user } = useAuth()
  const profile = useProfile()
  const plex = usePlexStatus()
  if (!user || !profile.data) return null
  const services = [
    plex.data?.linked && 'Plex',
    profile.data.seerr_url && 'Seerr',
    profile.data.steam_id && 'Steam',
  ].filter(Boolean) as string[]
  if (services.length === 0) return null
  const last = profile.data.daily_checked_at
  return (
    <Link
      to="/settings#status"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted hover:text-fg"
      aria-label={`Linked: ${services.join(', ')}.${last ? ` Updated ${ago(last)}.` : ''} Open status`}
    >
      {services.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-good" aria-hidden="true" />
          {s}
        </span>
      ))}
      {last && <span className="ml-auto">Updated {ago(last)}</span>}
    </Link>
  )
}
