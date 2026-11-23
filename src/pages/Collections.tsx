import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { ArrowLeft, ChevronLeft, ChevronRight, EyeOff, Layers, Loader2, Pencil, Plus, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PosterCard } from '../components/PosterCard'
import { ShareCollection } from '../components/ShareLinks'
import { useAuth } from '../lib/auth'
import { builtinItems, smartItems, useCollectionActions, useCollectionList, type Collection } from '../lib/collections'
import { DEFAULT_DEAL_PCT } from '../lib/home'
import { useProfile } from '../lib/integrations'
import { useNavLayout } from '../lib/navLayout'
import { activeCount, LABELS, parseFilters } from '../lib/filters'
import { useItems } from '../lib/library'
import type { UserItem } from '../types'

const grid =
  'grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]'
const input =
  'h-9 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint focus:border-accent'
const button =
  'flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-fg hover:border-accent disabled:opacity-60'
const primary =
  'flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:brightness-95 disabled:opacity-60'

function SignInNote() {
  return (
    <p className="py-16 text-center text-sm text-muted">
      <Link to="/login" className="text-accent-ink hover:underline">
        Sign in
      </Link>{' '}
      to make collections: named lists that can mix movies, shows, games and books.
    </p>
  )
}

/** Name + description form, for creating and renaming. */
function CollectionForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; description: string | null }
  submitLabel: string
  busy: boolean
  onSubmit: (v: { name: string; description: string }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onSubmit({ name, description })
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name, e.g. Co-op with Sam"
        maxLength={80}
        aria-label="Collection name"
        className={input}
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        maxLength={200}
        aria-label="Description"
        className={input}
      />
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !name.trim()} className={primary}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={button}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/** Up to four covers in a 2×2 tile. */
function Collage({ items }: { items: UserItem[] }) {
  const covers = items.slice(0, 4)
  return (
    <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-lg border border-line bg-raised transition group-hover:border-accent">
      {covers.length === 0 ? (
        <div className="col-span-2 row-span-2 grid place-items-center text-faint">
          <Layers className="size-6" />
        </div>
      ) : (
        Array.from({ length: 4 }, (_, i) => {
          const t = covers[i]?.title
          return t?.coverUrl ? (
            <img key={i} src={t.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <div key={i} className="grid size-full place-items-center bg-surface px-1 text-center text-[11px] text-faint">
              {t?.title ?? ''}
            </div>
          )
        })
      )}
    </div>
  )
}

/**
 * A collection's titles: hand-picked in their order, or (smart) whatever its rules match right now. Archived titles
 * are left out unless `showArchived` (smart collections follow their own Archived rule instead).
 */
const itemsOf = (c: Collection, byId: Map<string, UserItem>, all: UserItem[], showArchived = false, dealPct = DEFAULT_DEAL_PCT) =>
  c.builtin
    ? builtinItems(c.id, all, dealPct)
    : c.rules != null
      ? smartItems(c.rules, all)
      : c.itemIds
          .map((id) => byId.get(id))
          .filter((i): i is UserItem => !!i && (showArchived || !i.archivedAt))

/** "Games · 3 filters · sorted by Price" */
function rulesSummary(rules: string): string {
  const f = parseFilters(new URLSearchParams(rules))
  const n = activeCount(f)
  return [
    f.type ? LABELS.type[f.type] : 'All types',
    n ? `${n} filter${n === 1 ? '' : 's'}` : 'no filters',
    `sorted by ${LABELS.sort[f.sort]}`,
  ].join(' · ')
}

function DefaultBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted uppercase">
      Default
    </span>
  )
}

function SmartBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent/60 px-1.5 py-0.5 font-mono text-[11px] text-accent-ink uppercase">
      <Sparkles className="size-3" /> Smart
    </span>
  )
}

