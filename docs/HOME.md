# Home — "what's next, and what's changed"

Status: **steps 1–2 built** (Continue, This week, Ready to start; stored availability). Written 2026-11-20.

## Purpose
Home and Library do different jobs:

| | Library | Home |
|---|---|---|
| Question it answers | "What's on my list?" | "What should I do next, and what's changed?" |
| Content | Everything, filtered and sorted by you | A short, computed set of things that need attention |
| How rows are made | Filters (URL state) | Dates, changes and availability, worked out for you |

If a Home row could be reproduced with a Library filter, it doesn't belong on Home. That makes Recently Added,
Recently Finished and plain priority lists Library views, not Home rows.

## Rows (top to bottom, each hidden when empty)

### 0. Up next (Ember redesign, 2026-11-23)
The most recent Continue item, as one card above the rows: poster, title, the next step set large in mono
(`S02E05`, or hours played for a game), a short note ("Out now", "Out Tue, Nov 25", "Caught up"), and a bar for
this season's episodes or hours against time to beat. Its one accent button is **Mark S02E05 watched** when that
one-tap save is offered (signed in, episode out, Plex not tracking the show); otherwise **Open in Plex** when the
title is on your Plex (link from Seerr), else **Open show**. A facts row sits above the buttons: Watch on, Network
and Latest episode for shows, Watch on and Runtime for movies (each shown only when known). Continue
below lists the rest as compact rows (up to 5, with the next episode or hours on the right and a check button
for the one-tap save), and **Next 7 days** is a dated list beside it on wide screens ("Tomorrow  Show  S02E06").
Above the card, a quiet line names your linked services (Plex, Seerr, Steam) and when the background refresh last
ran; it opens Settings → Status. The old Continue and This week poster rows are gone.

### 1. Continue
Things you're in the middle of, with **the next concrete step**.
- **TV:** In Progress shows. The subline is the next episode after Progress, and whether it's out:
  "S2 · E5 — out now" / "S2 · E5 — Wed".
- **Movies:** In Progress (from Plex sync), with "45% through".
- **Games:** In Progress, with time played and roughly how long it takes to beat (IGDB):
  "12h of ~26h" / "~26h to beat" / "12h played".
- **Books:** In Progress (manual for now).
- Order: most recently **interacted with** first, by `user_items.last_activity_at`:
  - Status, season or episode changed (by you, or by Plex sync moving it) → that moment.
  - Watched on Plex → Plex's own "last watched" time (saved by `plex-watch` on every check, forward only; Plex
    sync writes don't overwrite it with the sync time).
  - Played on Steam → Steam's "last played" time.
  - Notes, priority, alerts, the background Plex check etc. don't count (that's why it isn't `updated_at`).
  - Existing entries were backfilled from Steam last played / started / finished / added.
- Each card links to the title. TV cards also get a one-tap **"✓ Watched S2 · E5"** under the poster that
  advances Progress to the next aired episode, without opening the show. It only shows when Plex isn't tracking
  that show's progress (sync off for it, or not on Plex); otherwise sync would overwrite it.
  (`nextWatchable` in `src/lib/home.ts`.)

