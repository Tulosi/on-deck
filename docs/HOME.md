# Home — "what's next, and what's changed"

Status: **design proposal, not built.** Written 2026-11-20.

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

### 1. Continue
Things you're in the middle of, with **the next concrete step**.
- **TV:** In Progress shows. The subline is the next episode after Progress, and whether it's out:
  "S2 · E5 — out now" / "S2 · E5 — Wed".
- **Movies:** In Progress (from Plex sync), with "45% through".
- **Games / Books:** In Progress (manual for now).
- Order: most recently updated first.
- Each card links to the title. Later: a one-tap "Watched E5" that advances Progress (only when Plex sync is off
  for that show).

### 2. New for you
Changes since your **last visit** to Home (per-user `last_seen_home_at`). Every card carries a reason label:
- **New episodes:** an episode aired for a show you're following (In Progress, or Wanted + caught up).
  Includes renewals that flipped Watched back to In Progress.
- **Season premiere:** a new season started.
- **Now available:** a Wanted title that just became available on your Plex or one of your streaming services.
- **Released:** a pre-release title came out (theatrical / digital per the release-tracking spec).
- **Price drop** (games, later): a Wanted game hit a historical low.
- One card per title, with the strongest reason winning. A **Dismiss** removes a card early. Otherwise cards
  clear on the next visit.

### 3. This week
Releases in the next **7 days**, soonest first, with countdown labels: releases, premieres and new episodes for
shows you're following. A short horizon on purpose; the full upcoming list is Library → Release: Upcoming.

### 4. Ready to start
Your top **High-priority Wanted** titles that you can **actually start right now**:
- Movies/TV: available via your sources (Plex or your streaming services).
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
| "Since last visit" | ❌ | `profiles.last_seen_home_at`, plus change timestamps: episode air dates, `availability_changed_at`, release date |
| Daily refresh without opening the app | ❌ (browser-driven today) | The planned daily server job (release tracking) refreshes titles and availability |
| Game prices / deals | ❌ | Comes with games |

## Build order
1. **Continue + This week + Ready to start (sources-agnostic version)** with data we already have. "Ready to
   start" falls back to High-priority Wanted until availability is stored.
2. **Stored availability** (shared with the Library's Availability filter). Then "Ready to start" uses it, and
   "Now available" becomes possible.
3. **New for you:** `last_seen_home_at`, change detection, dismiss.
4. **Daily server job:** so "New for you" is ready before you open the app (and alerts can use it).
5. **Deals** with games. **Pinned views** with saved views.

## Open questions
- ❓ "New for you" window: since your last visit (proposed), or a fixed "last 7 days"?
- ❓ Should **Continue** include Wanted shows you're caught up on that just got a new episode, or is that only
  "New for you"? (Proposed: New for you first, then Continue once you start the episode.)
- ❓ Keep a "Coming Soon" row at all, or is "This week" plus Library → Upcoming enough? (Proposed: drop it.)
