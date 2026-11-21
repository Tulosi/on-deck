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
| Movies | TMDB | IMDb, Rotten Tomatoes (critics + audience) — MDBList, OMDb fallback | Upcoming releases, Plex availability + request via Seerr |
| TV | TMDB | IMDb, Rotten Tomatoes (critics + audience) — MDBList, OMDb fallback | Season/episode progress, upcoming seasons, Plex availability + request via Seerr |
| Games (PC/Steam only) | IGDB | Steam review %, Metacritic | Steam price, gg.deals best price + historical low, co-op details, Steam Deck status, HowLongToBeat |
| Books | Hardcover | Hardcover rating | — |

Notes:
- HowLongToBeat has no official API; uses an unofficial scraper. Treat as optional — the UI must not break when it's missing.
- gg.deals API terms / rate limits to be verified before building on it.
- Price region + currency is a **per-user** setting.
- Imports (Steam, Letterboxd, Goodreads, Trakt) are out of scope for v1.

## Games — data (part 1 built)
- **Search & add:** IGDB, PC only (`igdb` function). Results show the year and developer.
- **Stored per game:** cover, artwork, summary, developer / publisher, IGDB genres / themes / modes /
  perspectives, Steam app id.
- **From IsThereAnyDeal game info:** Steam review %, Metacritic, Early Access, Steam user tags. The tags are used
  as the game's genres for filtering (e.g. Roguelike, Hack and Slash).
- **From the Steam store:** co-op categories (Online / Local co-op, split-screen, PvP) and free-to-play.
- **From Steam's compatibility report:** Steam Deck status (Verified / Playable / Unsupported).
- Steam's own reviews endpoint now redirects, so the review % comes from IsThereAnyDeal.
- Poster score is Steam %. Scores and details refresh weekly (daily until a game has a Steam score).
- Unreleased games get the pre-release flag.
- **Part 2 (built):** prices (`prices` function → shared `game_prices` cache per region, refreshed every 12 h),
  Steam ownership + playtime, games filters (genre/tags, co-op, Steam Deck, Early Access, deals, max price),
  Sort: Price, and a Home **Deals** row. **Still to do:** HowLongToBeat + a length filter.

## Game pricing (built)

**Rule: Steam first.** Steam's own price is always shown. Other sources appear **only when strictly cheaper
than Steam**, and Steam wins ties.

| Row | Source | Shown when |
|---|---|---|
| **Steam** | Steam store `appdetails` for the user's region (`price_overview`: current, full price, discount) | Always, if Steam has a price |
| **Cheaper Steam key** | IsThereAnyDeal: cheapest *other* store selling a Steam key (DRM = Steam). Platform stores (Epic, Microsoft, GOG, EA, Ubisoft) are excluded | Cheaper than Steam |
| **Cheaper on key shops** | gg.deals: cheapest key-shop offer (fetched every 6 h by a GitHub Actions job, since gg.deals doesn't answer Supabase's servers) | Cheaper than Steam |

- **Discount %** is always measured against Steam's full price.
- **Historical low:** each row is compared with its own source's lowest-ever (Steam's own low, the lowest
  among Steam-key stores, or gg.deals' key-shop low).
- **Free-to-play** games show "Free-To-Play". With no Steam price yet (e.g. pre-order), any alternative is
  shown on its own.
- **Poster** (unowned games): the cheapest shown option, e.g. `-62% · $14.99 · LOW`, or `FREE-TO-PLAY`.
  Unreleased games show their release chip instead.
- **Title page:** the Steam row, plus cheaper rows under it, each linked. The cheapest is highlighted when
  there's more than one.
- **Refresh:** a shared cache per (title, region) in `game_prices`, refreshed every 12 h, after adding a game,
  and in full on region change.

## Steam ownership check (Games) — built
- **No library import.** On Deck only checks whether games on your deck are already owned.
- **Linking:** Settings → **Connect Steam** uses Steam's own sign-in (OpenID) on steamcommunity.com, so On Deck
  never sees your password. The `steam` function verifies the sign-in reply with Steam (check_authentication)
  before storing the SteamID (`profiles.steam_id`, `steam_name`). **Disconnect** removes it.
- **When it checks:** right after a game is added, once per app load, and from Settings → **Check Steam
  library**. It uses `GetOwnedGames` (Steam Web API key, server-side) and marks matching games (by Steam app
  id) **In Your Library**.
- **Playtime → In Progress:** the same check stores each game's Steam playtime and last-played date
  (`steam_playtime_minutes`, `steam_last_played`, shown on the Tracking card). Any playtime moves a **Wanted**
  game to **In Progress**. This is forward only: it never touches other statuses.
- **Manual changes win:** changing In Your Library yourself sets `user_items.owned_locked`, and changing Status
  sets `progress_locked`. The check never overrides either again.
- **Privacy:** needs the Steam profile's **Game details** set to Public. When it's private, Settings says so.

