import clsx from 'clsx'

const DIGITS = '0123456789'

/**
 * Text whose digits roll like an odometer when they change ("S02E05" → "S02E06": only the last digit moves).
 * Letters and other characters are plain. Nothing moves on first render, and reduced motion turns it off.
 * Screen readers get the whole string once.
 */
export function RollingText({ text, className }: { text: string; className?: string }) {
  // Key digit columns by their place counted from the end, so "E9" → "E10" keeps the ones column in place.
  const chars = [...text]
  return (
    // Relative, so the hidden screen-reader copy stays inside it: otherwise, in a card scrolled off to the side, it sat
    // outside the card's clipping and widened the page on phones (which pushed pop-ups off the right edge).
    <span className={clsx('relative inline-flex', className)}>
      <span className="sr-only">{text}</span>
      {chars.map((c, i) => {
        const place = chars.length - i
        const d = DIGITS.indexOf(c)
        if (d < 0)
          return (
            <span key={`c${place}`} aria-hidden="true">
              {c}
            </span>
          )
        return (
          <span key={`d${place}`} aria-hidden="true" className="roll-digit">
            <span className="roll-strip" style={{ transform: `translateY(${-d * 10}%)` }}>
              {DIGITS.split('').map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
          </span>
        )
      })}
    </span>
  )
}
