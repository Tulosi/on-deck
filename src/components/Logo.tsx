import { useId } from 'react'

/*
  The mark is drawn like type. The D's cap height runs 26–74. The O is round, so it overshoots that by 1 above and
  below, or it would look shorter than the D. The voids (the O's counter and the play button in the D) are a
  touch smaller than the geometry suggests: 8% on the dark theme, about 16% on the light one. Light shapes on dark read
  bigger than they are (irradiation), and on paper the counter and the lemon play are the light shapes, so they
  shrink more. The play sits on the D's centre of mass (73.7, 50), not just inside its box.
*/
const D_PATH = 'M57 26 H71 A24 24 0 0 1 71 74 H57 Z'
const GEOMETRY = {
  dark: { ring: 18.48, ringWidth: 13.04, play: '68.45,40.34 68.45,59.66 84.09,50', round: 4.14 },
  light: { ring: 17.93, ringWidth: 14.13, play: '68.93,41.22 68.93,58.78 83.14,50', round: 3.76 },
} as const

/**
 * On Deck's mark: an O, and a D whose inside is a play button.
 * Dark theme: a cream O and a lemon D, the play cut through to whatever is behind.
 * Light theme: lemon on paper is too faint (about 1.2:1), so the O and D are espresso and the play is lemon.
 * Both versions are drawn; index.css shows the one for the current theme (.od-logo-dark / .od-logo-light).
 */
export function Logo({ className = 'h-[18px] w-auto' }: { className?: string }) {
  // useId has colons in it, which a url(#…) reference can't take.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <svg viewBox="2 24 94 52" className={className} aria-hidden="true">
      {(['dark', 'light'] as const).map((theme) => {
        const g = GEOMETRY[theme]
        const mask = `od-play-${theme}-${id}`
        return (
          <g key={theme} className={`od-logo-${theme}`}>
            <mask id={mask}>
              <rect x="0" y="0" width="100" height="100" fill="white" />
              <polygon points={g.play} fill="black" stroke="black" strokeWidth={g.round} strokeLinejoin="round" />
            </mask>
            <circle cx="28" cy="50" r={g.ring} fill="none" stroke="var(--od-fg)" strokeWidth={g.ringWidth} />
            <path d={D_PATH} fill="var(--od-logo-d)" mask={`url(#${mask})`} />
            {theme === 'light' && (
              <polygon points={g.play} fill="var(--od-logo-play)" stroke="var(--od-logo-play)" strokeWidth={g.round} strokeLinejoin="round" />
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo />
      <span className="text-[17px] font-semibold tracking-tight text-fg" translate="no">
        On Deck
      </span>
    </span>
  )
}
