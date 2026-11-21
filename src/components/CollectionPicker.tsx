import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Check, Loader2, Plus } from 'lucide-react'
import { useCollectionActions, useCollections } from '../lib/collections'
import type { UserItem } from '../types'

/** Title page: which collections this title is in. Tap a collection to add / remove; or make a new one with it. */
export function CollectionPicker({ item }: { item: UserItem }) {
  const { data: collections = [], isLoading } = useCollections()
  const { create, toggleItem } = useCollectionActions()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    create.mutate(
      { name, itemId: item.id },
      {
        onSuccess: () => {
          setName('')
          setAdding(false)
        },
      },
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-fg">Collections</h2>
        <Link to="/collections" className="text-xs text-muted hover:text-fg">
          All collections
        </Link>
      </div>
      {isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {collections.map((c) => {
            const inIt = c.itemIds.includes(item.id)
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={inIt}
                onClick={() => toggleItem.mutate({ collectionId: c.id, itemId: item.id, add: !inIt })}
                className={clsx(
                  'flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs',
                  inIt ? 'border-accent bg-accent/10 text-fg' : 'border-line text-muted hover:border-faint hover:text-fg',
                )}
              >
                {inIt ? <Check className="size-3.5 text-accent-ink" /> : <Plus className="size-3.5" />}
                {c.name}
              </button>
            )
          })}
          {adding ? (
            <form onSubmit={submit} className="flex items-center gap-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
                placeholder="New collection name"
                maxLength={80}
                aria-label="New collection name"
                className="h-8 w-48 rounded-full border border-line bg-bg px-3 text-xs text-fg outline-none placeholder:text-faint focus:border-accent"
              />
              <button
                type="submit"
                disabled={!name.trim() || create.isPending}
                className="flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg disabled:opacity-60"
              >
                {create.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Create
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex h-8 items-center gap-1.5 rounded-full border border-dashed border-line px-3 text-xs text-muted hover:border-faint hover:text-fg"
            >
              <Plus className="size-3.5" /> New collection
            </button>
          )}
        </div>
      )}
      {collections.length === 0 && !isLoading && !adding && (
        <p className="text-xs text-faint">Collections are lists that can mix movies, shows, games and books.</p>
      )}
      {(create.error || toggleItem.error) && <p className="text-sm text-bad">Something went wrong. Please try again.</p>}
    </section>
  )
}
