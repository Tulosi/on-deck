// Layout pieces shared by the Settings page and its sections.
import { type ReactNode } from 'react'

export const inputClass =
  'h-9 rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint focus:border-accent'
export const buttonClass =
  'flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-fg hover:border-accent disabled:opacity-60'
export const primaryButtonClass =
  'flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:brightness-95 disabled:opacity-60'

export function Section({
  title,
  description,
  sub,
  id,
  children,
}: {
  title: string
  description?: string
  /** A part of a larger card (Connections): no card of its own, a rule above it instead. */
  sub?: boolean
  /** Anchor for the links at the top and for /settings#… links. */
  id?: string
  children: ReactNode
}) {
  const Heading = sub ? 'h3' : 'h2'
  return (
    <section
      id={id}
      className={
        sub
          ? 'scroll-mt-20 space-y-3 border-t border-line pt-5 first:border-t-0 first:pt-0'
          : 'scroll-mt-20 space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-5'
      }
    >
      <div>
        {/* Three levels: card title (lg), part of a card (sm semibold), and small muted group labels inside. */}
        <Heading className={sub ? 'text-sm font-semibold text-fg' : 'text-lg font-semibold tracking-tight text-fg'}>{title}</Heading>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
      />
      <span>
        <span className="block text-sm text-fg">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  )
}
