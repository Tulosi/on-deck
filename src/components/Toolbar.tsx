import clsx from 'clsx'
import { useChipModeControl, type ChipMode } from '../lib/chips'

// Poster labels (the badges on posters): shown / on hover / hidden — one global setting.
const MODES: { value: ChipMode; readout: string }[] = [
  { value: 'show', readout: 'Labels shown' },
  { value: 'hover', readout: 'Labels on hover' },
  { value: 'hide', readout: 'Labels hidden' },
]

/**
 * Compact 3-position switch: a pill with a round knob that slides between three slots.
 * Click a slot to jump to it; click the knob's own slot (or press Space/Enter on the switch) to cycle.
 * Arrow keys move left/right. The readout to the right says what the current position does.
 */
function LabelsToggle() {
  const [mode, setMode] = useChipModeControl()
  const index = Math.max(0, MODES.findIndex((m) => m.value === mode))
  const go = (i: number) => setMode(MODES[(i + MODES.length) % MODES.length].value)

  return (
    <div className="flex items-center gap-2.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Poster labels"
        aria-valuemin={0}
        aria-valuemax={MODES.length - 1}
        aria-valuenow={index}
        aria-valuetext={MODES[index].readout}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(Math.min(index + 1, MODES.length - 1))
          else if (e.key === 'ArrowLeft') go(Math.max(index - 1, 0))
          else if (e.key === ' ' || e.key === 'Enter') go(index + 1)
          else return
          e.preventDefault()
        }}
        className="relative flex h-5 w-[3.25rem] cursor-pointer items-center rounded-full border border-line bg-surface outline-none focus-visible:border-accent"
      >
        {/* Three click targets, one per slot. */}
        {MODES.map((m, i) => (
          <button
            key={m.value}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            title={m.readout}
            onClick={() => go(i === index ? index + 1 : i)}
            className="relative z-10 h-full flex-1"
          />
        ))}
        {/* Slot marks */}
        <span className="pointer-events-none absolute inset-x-[0.4375rem] flex justify-between">
          {MODES.map((m) => (
            <span key={m.value} className="size-1 rounded-full bg-faint/60" />
          ))}
        </span>
        {/* Knob */}
        <span
          aria-hidden="true"
          className={clsx(
            'pointer-events-none absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full shadow transition-[left,background-color] duration-200',
            mode === 'hide' ? 'bg-faint' : 'bg-accent',
          )}
          style={{ left: `calc(${index} * (100% - 1.125rem) / 2 + 0.125rem)` }}
        />
      </div>
      <span className="text-xs whitespace-nowrap text-muted">{MODES[index].readout}</span>
    </div>
  )
}

/**
 * The row under the search bar on browsing pages. Holds view options; filtering and sorting will live
 * here too (the left side is reserved for them).
 */
export function Toolbar() {
  return (
    <div className="sticky top-14 z-10 flex h-11 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <div className="min-w-0 flex-1" />
      <LabelsToggle />
    </div>
  )
}
