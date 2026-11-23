import { useState } from 'react'
import { Check, Copy, ExternalLink, Link2, Loader2, Share2 } from 'lucide-react'
import { useCollections } from '../lib/collections'
import { copyText, shareUrl, useShareActions, useShareLinks, type ShareLink, type ShareScope } from '../lib/shares'
import type { MediaType } from '../types'

const TYPE_NAME: Record<MediaType, string> = { movie: 'Movies', tv: 'TV shows', game: 'Games', book: 'Books' }
const btn = 'flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-fg hover:border-accent disabled:opacity-60'

/** One link's row: what it shares, Copy, Open, Turn off. */
function LinkRow({ link, label }: { link: ShareLink; label: string }) {
  const { revokeWithUndo } = useShareActions()
  const [copied, setCopied] = useState(false)
  const url = shareUrl(link.token)
  return (
    <li className="space-y-1.5 rounded-lg border border-line px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm text-fg">
          <Link2 className="size-3.5 text-muted" /> {label}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={btn}
            onClick={async () => {
              if (await copyText(url)) {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }
            }}
          >
            {copied ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <a href={url} target="_blank" rel="noreferrer" className={btn}>
            <ExternalLink className="size-3.5" /> Open
          </a>
          <button
            type="button"
            className={`${btn} hover:border-bad hover:text-bad`}
            onClick={() => revokeWithUndo(link.id, label)}
            title="Anyone who has the link will no longer be able to open it"

          >
            Turn off
          </button>
        </div>
      </div>
      <p className="truncate font-mono text-[11px] text-faint">{url}</p>
    </li>
  )
}

/** Settings → Sharing: create read-only links (library / type / collection) and manage them. */
export function ShareLinksSettings() {
  const { data: links = [], isLoading } = useShareLinks()
  const { data: collections = [] } = useCollections()
  const { getOrCreate } = useShareActions()
  const [scope, setScope] = useState('all')

  const options: { value: string; label: string; scope: ShareScope }[] = [
    { value: 'all', label: 'Whole library', scope: {} },
    ...(['movie', 'tv', 'game', 'book'] as MediaType[]).map((t) => ({ value: `type:${t}`, label: TYPE_NAME[t], scope: { mediaType: t } })),
    ...collections.map((c) => ({ value: `col:${c.id}`, label: `Collection: ${c.name}`, scope: { collectionId: c.id } })),
  ]
  const labelOf = (l: ShareLink) =>
    l.collectionId
      ? `Collection: ${collections.find((c) => c.id === l.collectionId)?.name ?? '…'}`
      : l.mediaType
        ? TYPE_NAME[l.mediaType]
        : 'Whole library'

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Anyone with a link can see those titles, with their status, ratings and favourites. They can’t see your notes or
        priorities, or change anything. Dropped titles are left out.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="What to share"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="h-9 rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none focus:border-accent"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={getOrCreate.isPending}
          onClick={async () => {
            const o = options.find((x) => x.value === scope)
            if (!o) return
            const link = await getOrCreate.mutateAsync(o.scope)
            await copyText(shareUrl(link.token))
          }}
          className="flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:brightness-95 disabled:opacity-60"
        >
          {getOrCreate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
          Create link
        </button>
      </div>
      <p className="text-xs text-faint">The new link is copied straight away. Each list has at most one active link.</p>
      {isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted" />
      ) : links.length > 0 ? (
        <ul className="space-y-2">
          {links.map((l) => (
            <LinkRow key={l.id} link={l} label={labelOf(l)} />
          ))}
        </ul>
      ) : null}
      {getOrCreate.error && <p className="text-sm text-bad">Couldn’t create the link. Please try again.</p>}
    </div>
  )
}

/** Collection page: Share button (makes or reuses the link and copies it), then the link's controls. */
export function ShareCollection({ collectionId, name }: { collectionId: string; name: string }) {
  const { data: links = [] } = useShareLinks()
  const { getOrCreate } = useShareActions()
  const [open, setOpen] = useState(false)
  const link = links.find((l) => l.collectionId === collectionId)
  return (
    <div className="space-y-2">
      {!open ? (
        <button
          type="button"
          disabled={getOrCreate.isPending}
          onClick={async () => {
            const l = link ?? (await getOrCreate.mutateAsync({ collectionId }))
            await copyText(shareUrl(l.token))
            setOpen(true)
          }}
          className="flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-fg hover:border-accent disabled:opacity-60"
        >
          {getOrCreate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
          Share
        </button>
      ) : link ? (
        <div className="space-y-1">
          <p className="text-xs text-good">Link copied. Anyone with it can view this collection (read-only).</p>
          <ul className="max-w-xl">
            <LinkRow link={link} label={name} />
          </ul>
        </div>
      ) : (
        <Loader2 className="size-4 animate-spin text-muted" />
      )}
    </div>
  )
}
