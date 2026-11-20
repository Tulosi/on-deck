import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ComingSoon } from '../components/PageHeader'
import { sampleItems } from '../data/sample'
import { mediaLabels } from '../types'

export function TitleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const item = sampleItems.find((i) => i.title.id === id)

  if (!item) {
    return <p className="py-16 text-center text-sm text-muted">Title not found.</p>
  }

  const { title } = item
  return (
    <div className="space-y-6">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Back
      </button>
      <div>
        <p className="font-mono text-xs tracking-wider text-accent-ink uppercase">{mediaLabels[title.mediaType].singular}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg">{title.title}</h1>
        <p className="mt-1 font-mono text-sm text-muted">
          {title.year} · {title.genres.join(', ')}
        </p>
      </div>
      <ComingSoon>
        The title page will hold the backdrop, synopsis, every score, status controls (Owned, progress, verdict,
        ★ favourite, priority), notes and collections. Games add Steam + gg.deals prices, historical low,
        HowLongToBeat, co-op details and Steam Deck status. Movies/TV add Plex availability and a Seerr request button.
      </ComingSoon>
    </div>
  )
}