/** /collections: all your collections. */
export function Collections() {
  const { user, loading } = useAuth()
  const { allItems: items } = useItems()
  const { list: collections, isLoading } = useCollectionList()
  const { create } = useCollectionActions()
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const byId = new Map(items.map((i) => [i.id, i]))
  const dealPct = useProfile().data?.alert_settings?.deep_discount_pct ?? DEFAULT_DEAL_PCT

  if (!loading && !user) {
    return (
      <div>
        <PageHeader title="Collections" />
        <SignInNote />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Collections" meta={isLoading ? undefined : String(collections.length)}>
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className={primary}>
            <Plus className="size-4" /> New collection
          </button>
        )}
      </PageHeader>

      {creating && (
        <div className="mb-6 max-w-md">
          <CollectionForm
            submitLabel="Create"
            busy={create.isPending}
            onCancel={() => setCreating(false)}
            onSubmit={(v) =>
              create.mutate(v, {
                onSuccess: (id) => {
                  setCreating(false)
                  navigate(`/collections/${id}`)
                },
              })
            }
          />
        </div>
      )}

      {isLoading ? (
        <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted" />
      ) : collections.length === 0 && !creating ? (
        <div className="mx-auto max-w-md py-16 text-center">
          <p className="text-sm text-muted">
            No collections yet. Make one for anything that cuts across types, like “Cyberpunk” or “Co-op with Sam”.
            You can also add a title to a collection from its page, or save Library filters as a{' '}
            <b>smart collection</b> that updates itself.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-4 gap-y-6">
          {collections.map((c) => {
            const list = itemsOf(c, byId, items, false, dealPct)
            return (
              <Link key={c.id} to={`/collections/${c.id}`} className="group block">
                <Collage items={list} />
                <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-fg">
                  <span className="truncate">{c.name}</span>
                  {c.rules != null && <SmartBadge />}
                  {c.builtin && <DefaultBadge />}
                </p>
                {c.description && <p className="line-clamp-2 text-xs text-muted">{c.description}</p>}
                <p className="font-mono text-xs text-faint">
                  {list.length} title{list.length === 1 ? '' : 's'}
                </p>
              </Link>
            )
          })}
        </div>
      )}
      {create.error && <p className="mt-4 text-sm text-bad">Couldn’t create the collection. Please try again.</p>}
    </div>
  )
}

