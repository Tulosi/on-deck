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

### Plex watch sync
- Watched-up-to (shows) and status (shows and movies) follow your Plex watch history. The rules live in
  `_shared/plexApply.ts`, shared by all three places that use them:
  - **Title page:** checks Plex when you open it.
  - **Background, in the app** (`usePlexBackgroundSync`): on load and whenever the library changes, 6
    titles per pass. Just-added titles go first, so a new title syncs right after you add it; then
    In Progress / Caught up shows; then the rest. Each title is checked once per session.
  - **Server, every 3 hours** (`daily` job): 6 titles per user per run, the ones checked longest ago first
    (`user_items.plex_checked_at`), so it stays current even when the app is closed.
- Covers Wanted / In Progress / Caught up titles with Plex sync on. Never touches Dropped, or titles with
  sync switched off.
- TV rules: Watched-up-to mirrors Plex. Wanted → In Progress once anything is watched; Watched once the final
  episode of an ended show is watched. The Caught up moves then follow on the next app load.
- Movie rules: started → In Progress, finished → Watched (forward only).

### Statuses, Stalled, Archive, 3-state filters (Group B)
- **Wording per type** (`src/lib/statusLabels.ts`): Movies Want to Watch / In Progress / Watched It / Dropped It ·
  TV Want to Watch / In Progress / Caught Up or Watched It / Dropped It · Games Want to Play / Playing It /
  Stalled / Beat It / Dropped It · Books Want to Read / Reading It / Stalled / Read It / Dropped It. Mixed views
  use Wanted / In Progress / Caught Up / Stalled / Done / Dropped.
- **Stalled** (games, books): `progress = 'stalled'`, `stalled_at` set when chosen. Home → "Pick it back up?"
  lists titles stalled in the last 3 months.
- **Archive** (any status): `user_items.archived_at`. It's the button beside the status options (on phones,
  below them), with a confirmation; an archived title's page shows "Archived <date>" and **Unarchive**.
  Archived titles are hidden by default:
  - in the app: `useItems().items` excludes them (`allItems` includes them, for the title page and search)
  - in the Library: an **Archived** filter (Hidden / Include / Only), plus a "N archived titles are hidden ·
    Show" notice
  - in hand-picked collections: a notice with Show / Hide; smart collections follow their Archived rule
  - on the server: no alerts or refreshes (daily job), not in calendar feeds, not in share links
- **3-state chips** for Status, Priority, Rating, TV status, Watch progress, Co-op, Steam Deck, Deals and Length:
  tap to include → exclude → clear. Excluded chips show a red ✕ with the label struck through, and a
  "Not: …" pill. URL: excluded values get a leading "-" (`status=stalled,-dropped`). Genre and two-option
  groups stay include-only.

### Caught up (shows)
- A status for shows only: **Caught up** = every episode aired so far is watched (ignored seasons count as
  done), and the show is ongoing (TMDB Returning Series / In Production / Planned / Pilot, or a next
  episode is announced). Poster badge ✓✓. Library status filter, grouping and shared lists include it.
- Moves happen automatically on app load (`useRenewalCheck`; each move is tried once per session):
  - In Progress → Caught up when you've watched everything aired on an ongoing show.
  - Caught up → In Progress as soon as a new episode airs, so it's back in **Continue** (which only shows
    In Progress) and "New for you".
  - Caught up → Watched when the show has ended and you'd seen it all.
  - Watched → In Progress when a finished show gets new episodes (renewal).
- **Never both:** a show's status choices are Wanted · In Progress · *done* · Dropped. *done* reads
  **Caught up** while the show is ongoing and **Watched** once it has ended. Marking it by hand also moves
  Watched-up-to to the latest aired episode.
- Also automatic: **Watched → Caught up** for an ongoing show that was marked Watched.

### Backup (export / import) and Status (Group E)
- **Settings → Backup & Restore** (`src/lib/backup.ts`):
  - **Export:** a JSON file (`format: "on-deck-export"`, `version: 1`). It contains every library entry's
    tracking fields, collections (hand-picked titles in order; smart ones as their rules) and settings (region,
    streaming services, labels, alert and navigation preferences). Titles are referenced by source (media type +
    source + id), so a file works on any On Deck server.
  - **Never exported:** account links and secrets (Plex token, Seerr key, Steam link, calendar / share tokens,
    push devices), alerts, and cached prices / availability.
  - **Import merges:**
    - Titles already in the library are left untouched.
    - New ones are matched on this server or fetched from their source (3 at a time, with progress), then
      added with their tracking.
    - Same-named collections are topped up, others created.
    - Settings are replaced only when "Also replace my settings" is ticked (pre-ticked for an empty library).
    - Importing into an empty library ends with a prompt to link Plex / Seerr / Steam.
