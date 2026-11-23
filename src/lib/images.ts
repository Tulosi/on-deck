/**
 * Responsive image URLs. Covers are stored as full URLs (TMDB at w500, IGDB at t_cover_big), so the
 * browser can pick a smaller one for a small card or a sharper one on a high-density screen.
 * Hosts we don't know (Steam, Open Library, …) pass through unchanged.
 */

const TMDB = /^(https:\/\/image\.tmdb\.org\/t\/p\/)(w\d+|original)(\/.+)$/
const IGDB = /^(https:\/\/images\.igdb\.com\/igdb\/image\/upload\/)(t_[a-z0-9_]+)(\/.+)$/

type ImgProps = { src: string; srcSet?: string; sizes?: string }

/** Poster/cover art. `sizes` describes how wide the image is drawn, e.g. "(max-width: 640px) 45vw, 180px". */
export function coverProps(url: string, sizes: string): ImgProps {
  const t = TMDB.exec(url)
  if (t) {
    const [, base, , path] = t
    return {
      src: `${base}w342${path}`,
      srcSet: `${base}w185${path} 185w, ${base}w342${path} 342w, ${base}w500${path} 500w`,
      sizes,
    }
  }
  const g = IGDB.exec(url)
  if (g) {
    const [, base, , path] = g
    return {
      src: `${base}t_cover_big${path}`,
      srcSet: `${base}t_cover_small${path} 90w, ${base}t_cover_big${path} 264w, ${base}t_cover_big_2x${path} 528w`,
      sizes,
    }
  }
  return { src: url }
}

/** Title-page backdrop: full width, so phones get a smaller file than desktops. */
export function backdropProps(url: string): ImgProps {
  const t = TMDB.exec(url)
  if (t) {
    const [, base, , path] = t
    return { src: `${base}w1280${path}`, srcSet: `${base}w780${path} 780w, ${base}w1280${path} 1280w`, sizes: '100vw' }
  }
  const g = IGDB.exec(url)
  if (g) {
    const [, base, , path] = g
    return { src: `${base}t_1080p${path}`, srcSet: `${base}t_720p${path} 1280w, ${base}t_1080p${path} 1920w`, sizes: '100vw' }
  }
  return { src: url }
}
