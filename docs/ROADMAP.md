# Roadmap

Agreed 2026-11-23. Built in groups, in this order. Decisions from the planning Q&A are noted inline.

## Group A — Bugs & quick fixes ✅ built
1. Early Access detection: Steam's own store data (genre "Early Access") first; also "released, with a future
   1.0 date" counts as Early Access (e.g. Path of Exile 2).
2. Home → Continue respects seasons marked Watched by hand (S5 · E1, not S1 · E1).
3. Calendar: something exactly 7 days away belongs under "Next 7 days".
4. Home Deals row uses the user's deep-discount threshold (Settings), not a fixed 50%.
5. Title page: remove the "Notifications on" box (alerts aren't per-title in practice).
6. Collections: description directly under the name; the smart badge says "Smart" (not "Auto").
7. Calendar subscription has a proper name ("On Deck Calendar · Default" …).
8. Plex sync button: green "Synced from Plex" when a title is actively synced.
9. Sort defaults to none (= date added, newest first). "Save as smart collection" only when something differs
   from the defaults.
10. Posters (phones): Next Ep / Early Access chips don't overrun other content; a subtle dark gradient behind
    bottom chips when there are any.
11. Sidebar drag handles: one per row (Library included), right-aligned; type handles sit within Library's group.

## Group B — Statuses, Archive, 3-state filters ✅ built
- Status wording per type:
  - Movies: Want to Watch / In Progress / Watched It / Dropped It
  - TV: Want to Watch / In Progress / Caught Up (ongoing) or Watched It (ended) / Dropped It
  - Games: Want to Play / Playing It / Stalled / Beat It / Dropped It
  - Books: Want to Read / Reading It / Stalled / Read It / Dropped It
- **Stalled** (games, books): also a Home row ("Pick it back up?") for things stalled in the last 3 months.
- **Archive**: any status can be archived. Confirmation explains the effects. Archived items: hidden everywhere
  by default (Library, Home, Calendar, collections, share links) unless an "Archived" filter chip is on; a
  notice says "Archived titles are hidden by default". No notifications for archived items.
- **3-state filter chips** (include → exclude → off) only where it adds value (status, availability, co-op,
  Steam Deck, release state, deals…), not genre. Clear visual for "excluded".

## Group C — Default smart collections ✅ built
- Waitlist (Wanted, not yet released) · Early Access (Wanted games, out, not 1.0) · Deals (+ new Sort:
  Discount %). Hide on their own page; show again from Settings.

## Group D — Search overhaul
- Full-screen "Open full results" page; "did you mean" / near matches for typos; a year in the query
  ("dresden files 2026") ranks that year first.

## Group E — Backup & health
- Export / import library + settings as JSON. Secrets left out (Plex link, Seerr key, calendar/share tokens).
  Import **merges**. Importing into an otherwise empty account prompts to set up Plex / Steam / Seerr.
- Settings → Status: sync errors, API limits hit or refused, expiring tokens, last run of each job.

## Group F — Steam & Plex import
- Selective import of Steam wishlist and Plex watch history: poster grid + compact checklist, All / None /
  **Suggested** (on by default), a note to pick only what you'll really get to. Re-syncs keep earlier
  "skip" choices; titles already in the library are marked.
- Suggested: Steam = top 20 most-played (last 2 years, by playtime); TV = top 20 by episodes watched (last 2
  years); Movies = top 20 watched in the last 2 years by **IMDb** rating.
- Optional ongoing Steam sync: newly owned games → "Add to On Deck?".
- Home: last 5 Plex-watched titles not in the library, with "more".

## Group G — UI/UX pass
- Narrower, denser title page and Calendar; labels toggle rethink (tap to cycle, fixed position sized for the
  longest label, phone design proposed during the pass); general space-use review.

## Future (not scheduled)
- **Self-hosted edition (1.0):** Docker-compatible; an admin account separate from user accounts with an admin
  panel (inaccessible to users) that guides the host through getting and entering every API key.
- **Onboarding:** new-user onboarding through the features and account links (Plex, Steam, Seerr…, including
  Group F's import); a separate admin onboarding for self-hosting.
