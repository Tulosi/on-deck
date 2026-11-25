import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { BookOpen, Clapperboard, Dices, Film, Gamepad2, RotateCcw, Shuffle, Tv, X } from 'lucide-react'
import { useItems, useUpdateItem } from '../lib/library'
import { useTypeOrder } from '../lib/navLayout'
import { candidates, pickOne, reelOf, weigh, type PickKind } from '../lib/picker'
import { statusLabel } from '../lib/statusLabels'
import { coverProps } from '../lib/images'
import { toast } from '../lib/toast'
import { useDialog } from '../lib/useDialog'
import type { MediaType, UserItem } from '../types'

const KIND_LABEL: Record<PickKind, string> = { any: 'Anything', game: 'A game', movie: 'A movie', tv: 'A show', book: 'A book' }
const KIND_ICON = { any: Shuffle, game: Gamepad2, movie: Film, tv: Tv, book: BookOpen } as const
const START_WORD: Record<MediaType, string> = { movie: 'Start watching', tv: 'Start watching', game: 'Start playing', book: 'Start reading' }

// Carousel geometry: the front poster's size (px) and the window's height. Posters sit round a faux cylinder.
const CARD_W = 150
const CARD_H = 225
const STAGE_H = 260
/**
 * The spin is physics rather than a fixed curve, the way Motion's `inertia` and GSAP's InertiaPlugin throw a wheel:
 * a fling that loses speed to friction (exponential decay, `FRICTION_S` its time constant), then, once it's slow
 * enough to read, a spring takes over and pulls it onto the pick (a touch past and back, as a real wheel's detent does).
 */
const FRICTION_S = 0.36
/** Speed (posters a second) at which the spring takes over from the fling. */
const HANDOFF = 1.5
const SPRING = { stiffness: 210, damping: 19 }
/** Wind-up before the spin: the reel pulls back a touch first, like a lever, so the launch reads as a push. */
const WINDUP_MS = 120
const WINDUP = 0.18
/**
 * Coverflow geometry, as Swiper's and Embla's 3D carousels lay it out: posters stand in real depth (pushed back with
 * translateZ and seen through `PERSPECTIVE`), turned in towards the front one, with the nearest neighbours well
 * visible and the further ones tucked in close behind them.
 */
const PERSPECTIVE = 1000
/** Sideways step to the first neighbour, then to each one after (fractions of a poster's width). */
const STEP_FIRST = 0.66
const STEP_REST = 0.3
/** Turn of the first neighbour, then extra per step beyond (degrees). */
const TURN_FIRST = 32
const TURN_REST = 6
/** How far back each step out sits (px). */
const DEPTH = 130

/**
 * Where a poster sits for its distance `d` from the front (in posters, fractional mid-spin). `k` shrinks the whole
 * arrangement to fit a narrow stage.
 */
function placement(d: number, k: number) {
  const a = Math.min(Math.abs(d), 3)
  const dir = Math.sign(d)
  const near = Math.min(a, 1)
  const far = Math.max(0, a - 1)
  const x = dir * CARD_W * (STEP_FIRST * near + STEP_REST * far) * k
  const turn = -dir * (TURN_FIRST * near + TURN_REST * far)
  const z = -DEPTH * a * k
  // Size as drawn (perspective included), for the corner fix.
  const drawn = k * (PERSPECTIVE / (PERSPECTIVE - z))
  const opacity = Math.max(0, Math.min(1, (2.6 - a) / 0.6))
  const brightness = 1 - 0.32 * Math.min(a, 2)
  return { x, z, turn, k, drawn, opacity, brightness, layer: Math.round(100 - a * 20) }
}

/** Strong ease-out (cubic-bezier(0.23, 1, 0.32, 1) in spirit): moves at once on the click, then eases. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4)

/**
 * A spring as a CSS `linear()` easing, for the pick's landing pop (WAAPI). Browsers without `linear()` get a strong
 * ease-out instead.
 */
const POP_EASING = (() => {
  if (typeof CSS === 'undefined' || !CSS.supports('animation-timing-function', 'linear(0, 1)')) return 'cubic-bezier(0.23, 1, 0.32, 1)'
  // Displacement from rest, released from 1 away: sampled over half a second.
  const { stiffness, damping } = { stiffness: 260, damping: 16 }
  const dt = 1 / 960
  let x = -1
  let v = 0
  const pts = ['0']
  for (let i = 1; i <= 48; i++) {
    for (let s = 0; s < 10; s++) {
      v += (-stiffness * x - damping * v) * dt
      x += v * dt
    }
    pts.push(i === 48 ? '1' : (1 + x).toFixed(3))
  }
  return `linear(${pts.join(', ')})`
})()

