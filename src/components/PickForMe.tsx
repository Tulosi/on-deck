import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { BookOpen, Clapperboard, Dices, Film, Gamepad2, Play, RotateCcw, Shuffle, Tv, X } from 'lucide-react'
import { useSeerrStatus } from '../lib/integrations'
import { useItems, useUpdateItem } from '../lib/library'
import { useTypeOrder } from '../lib/navLayout'
import { candidates, pickOne, reelOf, weigh, type PickKind } from '../lib/picker'
import { statusLabel } from '../lib/statusLabels'
import { steamLaunch } from '../lib/steam'
import { coverProps } from '../lib/images'
import { toast } from '../lib/toast'
import { useDialog } from '../lib/useDialog'
import type { MediaType, UserItem } from '../types'
import { SteamIcon } from './SteamIcon'

const KIND_LABEL: Record<PickKind, string> = { any: 'Anything', game: 'A game', movie: 'A movie', tv: 'A show', book: 'A book' }
const KIND_ICON = { any: Shuffle, game: Gamepad2, movie: Film, tv: Tv, book: BookOpen } as const
const TYPE_ONE: Record<MediaType, string> = { movie: 'Movie', tv: 'TV show', game: 'Game', book: 'Book' }
/** Where to add titles once a type has run out of picks. */
const MORE_IN: Record<PickKind, string> = { any: 'your library', movie: 'Movies', tv: 'TV Shows', game: 'Games', book: 'Books' }
const START_WORD: Record<MediaType, string> = { movie: 'Start watching', tv: 'Start watching', game: 'Start playing', book: 'Start reading' }

/**
 * The carousel is one flat row, like Embla's and Swiper's centred sliders: no tilt, no depth, no shadows. The middle
 * poster is the selector, full size; its neighbours are `SIDE` of that and dimmed, and exactly those three fill the
 * window (posters further out slide in and out past its edges). Gaps stay even as posters change size.
 */
const SIDE = 0.88
const GAP = 10
/** How dark a poster gets one step from the middle (the shade's opacity). */
const DIM = 0.6
/** Fallback poster width before the window is measured. */
const CARD_W = 140
/**
 * The spin is physics rather than a fixed curve, the way Motion's `inertia` and GSAP's InertiaPlugin throw a wheel:
 * a fling that loses speed to friction (exponential decay, `FRICTION_S` its time constant), then, once it's slow
 * enough to read, a spring takes over and pulls it onto the pick (a touch past and back, as a real wheel's detent does).
 */
const FRICTION_S = 0.36
/** Speed (posters a second) at which the spring takes over from the fling. */
const HANDOFF = 1.5
const SPRING = { stiffness: 210, damping: 19 }

/** Where a poster sits for its distance `d` from the middle (in posters, fractional mid-spin), for posters `w` wide. */
function placement(d: number, w: number) {
  const a = Math.abs(d)
  const near = Math.min(a, 1)
  const scale = 1 - (1 - SIDE) * near
  const first = w / 2 + GAP + (w * SIDE) / 2
  const x = Math.sign(d) * (first * near + Math.max(0, a - 1) * (w * SIDE + GAP))
  return { x, scale, dim: DIM * near, layer: Math.round(100 - a * 10) }
}

/** `offset`: how far between posters it was when a new spin interrupted the last, so it carries on from there. */
type Reel = { strip: UserItem[]; at: number; key: number; resting?: boolean; offset?: number }

/** A still fan of seven posters from the pool, shown before the first spin. */
function restingReel(pool: UserItem[]): Reel | null {
  if (!pool.length) return null
  const mixed = [...pool].sort(() => Math.random() - 0.5)
  const strip = Array.from({ length: 7 }, (_, n) => mixed[n % mixed.length])
  return { strip, at: 3, key: 0, resting: true }
}

const OPEN = 'ondeck:pick'
/** Open the picker from a button. */
export const openPicker = () => window.dispatchEvent(new Event(OPEN))

/** The Home toolbar's button. */
export function PickButton() {
  return (
    <button
      type="button"
      onClick={openPicker}
      aria-label="Pick for me"
      className="hit flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-xs text-fg hover:border-faint transition-[transform,border-color,filter] duration-150 active:scale-[0.97] sm:h-7 md:rounded-full"
    >
      <Dices className="size-3.5 text-accent-ink" aria-hidden="true" />
      {/* Narrow phones: "Pick", so the type pill keeps its room. */}
      Pick<span className="max-[26rem]:hidden"> for me</span>
    </button>
  )
}

