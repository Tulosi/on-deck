// Links to the title page of something not added yet (pages/TitlePreview.tsx).
import type { MediaType } from '../types'

/** /preview/<type>/<source>/<id>; `source` is tmdb, igdb, steam or hardcover. */
export const previewPath = (mediaType: MediaType, source: string, id: string | number) => `/preview/${mediaType}/${source}/${id}`

/** The preview link for a search result. */
export function resultPreviewPath(r: { mediaType: MediaType; tmdbId?: number; igdbId?: number; steamAppId?: number; hardcoverId?: number }) {
  if (r.mediaType === 'game') return r.igdbId ? previewPath('game', 'igdb', r.igdbId) : previewPath('game', 'steam', r.steamAppId!)
  if (r.mediaType === 'book') return previewPath('book', 'hardcover', r.hardcoverId!)
  return previewPath(r.mediaType, 'tmdb', r.tmdbId!)
}
