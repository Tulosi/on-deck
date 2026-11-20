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

### Layer 2 — Cross-category filters (always available)
| Filter | Values | Notes |
|---|---|---|
| Status | Wanted · In Progress · Done · Dropped | "Done" = Watched / Played / Read |
| Priority | High · Medium · Low · None | |
| Rating | Liked · Didn't like · ★ Favourite · Unrated | |
| Score | 0–100 range | Normalised (§3) |
| Release | Released · Upcoming / pre-release · year range | |
| Availability | Available · Not available | Movies/TV: on Plex or one of my streaming services. Games/Books: **In Your Library** |
| Date added | range / "last 30 days" | |
| Collection | any of my collections | once collections exist |

Not cross-category, by decision: **genre** and **length** live in each type's section.

### Layer 3 — Type-specific filters (shown when that type is selected)
**Movies:** genre (TMDB) · runtime · on Plex (available / requested / missing) · streaming service ·
theatrical vs digital release · original language · certification

**TV:** genre (TMDB) · show status (Airing · Returning · Ended · Cancelled) · watch progress (Not started ·
Mid-way · Caught up) · total length (episodes × runtime) · number of seasons · on Plex · streaming service · network

**Games:** genre (IGDB: RPG, ARPG, FPS, Roguelike …) · Steam review % · Metacritic · price range · on sale /
historical low · co-op (online · local · split-screen) · PvP · max players · Steam Deck (Verified · Playable ·
Unsupported) · HowLongToBeat length · themes · perspective · Early Access · In Your Library

**Books:** genre (Hardcover) · Hardcover rating · page count · author · series (in a series / standalone)

## 2. Logic
- **Within one filter:** options are OR'd. Genre = RPG or FPS means either.
- **Across filters:** AND'd. Co-op AND Steam Deck Verified.
- **Include only.** There's no "NOT" / exclude.
- Switching type pills drops the old type's Layer-3 filters and keeps Layer-2 filters.

## 3. Normalisation
- **Score (0–100):** movies/TV use **IMDb × 10** (matching the poster label). Games use Steam review %.
  Books use Hardcover × 20. Titles with no score are excluded once a score range is set.
- **Genre:** per type, using each source's own list. Movies and TV share TMDB genres.
- **Length:** per type only (runtime, total episode time, HowLongToBeat hours, pages). No cross-type
  Short/Medium/Long.

## 4. UI
```
[ All · Movies · TV · Games · Books ]  [ ⚙ Filters (3) ]  [ Sort: Priority ▾ ]  [ Group: none ▾ ]   ( ●○○ ) Labels shown
  active: [Status: Wanted ×] [Co-op ×] [Steam ≥ 85% ×]                                                   Clear all · Save view
```
- **Toolbar row** (already in place), left to right: type pills · **Filters** button (active-count badge) ·
  **Sort** · **Group** · the labels switch on the right.
- **Filters** opens a panel: Layer 2 first, then the selected type's section.
- Active filters show as removable pills under the toolbar, with **Clear all** and **Save view**.
- **Home** gets only the type pills, which narrow every Home row. The full filter panel is Library-only.

## 5. Arranging
- **Sort:** Priority · Date added · Release date · Score · Title · Last updated, plus type-specific sorts
  (Price for games, runtime / length per type).
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
3. **Availability:** store Plex + streaming availability per title (refreshed in the background). It's looked
   up live per title page today, so this is needed before filtering a whole list by it.
4. **Saved views:** table, sidebar list, save/rename/delete.
5. **Layer 3 per type** as each type's data lands: Movies/TV now (TMDB genres, runtime, show status, progress);
   Games after IGDB/Steam/prices; Books after Hardcover.