/**
 * "Pick for me": choose a type (or anything) and a reel of your titles spins, slows and stops on one, chosen at
 * random but leaning towards high priority, already started, ready to watch / owned, and waiting longest. Spin
 * again never lands on an earlier pick. Mounted once (AppShell).
 */
export function PickForMe() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(OPEN, show)
    return () => window.removeEventListener(OPEN, show)
  }, [])
  if (!open) return null
  return <PickDialog onClose={() => setOpen(false)} />
}

function PickDialog({ onClose }: { onClose: () => void }) {
  const panel = useDialog<HTMLDivElement>(true, onClose)
  const { items } = useItems()
  const update = useUpdateItem()
  const order = useTypeOrder()
  const kinds: PickKind[] = ['any', ...order]
  const pools = useMemo(() => Object.fromEntries(kinds.map((k) => [k, candidates(items, k)])) as Record<PickKind, UserItem[]>, [items, order.join()])

  const [kind, setKind] = useState<PickKind | null>(null)
  // Everything picked so far in this sitting: Spin again never lands on one of these.
  const seen = useRef(new Set<string>())
  // Before the first spin, a resting fan of your posters (dimmed) that the spin then sets off from.
  const [reel, setReel] = useState<Reel | null>(() => restingReel(pools.any))
  const [spinning, setSpinning] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const pick = reel && !reel.resting ? reel.strip[reel.at] : null
  // A show or movie on your Plex: Seerr knows its Plex link, so the picker can open it there.
  const onPlex = !!pick && (pick.title.mediaType === 'tv' || pick.title.mediaType === 'movie') && pick.plex === 'available'
  const seerr = useSeerrStatus(onPlex ? pick.title : null)
  const plexUrl = onPlex && seerr.data?.configured ? (seerr.data.plexUrl ?? undefined) : undefined
  const stageEl = useRef<HTMLDivElement>(null)
  // Where the carousel is right now (in posters along the strip, fractional mid-spin), for a spin that interrupts it.
  const posNow = useRef(0)

  const spin = (k: PickKind) => {
    // Changing your mind mid-spin starts the new one from where the posters are; the pick it was heading for was
    // never shown, so it can still come up.
    if (spinning && reel && !reel.resting) seen.current.delete(reel.strip[reel.at].id)
    setKind(k)
    const pool = pools[k]
    const next = pickOne(pool, seen.current)
    if (!next) {
      setExhausted(true)
      return
    }
    setExhausted(false)
    seen.current.add(next.id)
    const r = reelOf(pool, next, 10)
    // The posters already showing stay put and set off from where they are, rather than swapping in new ones.
    const centre = spinning ? Math.round(posNow.current) : (reel?.at ?? 0)
    const showing = reel ? reel.strip.slice(centre - 3, centre + 4) : []
    const moving = showing.length === 7
    if (moving) r.strip.splice(0, 7, ...showing)
    setReel({ ...r, key: Date.now(), offset: spinning && moving ? posNow.current - centre : 0 })
    setSpinning(true)
  }

  // Run the carousel: flung fast, slowing like a wheel running out of speed, a spring settling it onto the pick.
  // Positions are set straight on the elements each frame (no re-render). Reduced motion: it fades over to the pick.
  useLayoutEffect(() => {
    const stage = stageEl.current
    if (!reel || !stage) return
    const cards = [...stage.querySelectorAll<HTMLElement>('[data-card]')]
    // Poster width so the middle one and both neighbours exactly fill the window (on a short screen, a phone held
    // sideways, no taller than about a third of it); its height leaves room for the pick's outline. Measured again
    // when the window changes size, so turning the phone doesn't leave posters sized for the old width.
    let w = 0
    const measure = () => {
      stage.style.maxWidth = ''
      const fit = (stage.clientWidth - 2 * GAP) / (1 + 2 * SIDE)
      w = Math.min(fit, Math.max(96, (innerHeight * 0.36) / 1.5))
      // Smaller posters: the window narrows with them, so it still shows exactly three.
      if (w < fit) stage.style.maxWidth = `${Math.ceil(w * (1 + 2 * SIDE) + 2 * GAP)}px`
      stage.style.height = `${Math.round(w * 1.5) + 8}px`
      for (const el of cards) {
        el.style.width = `${w}px`
        el.style.height = `${w * 1.5}px`
      }
    }
    measure()
    // Where the carousel is now (fractional mid-spin), so a resize can put it back in place.
    let cur = reel.at
    const onResize = () => {
      measure()
      place(cur)
      if (reel.resting) restShade()
    }
    addEventListener('resize', onResize)
    // Start a few posters in, so both sides are full from the first frame.
    const FROM = 3 + (reel.offset ?? 0)
    // Each poster's face (rounded, clipped) and the dark shade over it that dims it: opacity only, no filters.
    const faces = cards.map((el) => el.firstElementChild as HTMLElement)
    const shades = cards.map((el) => el.querySelector<HTMLElement>('[data-shade]')!)
    const shade = (n: number, dark: number, ms = 0) => {
      shades[n].style.transition = ms ? `opacity ${ms}ms cubic-bezier(0.23, 1, 0.32, 1)` : ''
      shades[n].style.opacity = dark.toFixed(3)
    }
    const place = (pos: number) => {
      cur = pos
      posNow.current = pos
      cards.forEach((el, n) => {
        const d = n - pos
        if (Math.abs(d) > 2.2) {
          el.style.visibility = 'hidden'
          return
        }
        const p = placement(d, w)
        el.style.visibility = 'visible'
        el.style.transform = `translate(-50%, -50%) translateX(${p.x.toFixed(1)}px) scale(${p.scale.toFixed(3)})`
        el.style.zIndex = String(p.layer)
        // Scaled posters get a larger corner so it's drawn at the library posters' 6px.
        faces[n].style.borderRadius = `${(6 / p.scale).toFixed(2)}px`
        shade(n, p.dim)
      })
    }
    // Landing: the pick's outline (on the card) marks it; nothing else needs to move.
    const done = () => setSpinning(false)
    // A light tick on phones as each poster passes the front, like a wheel's clicker (Android; others ignore it).
    let lastSlot = Math.round(FROM)
    const tick = (pos: number) => {
      const slot = Math.round(pos)
      if (slot !== lastSlot) {
        lastSlot = slot
        navigator.vibrate?.(4)
      }
    }
    // Not chosen yet: all of them dimmed, the middle one included.
    const restShade = () =>
      cards.forEach((el, n) => {
        if (el.style.visibility !== 'hidden') shade(n, Math.max(0.5, placement(n - reel.at, w).dim))
      })
    const unlisten = () => removeEventListener('resize', onResize)
    if (reel.resting) {
      place(reel.at)
      restShade()
      return unlisten
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // No travel: the posters simply fade over to the pick.
      place(reel.at)
      stage.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
      done()
      return unlisten
    }
    let raf = 0
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      place(reel.at)
      done()
    }
    // Next frame, even where the browser holds back animation frames (a background tab): falls back to a timer.
    const next = (f: (now: number) => void) => {
      let fired = false
      raf = requestAnimationFrame((now) => {
        fired = true
        f(now)
      })
      setTimeout(() => {
        if (!fired && !finished) {
          cancelAnimationFrame(raf)
          f(performance.now())
        }
      }, 50)
    }

    // The fling: off at once on the tap, heading for the pick and losing speed to friction; its asymptote is the pick.
    const from = FROM
    const dist = reel.at - from
    const v0 = dist / FRICTION_S
    // When it has slowed to HANDOFF, the spring takes over from there with that speed.
    const handT = FRICTION_S * Math.log(v0 / HANDOFF)
    const flingAt = (t: number) => from + dist * (1 - Math.exp(-t / FRICTION_S))
    let spring: { x: number; v: number; t: number } | null = null
    // Whatever happens, it lands.
    const watchdog = setTimeout(finish, handT * 1000 + 1500)

    const t0 = performance.now()
    const frame = (now: number) => {
      if (finished) return
      const t = (now - t0) / 1000
      let pos: number
      if (t < handT) pos = flingAt(t)
      else {
        // Spring, stepped in small fixed steps so it's the same at any frame rate.
        if (!spring) spring = { x: flingAt(handT) - reel.at, v: HANDOFF, t: handT }
        while (spring.t < t) {
          const dt = Math.min(1 / 240, t - spring.t)
          spring.v += (-SPRING.stiffness * spring.x - SPRING.damping * spring.v) * dt
          spring.x += spring.v * dt
          spring.t += dt
        }
        if (Math.abs(spring.x) < 0.002 && Math.abs(spring.v) < 0.02) {
          finish()
          return
        }
        pos = reel.at + spring.x
      }
      place(pos)
      tick(pos)
      next(frame)
    }
    place(FROM)
    next(frame)
    return () => {
      finished = true
      cancelAnimationFrame(raf)
      clearTimeout(watchdog)
      unlisten()
    }
  }, [reel?.key])

  const start = (item: UserItem) => {
    const before = { progress: item.progress, dates: { startedAt: item.startedAt ?? null, completedAt: item.completedAt ?? null, stalledAt: item.stalledAt ?? null } }
    void update(item, { progress: 'in_progress' })
      .then(() =>
        toast({
          message: `Set to ${statusLabel('in_progress', item.title.mediaType)}`,
          key: item.id,
          action: { label: 'Undo', onClick: () => void update({ ...item, progress: 'in_progress' }, before).catch(() => undefined) },
        }),
      )
      .catch(() => toast({ message: 'Couldn’t save that. Try again.', tone: 'error' }))
    onClose()
  }

  // Where you'd get it (owned, a service), from the reasons it came up. An owned Steam game says Steam.
  const reasons = pick ? weigh(pick).reasons : []
  const owned = reasons.find((r) => r === 'You own it' || r === 'Ready to watch' || (r.startsWith('On ') && !r.startsWith('On your list')))
  const where = owned === 'You own it' && pick?.title.mediaType === 'game' && pick.title.steamAppId ? 'On Steam' : owned
  const left = kind ? pools[kind].filter((i) => !seen.current.has(i.id)).length : 0

  return createPortal(
    // Scrolls when it's taller than the screen (a phone held sideways), so the result and its buttons stay reachable.
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="pick-title">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="pointer-events-none relative grid min-h-full grid-cols-1 place-items-center p-4">
      <div ref={panel} tabIndex={-1} className="pop-in pointer-events-auto relative w-full max-w-md min-w-0 rounded-xl border border-line bg-surface p-5 shadow-2xl outline-none">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="pick-title" className="flex items-center gap-2 text-base font-semibold text-fg">
            <Dices className="size-4 text-accent-ink" aria-hidden="true" /> Pick for me
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="hit text-muted hover:text-fg">
            <X className="size-4" />
          </button>
        </div>

        {/* What to pick from. Choosing one spins straight away. */}
        <div role="group" aria-label="Pick from" className="grid grid-cols-5 gap-1.5">
          {kinds.map((k) => {
            const Icon = KIND_ICON[k]
            const empty = pools[k].length === 0
            // Greyed out when there's nothing of that type to start, but still focusable and tappable, so the
            // reason can be heard, hovered or (on a phone) tapped for, rather than a disabled button that says nothing.
            const why = `Nothing ready to start in ${k === 'any' ? 'your list' : KIND_LABEL[k].toLowerCase().replace(/^an? /, '') + 's'}`
            return (
              <button
                key={k}
                type="button"
                aria-disabled={empty || undefined}
                aria-pressed={kind === k}
                onClick={() => (empty ? toast({ message: why }) : spin(k))}
                title={empty ? why : undefined}
                className={clsx(
                  'flex flex-col items-center gap-1 rounded-lg border px-0.5 py-2.5 text-xs whitespace-nowrap transition-[color,border-color,background-color,transform] duration-150 disabled:opacity-40 max-[24rem]:text-[11px]',
                  empty ? 'border-line text-muted opacity-40' : 'enabled:active:scale-[0.97]',
                  !empty && (kind === k ? 'border-accent bg-accent/10 text-fg' : 'border-line text-muted enabled:hover:border-faint enabled:hover:text-fg'),
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {KIND_LABEL[k]}
              </button>
            )
          })}
        </div>

        {/* The carousel: one flat row of posters, the pick stopping in the middle. */}
        <div
          ref={stageEl}
          className="relative mx-auto mt-5 overflow-hidden"
          style={{ height: Math.round(CARD_W * 1.5) + 8 }}
          aria-hidden="true"
        >
          {reel ? (
            <div key={reel.key} className="absolute inset-0">
              {reel.strip.map((i, n) => (
                <Card key={n} item={i} front={n === reel.at && !spinning && !reel.resting} />
              ))}
            </div>
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">
              {items.length ? 'You spin me right round, baby, right round.' : 'Add a few titles first, then let it rip.'}
            </div>
          )}
        </div>

        {/* The result. It keeps one height throughout: soft placeholders shaped like the details hold its place before
            the first spin and while it spins, and the details fade in over them as it lands. Title and byline keep to
            one line and each row to two, so a long reason can't make it grow. */}
        <div className="mt-4 grid" aria-live="polite">
          <div
            aria-hidden="true"
            className={clsx(
              // Never catches taps: once faded out, it still sits over the text in the same grid cell.
              'pointer-events-none [grid-area:1/1] transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
              (pick && !spinning) || exhausted || !reel ? 'opacity-0' : reel.resting ? 'opacity-35' : spinning && 'motion-safe:animate-pulse',
            )}
          >
            <div className="flex h-6 items-center justify-center">
              <span className={clsx('h-3.5 w-40 rounded bg-raised', reel?.resting && 'invisible')} />
            </div>
            <div className="mt-0.5 flex h-4 items-center justify-center">
              <span className={clsx('h-2.5 w-28 rounded bg-raised', reel?.resting && 'invisible')} />
            </div>
            <div className="mt-3 grid grid-cols-2 border-y border-line">
              {['Status', 'Where'].map((label, n) => (
                <div key={label} className={clsx('min-w-0 py-2 pr-2', n > 0 && 'border-l border-line pl-2.5')}>
                  <p className="text-[11px] leading-4 text-faint">{label}</p>
                  <div className="mt-0.5 flex h-[2lh] items-start pt-1 text-[13px] leading-snug">
                    <span className="h-3 w-4/5 rounded bg-raised" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-center gap-2">
              <span className="h-9 w-16 rounded-lg bg-raised" />
              <span className="h-9 w-28 rounded-lg bg-raised" />
            </div>
          </div>
          <div className="[grid-area:1/1] min-w-0">
            {exhausted ? (
              <div className="grid h-full place-content-center text-center">
                <p className="text-sm text-balance text-fg">Wanna spin more? Add more titles to {MORE_IN[kind ?? 'any']} first.</p>
                <button
                  type="button"
                  onClick={() => {
                    seen.current.clear()
                    if (kind) spin(kind)
                  }}
                  className="hit mt-2 text-sm font-medium text-accent-ink hover:underline"
                >
                  Start over
                </button>
              </div>
            ) : pick && !spinning ? (
              // Details come in just after it lands, top to bottom, laid out like the Up next card's rows.
              <div key={reel?.key}>
                <p className="reveal truncate text-center text-base leading-6 font-semibold text-fg">{pick.title.title}</p>
                <p className="reveal mt-0.5 flex h-4 justify-center gap-3 overflow-hidden text-xs leading-4 whitespace-nowrap text-muted" style={{ animationDelay: '40ms' }}>
                  {[TYPE_ONE[pick.title.mediaType], pick.title.year, pick.title.byline].filter(Boolean).map((part, n) => (
                    <span key={String(part)} className={clsx(n === 2 && 'min-w-0 truncate')}>
                      {part}
                    </span>
                  ))}
                </p>
                <dl className="reveal mt-3 grid grid-cols-2 border-y border-line text-left" style={{ animationDelay: '80ms' }}>
                  {[
                    ['Status', statusLabel(pick.progress, pick.title.mediaType)],
                    ['Where', where ?? '—'],
                  ].map(([label, value], n) => (
                    <div key={label} className={clsx('min-w-0 py-2 pr-2', n > 0 && 'border-l border-line pl-2.5')}>
                      <dt className="text-[11px] leading-4 text-faint">{label}</dt>
                      <dd className="mt-0.5 line-clamp-2 h-[2lh] text-[13px] leading-snug text-fg" title={value}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                {/* One row of buttons (tighter on narrow phones, so all three fit). An owned Steam game gets Launch first,
                    on a computer, where Steam runs (as on its title page); a show or movie on your Plex gets a Plex button
                    with the play icon. Not started yet, that button also does what Start playing/watching would (sets it
                    going, with Undo), so it's one button rather than two. Once everything
                    has come up, Spin again becomes Start over, which brings them all back. */}
                {(() => {
                  const steam = pick.title.mediaType === 'game' && pick.owned && pick.title.steamAppId ? steamLaunch(pick.title.steamAppId) : undefined
                  const wanted = pick.progress === 'wanted'
                  // Steam (a computer) or Plex: the link starts it there, and the click also marks it started if it
                  // wasn't (start closes the picker too). Closing waits a tick so the link still opens.
                  const launch = steam
                    ? { href: steam.href, external: false, icon: <SteamIcon className="size-3.5" />, label: steam.label, title: wanted ? 'Start the game in the Steam app, and set it to Playing' : 'Start the game in the Steam app' }
                    : plexUrl
                      ? { href: plexUrl, external: true, icon: <Play className="size-3.5" aria-hidden="true" />, label: wanted ? START_WORD[pick.title.mediaType] : 'Watch in Plex', title: wanted ? 'Open it in Plex, and set it to Watching' : 'Open it in Plex' }
                      : undefined
                  const lead = launch ? 'launch' : wanted ? 'start' : 'open'
                  const btn =
                    'hit flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm transition-[transform,border-color,filter] duration-150 active:scale-[0.97] max-[26rem]:px-2.5'
                  const tone = (key: string) => (lead === key ? 'bg-accent font-medium text-accent-fg hover:brightness-110' : 'border border-line text-fg hover:border-faint')
                  return (
                    <div className="reveal mt-3 flex flex-wrap items-center justify-center gap-2 max-[24rem]:gap-1.5" style={{ animationDelay: '120ms' }}>
                      {launch && (
                        <a
                          href={launch.href}
                          target={launch.external ? '_blank' : undefined}
                          rel={launch.external ? 'noreferrer' : undefined}
                          onClick={() => setTimeout(() => (wanted ? start(pick) : onClose()))}
                          title={launch.title}
                          className={clsx(btn, tone('launch'))}
                        >
                          {launch.icon} {launch.label}
                        </a>
                      )}
                      {wanted && !launch && (
                        <button type="button" onClick={() => start(pick)} className={clsx(btn, 'font-medium', tone('start'))}>
                          {START_WORD[pick.title.mediaType]}
                        </button>
                      )}
                      <Link to={`/title/${pick.title.id}`} onClick={onClose} className={clsx(btn, 'font-medium', tone('open'))}>
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          if (!left) seen.current.clear()
                          if (kind) spin(kind)
                        }}
                        title={left ? undefined : 'That was the last one that fits. Start over brings them all back.'}
                        className={clsx(btn, 'border border-line text-fg hover:border-faint')}
                      >
                        <RotateCcw className="size-3.5" aria-hidden="true" /> {left ? 'Spin again' : 'Start over'}
                      </button>
                    </div>
                  )
                })()}
              </div>
            ) : spinning ? (
              <p className="sr-only">Spinning…</p>
            ) : reel?.resting || !reel ? (
              // Before the first spin: the hint where the title and byline will be, over the placeholders shown
              // faintly and still (behind), so the space reads as "your pick goes here" rather than empty.
              reel ? (
                <div className="flex h-[2.625rem] items-center justify-center text-center text-sm leading-5 text-muted text-balance">
                  <SpinHint text={'You spin me right round, baby, right round.'} onSpin={() => spin('any')} />
                </div>
              ) : null
            ) : null}
          </div>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * The resting hint, with its "spin me" as a button that spins Anything (the rest stays plain text). If the words
 * aren't in it, it's just the text.
 */
function SpinHint({ text, onSpin }: { text: string; onSpin: () => void }) {
  const at = text.toLowerCase().indexOf('spin me')
  // One inline span, so it flows as a single sentence (the hint is a grid, which would stack loose pieces apart).
  if (at < 0) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, at)}
      <button
        type="button"
        onClick={onSpin}
        className="hit font-medium text-accent-ink underline decoration-accent/40 underline-offset-[3px] transition-[text-decoration-color] duration-150 hover:decoration-accent"
      >
        {text.slice(at, at + 7)}
      </button>
      {text.slice(at + 7)}
    </span>
  )
}

/** One poster on the carousel (a plain tile with the name when there's no cover). Placed by the spin each frame. */
function Card({ item, front }: { item: UserItem; front: boolean }) {
  const t = item.title
  return (
    <div data-card className="absolute top-1/2 left-1/2 will-change-transform" style={{ width: CARD_W, height: CARD_W * 1.5, visibility: 'hidden' }}>
      <div
        className={clsx(
          'relative size-full overflow-hidden rounded-md border border-line bg-raised transition-[box-shadow,border-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
          front && 'border-accent ring-2 ring-accent',
        )}
      >
        {t.coverUrl ? (
          <img {...coverProps(t.coverUrl, `${CARD_W}px`)} alt="" draggable={false} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center p-3 text-center text-xs text-muted">
            <Clapperboard className="mb-1 size-5" aria-hidden="true" />
            {t.title}
          </div>
        )}
        <div data-shade className="pointer-events-none absolute inset-0 bg-bg opacity-0" />
      </div>
    </div>
  )
}
