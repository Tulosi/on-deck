import type { ReactNode } from 'react'

export function PageHeader({ title, meta, children }: { title: string; meta?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {meta && <span className="text-sm text-faint tabular-nums">{meta}</span>}
      </div>
      {/* One cluster on the right, so buttons don't spread across the row or shift when one comes and goes. */}
      {children && <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>}
    </div>
  )
}

/** Dashed box marking a feature that isn't built yet. */
export function ComingSoon({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-6 text-sm text-muted">{children}</div>
  )
}
