# Filtering & arranging

Status: **steps 1–2 built** (Library page, URL state, cross-category filters, sort, group; plus Movies/TV genre,
TV show status and watch progress). Decisions made 2026-11-20.

## 1. Three layers

```
Layer 1  Media type (scope)        All · Movies · TV · Games · Books    single-select
   │
Layer 2  Cross-category filters    apply to everything in scope          status, score, release …
   │
Layer 3  Type-specific filters     only when one type is selected        Steam rating, co-op, IGDB genres …
```

### Layer 1 — Media type
- **One Library page.** The sidebar's Movies / TV / Games / Books links become shortcuts that open the
  Library with that type selected. The separate category pages go away.
- Type pills at the left of the toolbar: **All · Movies · TV · Games · Books**, **single-select**.
- Because only one type is selected at a time, Layer 3 is simply "the selected type's filters". There's no
  mixed-type ambiguity.

### The panel (slimmed 2026-11-24)
The filter panel was cut from up to 16 groups (with a hidden "More filters" section and tap-twice-to-exclude
chips) to one panel with no hidden part. Games show 11 groups, TV 7, Movies 6, All 5. Every option shows how
many titles it would leave with the other filters as they are; options that would leave none are dimmed.

| Section | Filter | Values | Notes |
|---|---|---|---|
| Your list | Status | the type's statuses | **is / is not** |
| | Priority | High · Medium · Low · None | Home's "Ready to start" link uses it |
| | Your rating | Liked · Didn't like · ★ Favourite · Unrated | **is / is not** |
| Out and available | Release | Released · Upcoming | Waitlist and Ready to start depend on it |
| | Available to me | on / off | Movies/TV: on Plex or my streaming services. Games/Books: owned |
| Movies, TV, Games | Genre (Games: Genre & tags) | from the library | **is / is not** |
| TV | Show status | Airing · Returning · Upcoming · Ended | Ended includes cancelled; Upcoming = not premiered yet |
| Games | Co-op & multiplayer | Online co-op · Local co-op · Split-screen · PvP | **is / is not** |
| | Length | Short · Medium · Long · Epic | time to beat |
| | Steam Deck | Verified · Playable · Unsupported | |
| | Early access | Early Access · Full release | the Early Access collection uses it |
| | Price & deals | On sale · Historical low · Free-To-Play, plus Max price | the Deals collection uses it |

**Left the panel:** Minimum score and Date added (Sort covers them), Year range, TV Watch progress (Status
covers it), "Not available", and Archived. They're still read from older links and saved smart collections, so
those keep matching exactly as before, and each shows as a removable chip above the results. Archived titles stay
hidden by default; the notice above the results ("N archived titles are hidden by default · Show") brings them
in, and the Archive page lists only them.

## 2. Logic
- **Within one filter:** options are OR'd. Genre = RPG or FPS means either.
- **Across filters:** AND'd. Co-op AND Steam Deck Verified.
- **Is / is not** (Status, Your rating, Genre, Co-op): a small switch by the group's label. On "is not" the
  picked values exclude ("not Dropped, not Beat it"). Exclusion is per group, not per chip: the old
  tap-once-include, tap-again-exclude chips were hard to discover and needed instructions in the panel, and mixing
  include and exclude in one group added little. URL: excluded values carry a leading "-" (`status=-dropped`); a
  lone `-` keeps a group on "is not" before anything is picked. Older links that mixed the two read as the
  included values; an excluded value in a group without the switch reads as every other option.
- Switching type drops the old type's own filters and keeps the rest.

## 3. Normalisation
- **Score (0–100):** movies/TV use **IMDb × 10** (matching the poster label). Games use Steam review %.
  Books use Hardcover × 20. Titles with no score are excluded once a score range is set.
- **Genre:** per type, using each source's own list. Movies and TV share TMDB genres.
- **Length:** per type only (runtime, total episode time, HowLongToBeat hours, pages). No cross-type
  Short/Medium/Long.

## 4. UI
```
[ All · Movies · TV · Games · Books ]  [ ⚙ Filters (3) ]  [ Sort: Priority ▾ ]  [ Group: none ▾ ]   [ 🏷 Poster details: Always ]
  active: [Status: Wanted ×] [Co-op ×] [Steam ≥ 85% ×]                                                   Clear all · Save view
```
- **Toolbar row** (already in place), left to right: type pills · **Filters** button (active-count badge) ·
  **Sort** · **Group** · the labels switch on the right.
- **Filters** opens a panel: Layer 2 first, then the selected type's section.
- Active filters show as removable pills under the toolbar, with **Clear all** and **Save view**.
- **Home** gets only the type pills, which narrow every Home row. The full filter panel is Library-only.

## 5. Arranging
- **Sort:** Priority · Date added · Release date · Score · Title · Last watched / played / read (Last activity across types; only titles you have started, the rest last), plus type-specific sorts
  (Price for games, runtime / length per type, Progress for TV: share of aired episodes watched).
- **Group by** (optional, off by default): Status · Type · Priority · Release year. Shown as labelled rows.

## 6. Persistence
- **URL:** type, filters, sort and group are encoded in the Library URL, so back/refresh keep them and links are
  shareable.
- **Saved views:** name the current combo ("Co-op under $20", "Short movies on Plex"). Saved views are listed in
  the **sidebar** under the main categories and open the Library with that URL. Stored per user in Supabase
  (new `saved_views` table, with grants).
- Not "remember last used": the URL and saved views cover it.

## 7. Build order
1. ✅ **Library page + URL state:** `/library`, single-select type pills (a dropdown on phones), sidebar links as
   shortcuts (old `/movies` etc. redirect), per-category pages retired. Code: `src/lib/filters.ts`,
   `src/pages/Library.tsx`, `src/components/Toolbar.tsx`.
2. ✅ **Layer 2 on data we have:** status, priority, rating, minimum score, release, year range, date added.
   Sort + group. Also from Layer 3: Movies/TV genre, TV show status, TV watch progress.
3. ✅ **Availability:** stored per user per title in `user_availability` by the `availability` function
   (Plex via Seerr + the user's streaming services). Refreshed on app load (titles older than 12 h, 20 per call),
   right after adding a title, and in full when region / services / Seerr change. Library filter: Available /
   Not available (titles not checked yet match neither).
4. **Saved views:** table, sidebar list, save/rename/delete.
5. **Layer 3 per type** as each type's data lands: Movies/TV now (TMDB genres, runtime, show status, progress);
   Games after IGDB/Steam/prices; Books after Hardcover.
