import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'

const KEY = 'ondeck.sampleWelcomeClosed'

function closedThisVisit() {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Top of Home while signed out: says plainly that this is a sample library, what you can do with it, and that
 * nothing you change is kept, with Sign in and Create account. Closing it lasts until the tab is closed.
 */
export function SampleWelcome() {
  const [closed, setClosed] = useState(closedThisVisit)
  if (closed) return null
  const close = () => {
    setClosed(true)
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      // Storage blocked: it comes back on the next load.
    }
  }
  return (
    <section
      aria-labelledby="sample-welcome"
      className="relative rounded-xl border border-accent/50 bg-accent/10 px-5 py-4 sm:flex sm:items-center sm:gap-6 sm:py-5"
    >
      <div className="min-w-0 flex-1 pr-8 sm:pr-0">
        <h2 id="sample-welcome" className="text-base font-semibold text-fg">
          You’re looking at a sample library
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Try it out: mark episodes, change statuses, rate things, search. Nothing here is saved, and it all resets when you
          reload. Sign in to track your own movies, shows, games and books.
        </p>
      </div>
      <div className="mt-4 flex shrink-0 items-center gap-2 sm:mt-0 sm:pr-8">
        <Link
          to="/login"
          className="flex h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:brightness-105 sm:h-9"
        >
          Sign in
        </Link>
        <Link
          to="/login?mode=sign-up"
          className="flex h-11 items-center rounded-lg border border-line bg-surface px-4 text-sm text-fg hover:border-faint sm:h-9"
        >
          Create an account
        </Link>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Close for this visit"
        title="Close for this visit"
        className="hit absolute top-3 right-3 text-muted hover:text-fg"
      >
        <X className="size-4" />
      </button>
    </section>
  )
}
