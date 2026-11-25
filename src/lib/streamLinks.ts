// Where a "Where to watch" service button goes. TMDB's watch data (by JustWatch) names the service but has no link to
// the title on it, so the best we can do is the service's own search for the title (usually one tap from it), else
// the service's home page (Disney+, Hulu and Max have no search address that works from a link), else TMDB's page of
// watch options for the title (which links out to each service).

type Rule = { match: RegExp; search?: (q: string) => string; home: string }

const RULES: Rule[] = [
  { match: /^netflix/i, search: (q) => `https://www.netflix.com/search?q=${q}`, home: 'https://www.netflix.com' },
  { match: /^amazon prime video|^prime video/i, search: (q) => `https://www.primevideo.com/search?phrase=${q}`, home: 'https://www.primevideo.com' },
  { match: /^hulu/i, home: 'https://www.hulu.com' },
  { match: /^disney/i, home: 'https://www.disneyplus.com' },
  { match: /^(hbo )?max$/i, home: 'https://play.hbomax.com' },
  { match: /^apple tv/i, search: (q) => `https://tv.apple.com/search?term=${q}`, home: 'https://tv.apple.com' },
  { match: /^youtube/i, search: (q) => `https://www.youtube.com/results?search_query=${q}`, home: 'https://www.youtube.com' },
  { match: /^crunchyroll/i, search: (q) => `https://www.crunchyroll.com/search?q=${q}`, home: 'https://www.crunchyroll.com' },
  { match: /^tubi/i, search: (q) => `https://tubitv.com/search/${q}`, home: 'https://tubitv.com' },
  { match: /^peacock/i, home: 'https://www.peacocktv.com' },
  { match: /^paramount/i, home: 'https://www.paramountplus.com' },
  { match: /^pluto/i, home: 'https://pluto.tv' },
  { match: /^the roku channel/i, home: 'https://therokuchannel.roku.com' },
  { match: /^plex/i, home: 'https://watch.plex.tv' },
  { match: /^shudder/i, home: 'https://www.shudder.com' },
  { match: /^amc\+/i, home: 'https://www.amcplus.com' },
  { match: /^starz/i, home: 'https://www.starz.com' },
  { match: /^mgm/i, home: 'https://www.mgmplus.com' },
  { match: /^britbox/i, home: 'https://www.britbox.com' },
  { match: /^fubo/i, home: 'https://www.fubo.tv' },
  { match: /^kanopy/i, home: 'https://www.kanopy.com' },
  { match: /^hoopla/i, home: 'https://www.hoopladigital.com' },
  { match: /^criterion/i, home: 'https://www.criterionchannel.com' },
  { match: /^mubi/i, home: 'https://mubi.com' },
  { match: /^showtime/i, home: 'https://www.paramountplus.com' },
]

/** A link for `service`, aiming at `title` on it where the service has a search. */
export function streamLink(service: string, title: string, fallback: string | null): { href: string; kind: 'search' | 'home' | 'options' } | null {
  const rule = RULES.find((r) => r.match.test(service.trim()))
  if (rule?.search) return { href: rule.search(encodeURIComponent(title)), kind: 'search' }
  if (rule) return { href: rule.home, kind: 'home' }
  return fallback ? { href: fallback, kind: 'options' } : null
}