## Tracking model (per user, per title)

- **Progress** — `wanted → in_progress → completed | dropped`.
  Displayed as Watched / Played / Read for the media type.
- **Verdict** — `liked | disliked` (thumbs only, no numeric score).
- **All-Time Favourite** — independent ★ toggle.
- **Priority** — `high | medium | low`, filterable.
- **Notes** — free text.
- **Title page card "Tracking"** — fields: **Status** (Wanted / In Progress / Watched·Played·Read / Dropped),
  **Progress** (TV: last episode watched, with a watched / aired completion bar), **Rating** (Liked /
  Didn't like / ★ All-Time Favourite), **Priority**, **Notes**.
- **TV progress** — the last episode watched (shown as `S2 · E4` under the poster).
  Picked with season and episode dropdowns limited to the show's real seasons and episode counts.
- **Plex watch sync (TV)** — one source of truth at a time, per show (`user_items.plex_sync`, default on).
  - **Sync on** and the show is on the user's Plex: **Progress** is read-only and mirrors the user's own
    Plex watch history exactly, forwards or backwards (`plex-watch` function: finds the show on their servers
    by title, confirms it by TMDB id, reads per-episode view counts). It shows "S1 · E8 · from Plex · <server>",
    with **Sync from Plex** and **Override** buttons.
  - **Override** turns sync off for that show: the dropdowns become the only value, with a note showing what
    Plex says and a **Use Plex sync** button that turns it back on and adopts Plex's value.
  - **Not on Plex / Plex not linked**: dropdowns only.
  - Progress while syncing: Wanted becomes In Progress once anything is watched, and Watched once the final
    episode of an ended or cancelled show is watched. Dropped is never changed.
- **Plex watch sync (Movies)** — same per-title switch (`plex_sync`), **forward only**: started in Plex
  (resume point, no completed play) moves Wanted → **In Progress**; finished (view count > 0) moves Wanted or
  In Progress → **Watched**. It never moves a movie backwards, since it may have been watched outside Plex, and
  never touches Dropped. A **Progress** row shows "Not started" / "45% watched" / "Watched", from Plex, with a bar,
  **Sync from Plex** and **Override** / **Use Plex sync**. Hidden when the movie isn't on the user's Plex.
- **Per-season tracking (TV)** — under Progress, a collapsed-by-default **More options** panel lists each
  season (aired and watched counts) with **Auto · Watched · Unwatched · Ignore** (`user_items.season_overrides`,
  `{ "<season>": "watched" | "unwatched" | "ignored" }`; Auto = not listed).
  - **Auto** follows Progress, and Plex sync.
  - **Watched / Unwatched** force the whole season.
  - **Ignore** counts the season as done: it's tallied in the count (e.g. `15 / 15 · 7 ignored`) and drawn in pale
    orange on the progress bar. It's skipped for "caught up" when marking the show Watched.
- **Renewing shows (TV)** — a show marked **Watched** counts as caught up as of when it was marked
  (`completed_at`). Marking it Watched by hand (when Plex isn't syncing it) also sets Progress to the latest
  aired episode. If an episode airs after `completed_at` (the show's last air date is later), it goes back to
  **In Progress** automatically. This is checked across the whole list whenever the app loads. To notice new
  episodes promptly, a show's details are refreshed as soon as its stored "next episode" date has passed,
  rather than only weekly with the review scores.
- **In Your Library** — the "owned" flag, for games and books only. Movies and TV show **Available**
  (on Plex or one of the user's streaming services) or "Not available via any of your sources" instead.
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

## Where to watch (Movies + TV)

A **Where to watch** section on the title page, in this order:

1. **Plex** (only once the user has linked Plex and entered their Seerr URL in Settings).
   - The status comes from the user's own Seerr, which already tracks what's on their Plex:
     On your Plex (with **Open in Plex** when Seerr provides a link), Partly on your Plex,
     Requested (awaiting approval or downloading), or Not on your Plex.
   - "Partly on your Plex" keeps its **Open in Plex** link. Once the rest is requested it shows **Requested**
     instead of the request button.
   - **Movies:** a **Request on Seerr** button when the movie is missing.
   - **TV:** **Request seasons** opens a season picker, like Seerr's own dialog. Each season shows On Plex,
     Requested, or nothing if it's missing. You tick individual missing seasons or **All missing seasons**.
     Seasons already on Plex or requested can't be picked, and specials (season 0) are left out.
   - If Plex or Seerr isn't set up, the section shows a quiet "Connect Plex & Seerr" prompt instead.
2. **Streaming services, opt-in.** Under Settings → Streaming services, the user picks the services they
   have from the full list for their region, most popular first, with a search box. The choice is stored in
   `profiles.streaming_services`.
   - Title pages show only those services: included with the subscription, or free/ad-supported.
     **Rent and buy are never shown.**
   - With no services picked, the section shows a "Choose your streaming services" prompt.
   - Data comes from TMDB's watch providers (by JustWatch, credited on the page as TMDB requires), for the
     user's region (Settings → Region).
   - Add-on channels are merged into their service, e.g. "Shudder Amazon Channel" counts as Shudder.
   - Looked up live and cached in the app for an hour, since availability changes too often to store.

**Plex linking** uses Plex's PIN sign-in: the user approves On Deck on plex.tv, so their password
never touches On Deck. The token is stored server-side only (`user_integrations`).
**The Seerr URL** must be public https. The server rejects localhost and private-network addresses.

**Later:**
- poster badges for availability
- an alert when a title arrives on Plex or on one of the user's services (alongside release alerts)

## Pre-release media & release tracking

Users can add titles that aren't out yet and follow their release. "Wanted" plus a future
release date reads as **Awaiting release**. That label is derived from the data, not a separate status.

### Pre-release flag (built)
A movie or show is **pre-release** when its release / first-air date is in the future, or when it has no date and
TMDB lists it as not released (Rumored, Planned, In Production, Post Production). Shown as:
- **Poster:** a bottom-left chip: `TODAY`, `TOMORROW`, `IN 12 DAYS` (within a month), `DEC 18`, `MAR 14 '27`,
  or `TBA`.
- **Title page:** a "Pre-release · Dec 15, 2026 · in 25 days" badge. The side panel says Releases / Premieres
  instead of Released / First aired.
- **Home:** a **Coming Soon** row, soonest first, with TBA titles last.

### TV schedule flags (built)
For released shows with an announced next episode (TMDB `next_episode_to_air`):
- **Airing** (next episode isn't a premiere), in blue:
  - poster chip `NEW EP TODAY` / `NEXT EP WED` (within a week) / `NEXT EP DEC 3`
  - title badge "Airing · Next episode S2 · E8 — Wed, Nov 25 · in 5 days"
- **New season** (next episode is E1), in yellow:
  - poster chip `S3 IN 12 DAYS` (within a month) / `S3 · MAR 14`
  - title badge "New season · Season 3 premieres Mar 14, 2027 · in 114 days"
- A show that hasn't premiered at all shows the pre-release flag instead.

### Waitlist & calendar (planned — not built)
- **Waitlist page:** every pre-release title on your deck (movies, shows, games, and new seasons of shows you
  follow), soonest first, with release dates prominent and TBA titles last.
- **Calendar view:** a month grid of upcoming releases, premieres and new episodes. Click a day to see what's
  out.
- **Calendar feed:** a private subscription link (`.ics`, iCalendar) served by an Edge Function. Each user gets a
  secret token URL they can revoke and regenerate. Works with Google Calendar ("From URL"), Apple Calendar and
  Outlook. Events: releases, premieres, new episodes (all-day events; title + type in the summary, link back to
  On Deck).
  - Caveat: Google Calendar refreshes subscribed feeds on its own schedule (typically every several hours to
    a day), so changes show up with a delay.

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
- **Home**: "what's next, and what's changed". Rows: Continue · New for you · This week · Ready to start · Deals.
  Browsing, filtering and sorting live on the **Library** page (see docs/FILTERING.md). Full design: docs/HOME.md
  (proposal; today's Home still has the older rows).
- **Category pages**: filterable poster grid. Filters: genre, year, status, priority; games add feature filters
  (co-op online/local, PvP, Steam Deck status, HLTB length).
- **Theme**: dark by default, optional light. Palette: black, warm grey, lemon yellow.

### Poster card (Library view)
- Status + verdict badges (Owned, In Progress / Completed, Liked / Disliked, ★ Favourite)
- One headline review score (IMDb for film/TV, Steam % for games, Hardcover for books)
- Games, **unowned only**: cheapest price (Steam or key shop) with its % off Steam's full price
- Movies/TV: Plex availability dot (available / requested / missing)
- Title, year, secondary line (e.g. `S2 · E4`, platform, author)

### Toolbar & poster labels
Browsing pages (Home, Movies, TV, Games, Books, Collections) have a toolbar row under the search bar. It holds
view options now; filtering and sorting will move there too.
- **Poster labels** (the badges on posters: score, status, rating, price, Plex, release …): a compact 3-position
  switch, a pill with a sliding round knob, with a readout to its right: **Labels shown** (default) ·
  **Labels on hover** (revealed on hover or keyboard focus) · **Labels hidden**.
- Click a position to jump to it, or the current one to cycle. Arrow keys work too.
- Saved to the profile (`profiles.card_chips = {"all": mode}`) when signed in, or kept in the browser when
  signed out.

### Title page (click-through)
Everything else: backdrop, synopsis, all scores, the Steam vs key-shop price breakdown (see Game pricing), HLTB times,
co-op details, Steam Deck status, where-to-request on Plex, status controls, notes, collections.