- **Settings → Status** (`StatusPanel.tsx` + the `status` function):
  - **Check now** tests TMDB, IGDB, Hardcover (including an expired token), IsThereAnyDeal, MDBList, the
    Steam store, the user's Steam account, Plex, Seerr and push.
  - Each service reads OK / Rate limited (429) / Refused (401/403, key or token rejected or expired) / Error /
    Not set up, with its response time.
  - **Background jobs:** the latest `job_runs` row for `daily` and `keyshop` (when it ran, problems, failed
    calls grouped by service and status, rate limits).
  - **Your data:** when alerts, availability and Plex progress were last refreshed.

### Steam / Plex import pickers (Group F1)
- **Settings → Import from Steam… / Import from Plex…** open `/import/steam` or `/import/plex` (`src/pages/Import.tsx`).
- Candidates come from the `importer` function:
  - **Steam:** owned games (played ones only, with playtime) plus the wishlist, matched to IGDB through Steam app ids.
    Unmatched apps are counted, not shown. A private Steam profile shows a note.
  - **Plex:** every watched movie and show in each library section (newest first), matched to TMDB by Plex guid.
- **Suggested** (pre-ticked): Steam = top 20 by playtime among games played in the last 2 years; shows = top 20 by
  episodes watched in the last 2 years; movies = top 20 watched in the last 2 years by IMDb rating (Plex's IMDb
  rating when present, else TMDB's score). It's a starting point: any title can be ticked or unticked by hand, and
  All / None / Suggested only reset the selection.
- Grid (posters) or List (checkbox rows), a filter box, and "N of M picked" per group.
- Titles already in the library are marked and can't be ticked. Titles left unticked are saved to `import_skips`
  and stay unticked on later imports ("Skipped before"); ticking one again removes the skip.
- Adding (3 at a time, with progress) uses each source's normal add, then sets a status: Steam played → Playing +
  owned; wishlist → Want; Plex movie → Watched; Plex show → Watching (Plex sync then sets the episode).

### Cast (movies & TV)
- `metadata.cast`: the top 4 billed actors (`tmdb_id`, `name`, `character`, `photo`, `imdb_id`), stored when a
  title is added or refreshed. Movies use TMDB `credits`; shows use `aggregate_credits` (the whole run). Each
  actor's IMDb id comes from `/person/{id}/external_ids`. Titles saved before this are refreshed once.
- Title page: a **Starring** row under the description (headshot, name, character), each linking to the
  actor's IMDb page, or their TMDB page if IMDb has no id.

### Collections
- Named lists that can mix movies, shows, games and books (`collections` + `collection_items` → `user_items`;
  RLS: your own only). Implementation: `src/lib/collections.ts`, `src/pages/Collections.tsx`.
- **/collections:** a grid of collections, each showing a 2×2 cover collage, its name and a count.
  **New collection** takes a name and an optional description.
- **/collections/:id:** the collection's posters in its own order, with **Arrange** (move earlier / later,
  remove), **Rename** and **Delete**. Deleting a collection never removes titles from your library.
- **Title page → Collections:** tap a collection chip to add or remove the title, or **New collection** to
  create one with it already in it.
- Phones: Collections isn't in the tab bar; it's linked from the Library page header.
- Each collection's page has a **Share** button (see Sharing).
- **Default collections** (built into the app, `BUILTIN_COLLECTIONS` in `src/lib/collections.ts`; not stored):
  **Waitlist** (Want to, not out yet; soonest first), **Early Access** (games you want, are playing or have stalled on; out, not at 1.0) and
  **Deals** (games you want and don't own, at a historical low or the deep-discount % from Settings; biggest
  discount first). They're listed first, with Smart + Default badges, and follow the Archived default (hidden).
  They can't be renamed, edited, deleted or shared (yet). **Hide this collection** on its page removes it from
  the Collections page, sidebar and More; **Settings → Collections** shows it again (`nav_layout.hidden`).
- **Sort: Discount %** (Games / All): the biggest discount off Steam's full price first, historical lows
  breaking ties.
