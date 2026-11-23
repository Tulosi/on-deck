import { lazy, useState, type ComponentType } from 'react'

/**
 * React.lazy for a page module's named export. If a chunk fails to load because a deploy replaced it, reload
 * once to pick up the new build instead of showing an error.
 *
 * `preload()` fetches the code ahead of time. Once it's in, the page renders straight away rather than
 * suspending for a beat first, which is what lets a poster morph into the title page on the very first tap.
 */
export function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  let loaded: ComponentType | null = null
  let pending: Promise<ComponentType> | null = null
  const fetchPage = () =>
    (pending ??= load().then(
      (m) => {
        sessionStorage.removeItem('ondeck.chunkReload')
        loaded = m[name]
        return loaded
      },
      (err) => {
        pending = null
        if (!sessionStorage.getItem('ondeck.chunkReload')) {
          sessionStorage.setItem('ondeck.chunkReload', '1')
          location.reload()
          return new Promise<never>(() => {})
        }
        throw err
      },
    ))
  const Lazy = lazy(() => fetchPage().then((c) => ({ default: c })))
  function Page() {
    // Chosen once per mount, so a page never swaps component (and loses its state) mid-life.
    const [C] = useState<ComponentType>(() => loaded ?? Lazy)
    return <C />
  }
  Page.preload = () => void fetchPage()
  return Page
}

/** Shown while a page's code loads: a title bar and a few blocks, no spinner. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse motion-reduce:animate-none">
      <div className="h-8 w-48 rounded-md bg-raised" />
      <div className="mt-2 h-4 w-72 max-w-full rounded bg-surface" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="aspect-[2/3] rounded-lg bg-surface" />
        ))}
      </div>
    </div>
  )
}
