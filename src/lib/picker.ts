// "Pick for me": one title from your own list, chosen at random but leaning towards what you'd most likely want to
// get to now. No questions asked: the only choice is the type (or anything).
import { isAvailable } from './filters'
import { nextWatchable } from './home'
import { releaseInfo } from './release'
import type { MediaType, UserItem } from '../types'

export type PickKind = 'any' | MediaType

const DAY = 86_400_000

/** Something you could start or carry on with right now. */
function pickable(i: UserItem, now: number): boolean {
  if (i.archivedAt) return false
  if (i.progress !== 'wanted' && i.progress !== 'in_progress' && i.progress !== 'stalled') return false
  if (releaseInfo(i.title).preRelease) return false
  // Put away for now ("Not now" on Home).
  if (i.snoozedUntil && Date.parse(i.snoozedUntil) > now) return false
  // Movies / shows that are known not to be watchable anywhere you have.
  if ((i.title.mediaType === 'movie' || i.title.mediaType === 'tv') && isAvailable(i) === false) return false
  if (i.available == null && (i.plex === 'requested' || i.plex === 'missing')) return false
  // A show you're in the middle of with no new episode out yet.
  if (i.title.mediaType === 'tv' && i.progress === 'in_progress' && i.tvProgress && !nextWatchable(i)) return false
  return true
}

/** How strongly a title is favoured, and the short reasons shown with the pick. */
export function weigh(i: UserItem, now = Date.now()): { weight: number; reasons: string[] } {
  let w = 1
  const reasons: string[] = []
  if (i.priority === 'high') {
    w *= 3
    reasons.push('High priority')
  } else if (i.priority === 'medium') w *= 1.6
  else if (i.priority === 'low') w *= 0.6

  if (i.progress === 'in_progress') {
    w *= 1.5
    reasons.push('Already started')
  } else if (i.progress === 'stalled') {
    w *= 0.8
    reasons.push('Worth picking back up')
  }

  const avail = isAvailable(i)
  if (i.title.mediaType === 'game' || i.title.mediaType === 'book') {
    if (avail) {
      w *= 1.5
      reasons.push('You own it')
    } else w *= 0.4
  } else if (avail) {
    w *= 1.5
    reasons.push(i.availableVia?.length ? `On ${i.availableVia[0]}` : 'Ready to watch')
  }

  // The longer it's waited, the more it's owed a turn (up to 1.5× after a year).
  const added = i.addedAt ? Date.parse(i.addedAt) : NaN
  if (!Number.isNaN(added)) {
    const days = (now - added) / DAY
    w *= 1 + Math.min(days / 365, 1) * 0.5
    if (i.progress === 'wanted' && days > 180) reasons.push(`On your list since ${new Date(added).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`)
  }
  return { weight: w, reasons: reasons.slice(0, 3) }
}

/** Everything that could come up for a kind of pick. */
export function candidates(items: UserItem[], kind: PickKind, now = Date.now()): UserItem[] {
  return items.filter((i) => (kind === 'any' || i.title.mediaType === kind) && pickable(i, now))
}

/** A weighted random pick, never one of `exclude` (earlier picks); null when nothing is left. */
export function pickOne(pool: UserItem[], exclude: ReadonlySet<string>, random = Math.random): UserItem | null {
  const left = pool.filter((i) => !exclude.has(i.id))
  if (!left.length) return null
  const weights = left.map((i) => weigh(i).weight)
  let r = random() * weights.reduce((a, b) => a + b, 0)
  for (let k = 0; k < left.length; k++) {
    r -= weights[k]
    if (r <= 0) return left[k]
  }
  return left[left.length - 1]
}

/**
 * The strip of titles that flies past before the pick: shuffled, no title twice in a row, the pick at `at` with three
 * more after it (so both sides are full when it stops).
 */
export function reelOf(pool: UserItem[], pick: UserItem, length = 28, random = Math.random): { strip: UserItem[]; at: number } {
  const others = pool.length > 1 ? pool.filter((i) => i.id !== pick.id) : pool
  const strip: UserItem[] = []
  for (let k = 0; k < length; k++) {
    let next = others[Math.floor(random() * others.length)]
    // Avoid the same poster twice running when there's a choice.
    if (others.length > 1) while (next.id === strip[strip.length - 1]?.id) next = others[Math.floor(random() * others.length)]
    strip.push(next)
  }
  // The one before the pick shouldn't be the pick either (it'd look like it stopped early).
  if (strip[strip.length - 1]?.id === pick.id && others.length > 1) strip[strip.length - 1] = others.find((i) => i.id !== pick.id)!
  strip.push(pick)
  const after = others.filter((i) => i.id !== pick.id)
  for (let k = 0; k < 3; k++) strip.push(after.length ? after[Math.floor(random() * after.length)] : pick)
  return { strip, at: length }
}
