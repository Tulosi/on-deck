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

const pulse = 'animate-pulse motion-reduce:animate-none'

/** Home while the library loads: the Up next card and two short lists, in their real places. */
export function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className={`space-y-10 ${pulse}`}>
      <div>
        <div className="h-6 w-24 rounded-md bg-raised" />
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className={`h-64 rounded-lg border border-line bg-surface ${i > 0 ? 'max-md:hidden' : ''} ${i > 1 ? 'max-xl:hidden' : ''}`} />
          ))}
        </div>
      </div>
      <div className="max-w-xl space-y-3">
        <div className="h-5 w-28 rounded-md bg-raised" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-9 rounded-md bg-surface" />
        ))}
      </div>
    </div>
  )
}

/** A title page while the library loads: backdrop band, cover, title lines and the Tracking card. */
export function TitleSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className={`-mx-4 -mt-6 md:-mx-6 ${pulse}`}>
      <div className="h-40 bg-surface sm:h-52 md:h-60" />
      <div className="relative -mt-16 flex max-w-5xl items-end gap-4 px-4 sm:gap-5 md:-mt-24 md:px-6">
        <div className="aspect-[2/3] w-24 shrink-0 rounded-lg border border-line bg-raised sm:w-36 md:w-40" />
        <div className="flex-1 space-y-2 pb-1">
          <div className="h-7 w-2/3 rounded-md bg-raised" />
          <div className="h-4 w-1/3 rounded bg-surface" />
        </div>
      </div>
      <div className="mt-6 max-w-5xl px-4 md:px-6">
        <div className="h-48 rounded-lg border border-line bg-surface" />
      </div>
    </div>
  )
}

/** A list of rows (Collections) while it loads. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className={`space-y-2 ${pulse}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 rounded-lg border border-line bg-surface" />
      ))}
    </div>
  )
}
