import { Link } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'

export function NotFound() {
  usePageTitle('Page not found')
  return (
    <div className="py-16 text-center">
      <p className="font-mono text-sm text-faint">404</p>
      <p className="mt-2 text-fg">That page doesn’t exist.</p>
      <Link to="/" className="hit mt-4 inline-block text-sm text-accent-ink hover:underline">
        Go home
      </Link>
    </div>
  )
}