type Reel = { strip: UserItem[]; at: number; key: number; resting?: boolean }

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
  const stageEl = useRef<HTMLDivElement>(null)
  const frontEl = useRef<HTMLDivElement>(null)

  const spin = (k: PickKind) => {
    if (spinning) return
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
    const showing = reel ? reel.strip.slice(reel.at - 3, reel.at + 4) : []
    if (showing.length === 7) r.strip.splice(0, 7, ...showing)
    setReel({ ...r, key: Date.now() })
    setSpinning(true)
  }

  // Run the carousel: flung fast, slowing like a wheel running out of speed, a spring settling it onto the pick,
  // Positions are set straight on the elements each frame (no re-render).
  // Reduced motion: it simply appears at the pick.
  useLayoutEffect(() => {
    const stage = stageEl.current
    if (!reel || !stage) return
    const cards = [...stage.querySelectorAll<HTMLElement>('[data-card]')]
    // Fits about 2¾ front posters across; narrower stages (phones) shrink it all.
    const k = Math.min(1, stage.clientWidth / (CARD_W * 2.75))
    // Start a few posters in, so both sides are full from the first frame.
    const FROM = 3
    // Each poster's face (rounded, clipped) and the dark shade over it that dims it: opacity only, no filters.
    const faces = cards.map((el) => el.firstElementChild as HTMLElement)
    const shades = cards.map((el) => el.querySelector<HTMLElement>('[data-shade]')!)
    const shade = (n: number, dark: number, ms = 0) => {
      shades[n].style.transition = ms ? `opacity ${ms}ms cubic-bezier(0.23, 1, 0.32, 1)` : ''
      shades[n].style.opacity = dark.toFixed(3)
    }
    const place = (pos: number) => {
      cards.forEach((el, n) => {
        const d = n - pos
        if (Math.abs(d) > 3) {
          el.style.visibility = 'hidden'
          return
        }
        const p = placement(d, k)
        el.style.visibility = 'visible'
        el.style.transform = `translate(-50%, -50%) translate3d(${p.x.toFixed(1)}px, 0, ${p.z.toFixed(1)}px) rotateY(${p.turn.toFixed(1)}deg) scale(${p.k.toFixed(3)})`
        el.style.opacity = p.opacity.toFixed(3)
        el.style.zIndex = String(p.layer)
        // Cards are drawn smaller with depth, so the corner is set larger to come out at the library posters' 6px.
        faces[n].style.borderRadius = `${(6 / p.drawn).toFixed(2)}px`
        shade(n, 1 - p.brightness)
      })
    }
    const done = () => {
      setSpinning(false)
      // The pick lifts a touch and springs back into place, and the posters either side step back into the dark.
      frontEl.current?.animate(
        [
          { transform: 'scale(1)', easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
          { transform: 'scale(1.03)', offset: 0.2, easing: POP_EASING },
          { transform: 'scale(1)' },
        ],
        { duration: 480 },
      )
      cards.forEach((el, n) => {
        if (n === reel.at || el.style.visibility === 'hidden') return
        const p = placement(n - reel.at, k)
        shade(n, 1 - p.brightness * 0.7, 280)
      })
    }
    // A light tick on phones as each poster passes the front, like a wheel's clicker (Android; others ignore it).
    let lastSlot = FROM
    const tick = (pos: number) => {
      const slot = Math.round(pos)
      if (slot !== lastSlot) {
        lastSlot = slot
        navigator.vibrate?.(4)
      }
    }
    if (reel.resting) {
      place(reel.at)
      cards.forEach((el, n) => {
        if (el.style.visibility !== 'hidden') shade(n, 1 - placement(n - reel.at, k).brightness * 0.55)
      })
      return
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // No travel: the posters simply fade over to the pick.
      place(reel.at)
      stage.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
      done()
      return
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

    // The fling: from the wind-up's end it heads for the pick, losing speed to friction; its asymptote is the pick.
    const from = FROM - WINDUP
    const dist = reel.at - from
    const v0 = dist / FRICTION_S
    // When it has slowed to HANDOFF, the spring takes over from there with that speed.
    const handT = FRICTION_S * Math.log(v0 / HANDOFF)
    const flingAt = (t: number) => from + dist * (1 - Math.exp(-t / FRICTION_S))
    let spring: { x: number; v: number; t: number } | null = null
    // Whatever happens, it lands.
    const watchdog = setTimeout(finish, WINDUP_MS + handT * 1000 + 1500)

    const t0 = performance.now()
    const frame = (now: number) => {
      if (finished) return
      const t = (now - t0 - WINDUP_MS) / 1000
      let pos: number
      if (t < 0) pos = FROM - WINDUP * easeOut(1 + (t * 1000) / WINDUP_MS)
      else if (t < handT) pos = flingAt(t)
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

  const reasons = pick ? weigh(pick).reasons : []
  const left = kind ? pools[kind].filter((i) => !seen.current.has(i.id)).length : 0

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="pick-title">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div ref={panel} tabIndex={-1} className="pop-in relative w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-2xl outline-none">
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
            return (
              <button
                key={k}
                type="button"
                disabled={empty || spinning}
                aria-pressed={kind === k}
                onClick={() => spin(k)}
                title={empty ? `Nothing ready to start in ${k === 'any' ? 'your list' : KIND_LABEL[k].toLowerCase()}` : undefined}
                className={clsx(
                  'flex flex-col items-center gap-1 rounded-lg border px-0.5 py-2.5 text-xs whitespace-nowrap transition-[color,border-color,background-color,transform] duration-150 enabled:active:scale-[0.97] disabled:opacity-40 max-[24rem]:text-[11px]',
                  kind === k ? 'border-accent bg-accent/10 text-fg' : 'border-line text-muted enabled:hover:border-faint enabled:hover:text-fg',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {KIND_LABEL[k]}
              </button>
            )
          })}
        </div>

        {/* The carousel: posters round a faux cylinder, the pick stopping at the front. Edges fade out. */}
        <div
          ref={stageEl}
          className="relative mt-5 overflow-hidden"
          style={{ aspectRatio: `${CARD_W * 2.75} / ${STAGE_H}`, maxHeight: STAGE_H, maskImage: 'linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent)' }}
          aria-hidden="true"
        >
          {reel ? (
            <div key={reel.key} className="absolute inset-0" style={{ perspective: PERSPECTIVE }}>
              {reel.strip.map((i, n) => (
                <Card key={n} item={i} front={n === reel.at && !spinning && !reel.resting} frontRef={n === reel.at ? frontEl : undefined} />
              ))}
            </div>
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">
              {items.length ? 'Choose what to pick from, and it spins.' : 'Add a few titles first, then let it choose.'}
            </div>
          )}
        </div>

        {/* The result, once it stops. */}
        <div className="mt-4 min-h-28" aria-live="polite">
          {exhausted ? (
            <div className="text-center">
              <p className="text-sm text-fg">That’s everything that fits.</p>
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
            // Details come in just after it lands, top to bottom.
            <div key={reel?.key} className="text-center">
              <p className="reveal text-base font-semibold text-fg">{pick.title.title}</p>
              <p className="reveal mt-0.5 flex justify-center gap-3 text-xs text-muted" style={{ animationDelay: '40ms' }}>
                {[pick.title.year, pick.title.byline, pick.progress !== 'wanted' && statusLabel(pick.progress, pick.title.mediaType)]
                  .filter(Boolean)
                  .map((part) => (
                    <span key={String(part)}>{part}</span>
                  ))}
              </p>
              {reasons.length > 0 && (
                <p className="reveal mt-1 text-xs text-faint" style={{ animationDelay: '80ms' }}>
                  {reasons.join('. ')}.
                </p>
              )}
              <div className="reveal mt-3 flex flex-wrap items-center justify-center gap-2" style={{ animationDelay: '120ms' }}>
                {pick.progress === 'wanted' && (
                  <button type="button" onClick={() => start(pick)} className="hit h-9 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg hover:brightness-110 transition-[transform,border-color,filter] duration-150 active:scale-[0.97]">
                    {START_WORD[pick.title.mediaType]}
                  </button>
                )}
                <Link
                  to={`/title/${pick.title.id}`}
                  onClick={onClose}
                  className={clsx(
                    'hit flex h-9 items-center rounded-lg px-3.5 text-sm font-medium transition-[transform,border-color,filter] duration-150 active:scale-[0.97]',
                    pick.progress === 'wanted' ? 'border border-line text-fg hover:border-faint' : 'bg-accent text-accent-fg hover:brightness-110',
                  )}
                >
                  Open
                </Link>
                {/* Never the same one twice; once everything has come up, it offers to start over instead. */}
                <button
                  type="button"
                  onClick={() => {
                    if (!left) seen.current.clear()
                    if (kind) spin(kind)
                  }}
                  className="hit flex h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 text-sm text-fg hover:border-faint transition-[transform,border-color,filter] duration-150 active:scale-[0.97]"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" /> {left ? 'Spin again' : 'Start over'}
                </button>
              </div>
              {!left && <p className="mt-2 text-xs text-faint">That was the last one that fits. Start over brings them all back.</p>}
            </div>
          ) : spinning ? (
            <p className="sr-only">Spinning…</p>
          ) : reel?.resting ? (
            <p className="pt-3 text-center text-sm text-muted">Choose what to pick from, and it spins.</p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** One poster on the carousel (a plain tile with the name when there's no cover). Placed by the spin each frame. */
function Card({ item, front, frontRef }: { item: UserItem; front: boolean; frontRef?: React.Ref<HTMLDivElement> }) {
  const t = item.title
  return (
    <div data-card className="absolute top-1/2 left-1/2 will-change-transform" style={{ width: CARD_W, height: CARD_H, visibility: 'hidden' }}>
      <div
        ref={frontRef}
        className={clsx(
          'relative size-full overflow-hidden rounded-md bg-raised shadow-[0_12px_30px_-8px_rgb(0_0_0/0.7)] transition-shadow duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
          front && 'ring-2 ring-accent',
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
        <div data-shade className="pointer-events-none absolute inset-0 bg-black opacity-0" />
      </div>
    </div>
  )
}
