# On Deck — Product Spec

A shortlist for the Movies, TV, Games and Books you actually intend to get to.
On Deck is not a catalogue of everything you've ever seen; it's the stuff that's *next*,
cut out from the noise.

## Architecture

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite, Tailwind CSS v4, TanStack Query, React Router |
| Hosting | GitHub Pages (static), deployed by GitHub Actions |
| Auth | Supabase Auth — email + password (with password reset) |
| Database | Supabase Postgres with Row Level Security (users see only their own rows) |
| Server logic | Supabase Edge Functions (Deno) — proxy every keyed / CORS-blocked API, cache results |
| Scheduled jobs | Supabase cron (pg_cron) — daily price refresh for Wanted games; daily release check for followed titles |
| Notifications | In-app inbox + Web Push (PWA, VAPID). No email. |
| Mobile | Responsive + installable PWA |

Secrets (API keys, Plex tokens) never reach the browser. The frontend only knows the
Supabase URL and the public anon key.

## Data sources

| Category | Metadata / cover art | Scores shown | Extras |
|---|---|---|---|
| Movies | TMDB | IMDb + Rotten Tomatoes (OMDb) | Upcoming releases, Plex availability + request via Seerr |
| TV | TMDB | IMDb + Rotten Tomatoes (OMDb) | Season/episode progress, upcoming seasons, Plex availability + request via Seerr |
| Games (PC/Steam only) | IGDB | Steam review % | Steam price, gg.deals best price + historical low, co-op details, Steam Deck status, HowLongToBeat |
| Books | Hardcover | Hardcover rating | — |

Notes:
- HowLongToBeat has no official API; uses an unofficial scraper. Treat as optional — the UI must not break when it's missing.
- gg.deals API terms / rate limits to be verified before building on it.
- Price region + currency is a **per-user** setting.
- Imports (Steam, Letterboxd, Goodreads, Trakt) are out of scope for v1.

## Tracking model (per user, per title)

- **Owned** — independent toggle.
- **Progress** — `wanted → in_progress → completed | dropped`.
  Displayed as Watched / Played / Read for the media type.
- **Verdict** — `liked | disliked` (thumbs only, no numeric score).
- **All-Time Favourite** — independent ★ toggle.
- **Priority** — `high | medium | low`, filterable.
- **Notes** — free text.
- **TV progress** — current season / episode (shown as `S2 · E4` under the poster).
- **Collections** — user-named lists that can mix media types.

## Sharing

Lists are private. A user can create a read-only share link for their whole library,
one media type, or one collection, and revoke it later.

## Plex / Seerr integration (Movies + TV)

- Each user links their Plex account in **Settings** (Plex PIN sign-in flow) and enters their own Seerr URL.
- Seerr instances are reachable over public HTTPS.
- An Edge Function signs in to Seerr with the user's Plex token, then for each TMDB ID reports:
  **Available on Plex / Requested / Not available**, and can submit a request.
- The Plex token is stored server-side only, never returned to the browser.

## Pre-release media & release tracking

Users can add titles that aren't out yet and follow their release. "Wanted" plus a future
release date reads as **Awaiting release**. That label is derived from the data, not a separate status.

### Release data

| Category | Source | What's tracked |
|---|---|---|
| Games | IGDB release dates + status, Steam `coming_soon` / Early Access genre | Release date (exact or fuzzy), Early Access → 1.0 |
| Movies | TMDB release dates by type and country | Theatrical **or** digital release, chosen per movie (default: digital) |
| TV | TMDB `next_episode_to_air`, season air dates | Next **season premiere** (not individual episodes) |
| Books | Hardcover | Publication date |

**Fuzzy dates:** every release date has a precision: `day | month | quarter | year | tbd`.
The countdown only shows "in X days" for exact dates. Otherwise it shows the precision as given:
"March 2027", "Q2 2027", "2027" or "TBA". Never invent a false exact date.

### Countdown display
- Poster card: a small chip, e.g. `12 DAYS`, `MAR 14`, `Q2 2027`, `EARLY ACCESS`.
- Title page: the full date, which release type it is, a release history if the date has slipped,
  and a **Notify me** toggle.
- Home: a **Coming Soon** row, sorted by soonest release with exact dates first.

### Notifications
- **Opt-in per title** with a "Notify me" toggle. It's on by default when adding a pre-release title.
- **Triggers:**
  - one week before release, once the date is exact
  - on release day
  - when the date firms up or changes, e.g. "Q2 2027" becomes "Apr 9", a delay, or a release pulled forward
  - Steam Early Access → 1.0 (full release)
  - new TV season premieres
- **Channels:**
  - an in-app inbox (bell icon with unread count), always on
  - Web Push to phone or desktop through the installed PWA; per-user, opt-in per device
  - Push on iPhone only works when the app is added to the home screen (iOS 16.4+)
- No email for now.
- **Mechanics:**
  - a daily cron Edge Function (`refresh-releases`) re-checks every followed, unreleased title
  - it compares against the stored state and writes events: date_changed, released, left_early_access, new_season
  - it then fans out notifications to followers and sends Web Push using VAPID keys stored as server secrets
- **Dedup:** each (user, title, event) is notified once. Release-day and one-week alerts are tied to
  the specific date, so a delay re-arms them.

### Schema additions (future migration)
- `titles`: `release_date`, `release_precision`, `release_status` (`announced | early_access | released | cancelled`),
  `next_season_date`, `release_history jsonb`.
- `user_items`: `notify_release boolean`, `movie_release_type` (`theatrical | digital`).
- `notifications`: user inbox (user_id, title_id, kind, payload, created_at, read_at).
- `push_subscriptions`: Web Push endpoints per user and device.
- `release_events`: change log written by `refresh-releases`.
- All new tables need explicit grants (see README).

## UI

- Plex-style shell: left sidebar (Home, Movies, TV Shows, Games, Books, Collections, Settings), top search bar.
  On phones the sidebar becomes a bottom tab bar.
- **Home**: horizontal poster rows — Up Next (high priority), In Progress, Coming Soon (countdowns), On Sale, Recently Added.
- **Category pages**: filterable poster grid. Filters: genre, year, status, priority; games add feature filters
  (co-op online/local, PvP, Steam Deck status, HLTB length).
- **Theme**: dark by default, optional light. Palette: black, warm grey, lemon yellow.

### Poster card (Library view)
- Status + verdict badges (Owned, In Progress / Completed, Liked / Disliked, ★ Favourite)
- One headline review score (IMDb for film/TV, Steam % for games, Hardcover for books)
- Games, **unowned only**: sale / best price badge
- Movies/TV: Plex availability dot (available / requested / missing)
- Title, year, secondary line (e.g. `S2 · E4`, platform, author)

### Title page (click-through)
Everything else: backdrop, synopsis, all scores, both prices + historical low, HLTB times,
co-op details, Steam Deck status, where-to-request on Plex, status controls, notes, collections.