- **Smart collections** (instead of separate "saved views"): Library → set a type, filters and sort →
  **Save as smart collection**.
  - `collections.rules` stores the Library URL form (e.g. `type=game&length=short&deal=on_sale&sort=price`).
  - The contents are whatever matches right now, in the rules' sort order, shown with an **Auto** badge.
  - **Edit rules** opens the Library with those filters (`&smart=<id>`) and a **Save changes** bar; **Open
    in Library** opens it without editing.
  - Smart collections aren't offered on title pages, since you can't add to them by hand.
  - The app keeps their `collection_items` in step with the rules (`useSmartCollectionSync`), so counts and
    share links match. A shared smart collection reflects your library as of your last visit.

### Sharing (read-only links)
- A link shares your **whole library**, **one type**, or **one collection** (`share_links`; token = 32
  random hex characters). There's at most one active link per list; creating it again reuses that link.
  **Turn off** sets `revoked_at`, after which the link shows "This link doesn't work".
- **Public page `/s/<token>`:** no sign-in. It shows covers, title, year, author/developer, score, status
  (sections In progress / Want to / Done; collections keep their own order), liked/disliked and favourites,
  with type pills when the list mixes types.
  - Never shown: notes, priorities, emails or ids. Dropped titles are left out.
  - Anonymous visitors can only call `get_shared_list(token)` and `get_share_info(token)` (security definer).
    They have no table access.
- **Where:** Settings → Sharing (pick what to share → Create link, which copies it; existing links have Copy /
  Open / Turn off), and **Share** on each collection's page.

### Early Access (games)
- `metadata.early_access` is true when **Steam's store data** lists the "Early Access" genre (first-party, wins),
  IsThereAnyDeal flags it, or the IGDB release dates say Early Access has launched and 1.0 hasn't
  (`release_milestones`). `metadata.steam_genres` is stored too, and games saved before it are refreshed once.

### Game length (time to beat)
- Source: IGDB's `game_time_to_beats`, player-submitted times in seconds. These are stored as hours in
  `metadata.time_to_beat` = `{ rushed, normal, full, players }`, or `null` when IGDB has no data.
  - HowLongToBeat has no official API, so it isn't used.
  - A "100%" time more than 5× the normal one is dropped as an outlier.
  - The lookup is best-effort and never blocks adding a game.
  - Games saved before this are refreshed once to pick it up.
- Game page: "Time to beat: About 36h · rushed 16h · 100% 71h (32 players)", or "No data yet".
- Library (Games): **Length** filter by the normal time: Short (under 10h), Medium (10–30h), Long (30–60h),
  Epic (60h+). **Sort: Length** puts the shortest first, unknown last. The Price and Length sorts are only
  offered for Games and All.

### Books (Hardcover)
- The `hardcover` Edge Function handles search and add. Hardcover's GraphQL API is used server-side only, as
  its terms require.
  - Search uses Hardcover's search index (Book). Study guides and summaries are filtered out.
  - Add reads `books_by_pk` and stores: authors, pages, series and position, genres (Hardcover's Genre tags),
    moods, reader count, rating (out of 5), description and a hardcover.app link.
- **Poster:** byline = first author; headline score = the Hardcover rating.
- **Title page:** Author(s), Series, Pages, Readers on Hardcover, plus a Hardcover link.
- **Release dates:** Hardcover's date. A future Jan 1 is treated as a year-only placeholder ("2027"). Books feed
  the Calendar (list and month views) and the books calendar link like any other type.
- **Refresh:** scores are refreshed weekly, like games.

**Wording:** the app is called On Deck, but in the interface the user's collection is always "your library",
never "your deck".

### Calendar (formerly Waitlist)
Rules live in `supabase/functions/_shared/releases.ts`, shared by the app and the feed so they always agree.
Dropped titles are left out everywhere.
- **Calendar page** (`/calendar`, in the nav; old `/waitlist` links redirect), **List** view: pre-release movies, games and shows, new seasons, and the
  next announced episode of shows that are airing. The list and calendar views always show the same entries. Sorted soonest first in sections: *Next 7 days*, one per month, *Date not final* (quarter or
  year only), then *Date TBA*. Each row shows the date and a countdown ("In 12 days"). You can filter by type.
- **Month view** (`/calendar?view=month`): the same entries on a month grid. On a phone, days show dots and tapping a day lists what's out below the grid. Only
  exact dates go on the calendar; the rest appear only in the list.
- **Calendar feed:** a private `.ics` subscription link, served by the `calendar` Edge Function. Tokens are
  stored in `calendar_feeds`: 64 random hex characters per user, and "New link" revokes the old one.
  - Works with Google Calendar ("Add to Google Calendar" opens its subscribe screen), Apple Calendar and
    Outlook (via a `webcal://` link).
  - **What's included** is chosen per link with the `only` URL parameter (one token, so each option is its own
    calendar and you can add several):
    - `new` (**default**, "New releases"): new movies, series and season premieres, game launches (Early Access
      and 1.0) and book releases. No individual episodes.
    - Under **More options**: `all` (everything, including the next episode of airing shows), and `movie`,
      `tv`, `game` or `book` (everything for that type).
  - Events are all-day, for exact dates only: releases, premieres, new seasons and the next episode. Each
    show has one "next episode" event that moves forward as episodes air. Releases from the last 60 days are
    kept so they don't vanish.
  - Google refreshes subscribed calendars on its own schedule, which can take up to a day.
  - Found on the Calendar page ("Add to your calendar") and in Settings.
