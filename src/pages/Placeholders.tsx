import { Link, useParams } from 'react-router-dom'
import { ComingSoon } from '../components/PageHeader'
import { Wordmark } from '../components/Logo'

/** Public, read-only view of someone's shared list. Lives outside the app shell. */
export function SharedList() {
  const { token } = useParams()
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Wordmark />
      <div className="mt-8">
        <ComingSoon>Shared list <code className="font-mono">{token}</code> will render here, read-only.</ComingSoon>
      </div>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="font-mono text-sm text-faint">404</p>
      <p className="mt-2 text-fg">That page doesn’t exist.</p>
      <Link to="/" className="mt-4 inline-block text-sm text-accent-ink hover:underline">
        Go home
      </Link>
    </div>
  )
}
