import type { UserItem } from '../types'
import { episodeCode } from './home'
import type { useUpdateItem } from './library'
import { toast } from './toast'

type Update = ReturnType<typeof useUpdateItem>

/**
 * Mark an episode watched, with Undo: saves straight away (the rolling code shows it), then a toast offers to put
 * the previous episode back. Used by the Up next card's button and the Continue row's button and swipe, where a
 * stray swipe while scrolling is easy to make.
 */
export function markWatched(update: Update, item: UserItem, ep: { season: number; episode: number }) {
  const before = item.tvProgress ?? null
  update(item, { tvProgress: ep })
    .then(() =>
      toast({
        message: `Marked ${episodeCode(ep)} of ${item.title.title} watched`,
        action: {
          label: 'Undo',
          onClick: () => {
            update({ ...item, tvProgress: ep }, { tvProgress: before }).catch(() =>
              toast({ message: 'Couldn’t undo that. Try again.', tone: 'error' }),
            )
          },
        },
      }),
    )
    .catch(() => toast({ message: 'Couldn’t save that. Try again.', tone: 'error' }))
}