- **Games' Early Access and 1.0:** from IGDB's release dates (PC entries, by release status), stored as
  `metadata.release_milestones`: the Early Access launch and the full release, each with its own precision.
  A game in Early Access shows its upcoming **Full release (1.0)**; one not out yet shows its **Early Access
  launch** and, when announced, its 1.0. The dates are fetched in a separate, best-effort IGDB call, so they
  can never stop a game being added.
- **Games' fuzzy dates:** IGDB's release date text ("Q2 2027", "2027", "TBD") is stored as
  `metadata.release_precision` / `release_label`. Without it, IGDB's stand-in date (e.g. Dec 31) would look
  exact.

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
**Built:** the daily job, the in-app inbox and Web Push. (The per-title "Notify me" switch was removed from title pages in Group A; `user_items.notify` stays on.)

- **Daily job:** the `daily` Edge Function runs every 3 hours from `.github/workflows/daily.yml`. It's only
  callable with the private `JOB_SECRET`. Each run does what fits in about 2 minutes; the next run picks up
  the rest.
  1. Refreshes titles whose dates can still change (anything with an upcoming event, unreleased statuses,
     returning shows, Early Access games), not refreshed in the last 20 h, oldest first. It re-runs each
     source's `add` (tmdb / igdb / hardcover) and compares upcoming events before and after.
  2. For each user, refreshes availability and game prices through the same functions the app uses (called
     with `x-job-secret` + `x-job-user`; see `requireUser` in `_shared/http.ts`).
  3. Writes alerts to `notifications`.
- **Alerts** (only for titles with **Notify me** on and not Dropped; episodes never alert):
  | Kind | When | Example |
  |---|---|---|
  | `release_day` | an exact-dated release / premiere / new season / Early Access / 1.0 is today in the user's time zone | "Out today: Dune: Part Three" |
  | `week_before` | the same, 7 days ahead | "Dune: Part Three: Release in one week (Dec 15, 2026)" |
  | `date_changed` | an event's date or precision changed (incl. TBA → date, "Q2 2027" → exact) | "… moved from Q2 2027 to Apr 9, 2027" |
  | `announced` | a new event appears (new season, 1.0 date) | "Low Orbit: Season 3 premiere announced — Dec 2, 2026" |
  | `available` | a Wanted / In Progress movie or show became available on Plex or your services since the last run | "Now available on Plex: …" |
  | `price_low` | a Wanted, unowned game's cheapest shown price is at its lowest ever | "Lowest price ever: … — CA$19.49 on Steam (-50%)" |
  | `price_deal` | the same game is at least the user's threshold off Steam's full price (default 30%, slider 10–90% in Settings) (and not at its lowest ever, which alerts instead). Once per sale: again only for a lower price or after 21 days | "51% off: … — CA$54.24 on AllYouPlay" |
- **Dedup:** `dedup_key` is unique per user. Release-day and one-week alerts include the date, so a delay
  re-arms them. A price alert includes the price, so only a new low alerts again.
- **Settings → Notifications:** switches for "Lowest price ever" and "Deep discounts", plus a
  % off slider for deep discounts (`profiles.alert_settings`: `price_low`, `deep_discount`, `deep_discount_pct`;
  missing = on / 30%). Release and availability alerts are always on; per title, use the
  title page switch.