/** /collections/:id — one collection. */
export function CollectionDetail() {
  const { id } = useParams()
  const { user, loading } = useAuth()
  const { allItems: items } = useItems()
  const { list: collections, isLoading } = useCollectionList()
  const { update, remove, toggleItem, move } = useCollectionActions()
  const [editing, setEditing] = useState(false)
  const [arranging, setArranging] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const navigate = useNavigate()
  const dealPct = useProfile().data?.alert_settings?.deep_discount_pct ?? DEFAULT_DEAL_PCT
  const [layout, saveLayout] = useNavLayout()

  if (!loading && !user) return <SignInNote />
  if (isLoading) return <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted" />
  const c = collections.find((x) => x.id === id)
  if (!c) {
    return (
      <div className="py-16 text-center">
        <p className="text-fg">That collection doesn’t exist.</p>
        <Link to="/collections" className="mt-4 inline-block text-sm text-accent-ink hover:underline">
          All collections
        </Link>
      </div>
    )
  }
  const byId = new Map(items.map((i) => [i.id, i]))
  const list = itemsOf(c, byId, items, showArchived, dealPct)
  const smart = c.rules != null
  const builtin = !!c.builtin
  const archivedHere = smart ? 0 : c.itemIds.filter((id) => byId.get(id)?.archivedAt).length

  return (
    <div>
      <Link to="/collections" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Collections
      </Link>

      {editing ? (
        <div className="mb-6 max-w-md">
          <CollectionForm
            initial={c}
            submitLabel="Save"
            busy={update.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={(v) => update.mutate({ id: c.id, ...v }, { onSuccess: () => setEditing(false) })}
          />
        </div>
      ) : (
        <>
          <PageHeader title={c.name} meta={String(list.length)}>
            <div className="flex flex-wrap gap-2">
              {builtin && (
                <button
                  type="button"
                  onClick={() => {
                    saveLayout('hidden', [...new Set([...(layout.hidden ?? []), c.id])])
                    navigate('/collections')
                  }}
                  className={button}
                  title="Hide this default collection. Turn it back on in Settings → Collections."
                >
                  <EyeOff className="size-4" /> Hide this collection
                </button>
              )}
              {smart && !builtin && (
                <Link to={`/library?${c.rules}${c.rules ? '&' : ''}smart=${c.id}`} className={button}>
                  <SlidersHorizontal className="size-4" /> Edit rules
                </Link>
              )}
              {!smart && list.length > 1 && (
                <button
                  type="button"
                  onClick={() => setArranging((a) => !a)}
                  className={clsx(button, arranging && 'border-accent')}
                  aria-pressed={arranging}
                >
                  {arranging ? 'Done' : 'Arrange'}
                </button>
              )}
              {!builtin && (
              <button type="button" onClick={() => setEditing(true)} className={button}>
                <Pencil className="size-4" /> Rename
              </button>
              )}
              {!builtin && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete the collection “${c.name}”? The titles stay in your library.`)) {
                    remove.mutate(c.id, { onSuccess: () => navigate('/collections') })
                  }
                }}
                className={clsx(button, 'hover:border-bad hover:text-bad')}
              >
                <Trash2 className="size-4" /> Delete
              </button>
              )}
            </div>
          </PageHeader>
          {c.description && <p className="-mt-4 mb-3 max-w-prose text-sm text-muted">{c.description}</p>}
          {smart && (
            <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <SmartBadge />
              {builtin && <DefaultBadge />}
              {builtin && c.id === 'default-deals'
                ? `Updates itself: games you want at a historical low or ${dealPct}%+ off (your deep-discount setting).`
                : `Updates itself: ${rulesSummary(c.rules!)}.`}
              <Link to={`/library?${c.rules}`} className="text-accent-ink hover:underline">
                Open in Library
              </Link>
            </p>
          )}
          {builtin ? (
            <p className="mb-6 text-xs text-faint">A default collection. It can be hidden but not changed, and can’t be shared yet.</p>
          ) : (
            <div className="mb-6">
              <ShareCollection collectionId={c.id} name={c.name} />
            </div>
          )}
          {archivedHere > 0 && (
            <p className="-mt-3 mb-5 text-xs text-faint">
              {showArchived
                ? `Showing ${archivedHere} archived title${archivedHere === 1 ? '' : 's'} · `
                : `${archivedHere} archived title${archivedHere === 1 ? ' is' : 's are'} hidden by default · `}
              <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-accent-ink hover:underline">
                {showArchived ? 'Hide' : 'Show'}
              </button>
            </p>
          )}
        </>
      )}

      {list.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          {smart
            ? 'Nothing in your library matches these rules right now. It’ll fill up as your library changes.'
            : <>Nothing here yet. Open any title in your library and use <b>Collections</b> on its page to add it.</>}
        </p>
      ) : (
        <div className={grid}>
          {list.map((item, index) => (
            <div key={item.id} className="relative">
              <PosterCard item={item} />
              {arranging && (
                <div className="absolute inset-x-1 top-1 flex justify-between gap-1">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move.mutate({ collectionId: c.id, itemId: item.id, by: -1 })}
                      aria-label={`Move ${item.title.title} earlier`}
                      className="grid size-7 place-items-center rounded-full bg-bg/90 text-fg shadow disabled:opacity-30"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === list.length - 1}
                      onClick={() => move.mutate({ collectionId: c.id, itemId: item.id, by: 1 })}
                      aria-label={`Move ${item.title.title} later`}
                      className="grid size-7 place-items-center rounded-full bg-bg/90 text-fg shadow disabled:opacity-30"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleItem.mutate({ collectionId: c.id, itemId: item.id, add: false })}
                    aria-label={`Remove ${item.title.title} from ${c.name}`}
                    className="grid size-7 place-items-center rounded-full bg-bg/90 text-fg shadow hover:text-bad"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