### 2. New for you ✅ built
Changes from the **last 7 days** (decided 2026-11-23). Visiting Home doesn't reset the row: a card stays for the
week unless you deal with it. **Shows** leave only when that specific episode is marked watched (a season premiere
alert: that season's first episode); other episode marks, status changes and Plex watches don't remove it.
**Movies, games and books** leave once you act on them after the news (status change, Steam play: anything that
stamps `last_activity_at`). Built from the daily
job's alerts plus new episodes, worked out from each show's last aired episode (`metadata.last_episode_to_air`).
**Clear** empties the row and is saved (`profiles.last_seen_home_at` now means "cleared at"); news after that
shows again. Implementation: `src/lib/newForYou.ts`. Every card carries a reason label:
- **New episodes:** an episode aired for a show you're following (In Progress, or Wanted + caught up).
  Includes renewals that flipped Watched back to In Progress.
- **Season premiere:** a new season started.
- **Now available:** a Wanted title that just became available on your Plex or one of your streaming services.
- **Released:** a pre-release title came out (theatrical / digital per the release-tracking spec).
- **Not here: price drops.** The Deals row below shows games on sale from current prices; price alerts in this
  row repeated it and came back after Clear whenever a price moved by a few cents (removed 2026-11-24).
- **Date news:** a new season or release date was announced, or a date moved (weakest reason).
- One card per title, with the strongest reason winning. Strongest first: released / premiered → now
  available → new episode → date news.

### 2b. Recently finished ✅ built
"How was it?": things you finished lately but haven't rated, newest first, up to 12
(`src/components/RateFinished.tsx`).
- **Shows** with no rating yet, once you've finished a season (show changed in the last 60 days); the card
  says "Finished season 2". Rating sets the show's own rating; there are no per-season ratings.
- **Movies, games, books:** marked Watched / Played / Read in the last 60 days with no rating.
- Each card has **Liked**, **Nope** and **Not now**. "Not now" is remembered (`user_items.rating_skipped`).
  For shows it's per season, so an unrated show asks again after the next season you finish.

### 3. This week
Releases in the next **7 days**, soonest first, with countdown labels: releases, premieres and new episodes for
shows you're following. A short horizon on purpose; the full upcoming list is Library → Release: Upcoming.

### 4. Ready to start
Your top **High-priority Wanted** titles that you can **actually start right now**:
- Movies/TV: available via your sources (Plex or your streaming services). Not checked yet → kept, unless Plex
  already says it's only Requested or missing.
- Games/books: In Your Library.
- Capped at ~10. Sorted by priority, then most recently added.
- This replaces today's "Up Next".

### 5. Deals (games, later)
Wanted, unowned games at a **historical low** or **≥ 50 % off**, cheapest first. Uses the game pricing rules.

### 6. Pinned views (optional, later)
Saved views (from the Library) can be pinned to Home as extra rows, below the built-in ones.

## Behaviour
- **Type pills stay:** they narrow every row (e.g. Home → TV for "what to watch").
- **Empty Home** (nothing in progress, nothing new): shows a short "You're all caught up" message, plus
  Ready to start, so there's always a next action.
- **Signed out:** sample data, as now.
- **Row headers** link to the matching Library view where one exists (Continue → Library?status=in_progress).

## Data needed

| Need | Have it? | Work |
|---|---|---|
| In Progress, Progress pointer, priority | ✅ | — |
| Next episode / air dates | ✅ (TMDB `next_episode_to_air`, refreshed after it airs) | — |
| Movie % watched | ✅ live from Plex on the title page | Store it per item when synced, so Home doesn't call Plex per card |
| Availability (Plex + streaming) | ❌ live per title page only | **Store per title + refresh in the background.** Shared with the Library's Availability filter (FILTERING.md step 3) |
| "Last 7 days" | ✅ | `profiles.last_seen_home_at`, plus change timestamps: episode air dates, `availability_changed_at`, release date |
| Daily refresh without opening the app | ❌ (browser-driven today) | The planned daily server job (release tracking) refreshes titles and availability |
| Game prices / deals | ❌ | Comes with games |

## Build order
1. **Continue + This week + Ready to start (sources-agnostic version)** with data we already have. "Ready to
   start" falls back to High-priority Wanted until availability is stored.
2. ✅ **Stored availability** (shared with the Library's Availability filter). "Ready to start" now excludes
   titles known to be unavailable. `became_available_at` is recorded, ready for "Now available".
3. **New for you:** `last_seen_home_at`, change detection, dismiss.
4. **Daily server job:** so "New for you" is ready before you open the app (and alerts can use it).
5. **Deals** with games. **Pinned views** with saved views.

## Open questions
- ✅ "New for you" window: a fixed 7 days; shows leave when that episode is watched, other titles when acted on (2026-11-23).
- ✅ Caught-up Wanted shows with a new episode go to "New for you" only, then Continue once you mark an episode.
- ✅ No "Coming soon" row: Next 7 days and the Calendar cover it.