- **First run** for a user: availability and price alerts that are already true are stored as already seen
  (`payload.seed`, hidden from the inbox), so switching this on doesn't flood the inbox. Deep discounts get the same treatment the first time they're checked.
- **Time zone:** the app saves the browser's time zone to `profiles.timezone`, so "today" is your day.
- **App:** a bell in the top bar shows the unread count and the inbox. Tapping an alert opens the title and
  marks it read; "Mark all read" clears the count. Title pages have a **Notifications on/off** switch
  (`user_items.notify`, default on).
- **Web Push:** Settings → Notifications → **Push to this device** subscribes this browser (one row per
  device in `push_subscriptions`) and offers **Send a test** (the `push` function).
  - The daily job pushes each run's new alerts: up to 3 individually, then one "And N more" summary. Tapping
    a push opens the title.
  - Sending is implemented directly on WebCrypto in `_shared/webpush.ts` (RFC 8291 aes128gcm encryption, checked
    against the RFC's test vector, plus RFC 8292 VAPID). Subscriptions the push service reports as gone (404/410)
    are deleted.
  - The handler is `public/push-sw.js`, loaded into the generated service worker via `workbox.importScripts`.
  - iPhone/iPad: only from the home-screen app (Share → Add to Home Screen; iOS 16.4+); Settings explains this.
    No email.

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
- **Search** searches one type at a time, picked with chips at the top of its panel (Movies · TV · Games · Books ·
  All). It follows the Library type you're browsing, otherwise your last pick (default Movies). Only that
  type's source is queried: TMDB's movie or TV search, IGDB, or Hardcover.
- **Search logic** (`src/lib/search.ts`, shared by the dropdown and the full page):
  - **Years:** a realistic year (1900 → five years ahead) in the query is searched without it, and that year's
    results rank first, then a year either side ("dresden files 2026"; "Blade Runner 2049" keeps its title).
  - **Near matches:** when there are fewer than 3 results, a looser search runs and its results are ranked by
    title similarity (≥ 0.6), giving **Close matches** and **Did you mean …?** (≥ 0.6, the best one).
    - Movies / TV (TMDB): words trimmed to ~60% ("intersteller" → "interste" → Interstellar).
    - Games (IGDB): its search needs whole words, so it does a "name contains" lookup on the first 4 letters
      of the longest word, most-rated first (`fuzzy: true`).
    - Books: Hardcover's search already tolerates typos.
  - **Series-aware book search:** when the books found belong to a series whose name contains every query word
    (most common, closest name: "The Dresden Files" over "Dresden Files: War Cry"), that series' numbered books
    (newest first, one per title, no boxsets) are added after the top 3 title matches. These books often lack
    the series name in their title (Twelve Months = Dresden Files #18), so "dresden files 2026" now finds it.
  - **Full results:** `/search?q=…&type=…` asks each source for up to 40 results (the dropdown asks for 12).
    It's opened by **Open full results** at the bottom of the dropdown, or by pressing Enter. Previews open on
    top of the results.
  On phones the sidebar becomes a bottom tab bar.
- **Sidebar (desktop):** media categories on top (Home · Library with Movies / TV / Games / Books · Calendar),
  then a **divider**, then **Collections** with each of your collections (✦ = smart). Everything can be
  rearranged by drag and drop, or with Alt + ↑/↓ on a focused item, within its own section: the main items,
  the types inside Library, and the collections. Nothing crosses the divider. The order is saved to
  `profiles.nav_layout` (signed out: this browser). Implementation: `src/lib/navLayout.ts`, `Sidebar.tsx`.
- **Phone tab bar:** up to 5 tabs you choose (default: Home, then the four media types: Home · Movies · TV · Games · Books) plus **More**, which holds Library, Calendar and the rest. More
  opens a sheet with the remaining pages, your collections below a divider, Settings and "Customize tab bar".
  More is highlighted when you're on a page that isn't a tab.
  - **Settings → Navigation** (`#navigation`): pick and order the tabs. Rows drag by their handle (mouse or
    touch, via pointer events) or move with ↑ / ↓; − sends a tab to More, + adds one (up to 5).
  - Stored as `nav_layout.tabs`. Implementation: `BottomNav.tsx`, `NavSettings.tsx`.
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
