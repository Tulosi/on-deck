# UX, design & performance review — 2026-11-23

A review of On Deck's features, UI, UX, theming, user flows and speed, with suggested improvements. It's a menu
to pick from for the broader UI/UX pass, not a plan that's been agreed. Nothing here has been built.

**How it was done**
- **Code:** read the theme tokens (`src/index.css`), the shell, poster cards, Home, Library, the title page,
  Calendar, Settings and the data layer.
- **Measured:** the production build, the live site's cold load on GitHub Pages, contrast ratios of every text
  token, and tap-target sizes at 375px.
- **Viewed:** desktop and phone, in sample mode. The preview isn't signed in, so real posters, the title page's
  tracking card and signed-in load times weren't seen. Measure those before acting on the speed section.
- **Checked against:**
  - Emil Kowalski's design-engineering skill (installed here).
  - Impeccable, Taste, Unslop, UI/UX Pro Max and Vercel's Web Interface Guidelines, read from their repos.
  - React Bits and Motion's current docs.
- **Not used at first, now installed:**
  - At first the Awwwards MCP wasn't connected, and UI/UX Pro Max's palette and font search (a local script over
    its data files) wasn't installed, so only its rules were used.
  - On 2026-11-23 all the guides were installed globally (skills in `~/.claude/skills`, the Awwwards MCP with
    Playwright and ffmpeg). They can now run directly: `/impeccable audit`, `/unslop`, `ui-ux-pro-max`
    search, and Awwwards reference pulls.

---

## 1. Top 10, in order

| # | What | Why it's first | Effort |
|---|---|---|---|
| 1 | **Split the bundle by route** (lazy-load Title, Settings, Import, Calendar, Search, Collections) | One 808 kB JS file (229 kB gzipped) is downloaded and parsed before anything shows. That includes Settings and the import pickers, which most visits never open. | S |
| 2 | **Keep the library in a local cache** (TanStack Query persister → IndexedDB) | Warm opens show your library instantly, then refresh quietly. This is the biggest perceived-speed win for a daily-use app, and it makes the PWA useful offline. | S |
| 3 | **Fix the `faint` text colour** | It's used for text 130 times. It measures 3.2–3.4 : 1 on dark surfaces and 2.4–2.7 : 1 in light mode, below the 4.5 : 1 needed for small text. | S |
| 4 | **Skeletons instead of spinners** for Home rows, Library and the title page | There are 71 spinners and no skeletons. A layout-shaped placeholder feels faster and stops content jumping. | M |
| 5 | **Poster → title page morph** (View Transitions, through Motion's `animateView` or React Router's `viewTransition`) | This is the one "signature" moment the app is missing. It's cheap, native, and degrades to an instant swap. | M |
| 6 | **Press feedback and one shared motion system** | No button has a pressed state (`active:scale`). Easing and durations vary per component. Add tokens, then apply them everywhere. | S |
| 7 | **Visible keyboard focus** | Inputs use `outline-none` with only a border colour change, and only 3 components use `focus-visible`. Add one global focus ring. | S |
| 8 | **Large lists: `content-visibility` or virtualisation in Library** | A Steam import adds hundreds of titles, and the grid renders every card. | S–M |
| 9 | **Right-size images** (w342 posters plus `srcset`; preconnect to the image CDNs; high priority for the title backdrop) | Posters are fetched at w500 for 128–160 px cards. There's no preconnect to the TMDB, IGDB or Supabase hosts. | S |
| 10 | **One-tap episode advance and undo toasts** | These are the two most-repeated actions. "Watched E5" is already noted as "later" in HOME.md. Undo makes Archive and Remove safe without confirm dialogs. | M |

---

## 2. Speed & loading

**Measured**
- **Build:**
  - Single JS chunk: 808 kB (229 kB gzipped).
  - CSS: 58 kB (12.6 kB gzipped).
  - Fonts: 12 font files ship, but the browser only downloads the Latin subsets (Inter 48 kB, JetBrains Mono 40 kB) unless other scripts appear.
- **Live site, cold, signed out:**
  - Server response: 264 ms.
  - Page ready: 571 ms.
  - The JS file took 266 ms to download.

  That's fine on fast wifi, but the whole app is parsed up front, so slow phones pay for all of it.
- **Data:** the library query fetches every entry with `titles(*)`, which includes each title's full `metadata` JSON (cast, seasons and so on). Home and Library need maybe 15 columns. Measure the response size while signed in. It likely grows into the megabytes after a Steam/Plex import.

**Suggestions**
- **Route splitting:**
  - Use `React.lazy` with `Suspense` for each page.
  - Keep Home and Library in the main chunk.
  - Prefetch a route's chunk on link hover or focus (`import()` in `onMouseEnter`), so clicks still feel instant.
- **Vendor chunk:** put supabase-js, React Query and the router in their own chunk (`build.rollupOptions.output.manualChunks`). Your code then changes without busting the vendor cache.
- **Persisted cache:**
  - Use `@tanstack/query-async-storage-persister` with `idb-keyval`, and a `buster` tied to the app version.
  - Allow a long cache lifetime for `library`, `profile` and `collections`.
  - Pairs well with the PWA (already set up with `vite-plugin-pwa`).
- **Lean library query:**
  - Select only the title columns cards use (title, year, type, cover, release fields, scores, the few metadata keys used for badges).
  - The title page already fetches the full title.
  - If the metadata keys are awkward to select, use a Postgres view or RPC that returns a `card` JSON.
- **Images:**
  - TMDB `w342` for cards, with a `srcset` of w185, w342 and w500 plus `sizes`. IGDB `t_cover_big` is fine.
  - `decoding="async"` everywhere.
  - Explicit `width`/`height` (or the existing aspect box) to prevent layout shift.
  - `fetchpriority="high"` on the title-page backdrop and on the first row's posters.
  - `<link rel="preconnect">` for `image.tmdb.org`, `images.igdb.com` and the Supabase URL in `index.html`.
- **Big grids:**
  - Cheapest: `content-visibility: auto; contain-intrinsic-size: auto 300px` on each poster card.
  - If 1,000+ items ever lag, use a virtualiser (`virtua`, about 3 kB).
- **Poster badges:**
  - Every badge uses `backdrop-blur-sm`. On a grid of 200 posters that's 200+ blur layers to composite while scrolling.
  - Use a solid `bg-black/70` instead. It's visually near-identical at that size.
- **Fonts:** preload the Latin Inter file (`<link rel="preload" as="font" crossorigin>`), so the first paint doesn't swap fonts.
- **Perceived speed:** keep spinners for under 1 s actions only. Use skeletons for page loads. Make any remaining spinner spin faster (feels faster, per Emil).

---

## 3. Theming & visual design

The base is good and distinctive:
- warm near-black
- warm greys
- one lemon accent
- semantic tokens throughout (every component uses `bg-bg`, `text-fg` and so on, never raw hex)
- a real light theme

Keep it. The guides flag only a handful of things.

**Contrast** (WCAG: 4.5 : 1 for small text)

| Token | Dark | Light | Verdict |
|---|---|---|---|
| `muted` | 6.9 : 1 on surface | 5.8 : 1 on white | ✅ |
| `faint` | 3.4 on bg · 3.2 on surface · **2.9 on raised** | **2.7 on white · 2.4 on bg** | ❌ for text |
| `accent-ink` (light) | — | 5.4 : 1 | ✅ |
| `line` | 1.4 : 1 | — | fine for hairlines |

- **Fix:** split `faint` into two tokens:
  - `faint`: text, about #8a8378 in dark and #857d72 in light, which clears 4.5 : 1.
  - `subtle`: decoration only, such as dividers, disabled states and icons beside a label (the current values).

  Then audit the 130 `text-faint` uses: most are captions, years and hints, so they become text-level.

**Tiny text**
- Found by `npx impeccable detect` on Home, added after the tools were installed.
- Poster chips and badges are set at 10px: "Plex", "NEXT EP TUE", "IN 3 DAYS".
- Impeccable treats 11px as the minimum for functional text. Raise chips to 11px. Their container queries
  already give room.

**Small tweaks**
- **Theme colour:** add `<meta name="theme-color">` for both themes, with `media="(prefers-color-scheme: …)"` or updated by the theme toggle. The phone's status bar then matches the app.
- **Browser surfaces:** theme the remaining ones in `index.css`:
  - `::selection` in lemon at 30%
  - `caret-color: var(--od-accent)`
  - `accent-color` for native checkboxes (some already use it inline)
  - thin dark scrollbars on desktop (`scrollbar-color`)
- **Monospace:**
  - Mono uppercase is used both for data (scores, dates, `S2 · E5`), where it works, and as a decorative eyebrow above headings ("TV SHOW", "YOUR LIBRARY IS EMPTY", "1 · PLEX ACCOUNT").
  - Impeccable and Unslop both list "eyebrow above a heading" and "mono as a technical costume" as AI-template tells.
  - Suggest: keep mono for numbers and dates; make labels sentence-case Inter at 12–13px in `muted`.
- **Numbers:** add `tabular-nums` globally on scores, counts, prices and countdowns, so values don't wiggle as they change (e.g. "In 3 days" → "In 12 days").
- **Headings:** `text-wrap: balance` on h1–h3, and `text-pretty` on paragraphs.
- **Depth:** on dark, depth should come from surface steps (bg → surface → raised) plus hairlines, not shadows. The app already does this; just don't add shadows in the UI pass.
- **Posters with no image:** the placeholder card is a dim gradient with the title. Give it some character. For example, tint by media type (very low saturation) and set the title larger in `fg`. A grid of missing art then reads as intentional, not broken.

---

## 4. Motion & interaction

**Current state:**
- Almost no motion: 15 `transition-colors`, 2 `transition-transform`, one custom easing.
- No pressed states.
- No reduced-motion handling, because there's nothing to reduce yet.
- No page transitions.

That's a clean slate. The guides agree on restraint:
- one signature moment
- fast, interruptible micro-feedback
- no decorative loops

| Before | After | Why |
|---|---|---|
| No pressed state on any button | `active:scale-[0.97]` with `transition-transform duration-150 ease-[var(--ease-out)]` on buttons, chips and poster cards (gated on `(hover:hover)` for hover only) | Instant "it heard me" feedback (Emil, UI/UX Pro Max *press-feedback*). |
| Easing chosen per component | `@theme { --ease-out: cubic-bezier(0.23,1,0.32,1); --ease-in-out: cubic-bezier(0.77,0,0.175,1); --ease-drawer: cubic-bezier(0.32,0.72,0,1) }`, plus duration tokens of 150, 200 and 250 ms | One motion vocabulary. Built-in CSS easings are too weak. |
| Status buttons swap colour instantly | `transition-[background-color,color,border-color] duration-150` | State changes should ease, not snap. |
| Menus, Filters panel, More sheet and search results appear instantly | `@starting-style { opacity:0; transform: scale(.97) }` with a 180 ms ease-out, scaled from the trigger (`transform-origin` at the trigger) | Popovers come from where you clicked. `@starting-style` is Baseline and needs no JS. |
| More sheet (phone) pops in | Slide up with `translateY(100%)` → 0, 300 ms `--ease-drawer`, and swipe-down to dismiss (velocity > 0.11 dismisses) | Sheets feel physical, and the direction of entry is the direction of exit. |
| Route change is a hard cut | View Transition: the poster morphs into the title-page cover (`view-transition-name: poster-<id>`), and the rest crossfades in 200 ms | The one signature moment. Shows where you came from. Back reverses it. |
| Labels toggle knob | Already uses `transform` with 1rem steps ✅ | — |
| Progress bars animate `width` | `transform: scaleX()` with `transform-origin: left` | Animate compositor properties only. |
| Nothing for reduced motion | `@media (prefers-reduced-motion: reduce)`: keep the fades, drop the movement (no morph, no slide) | Reduced motion means gentler, not none. |
| Command palette (if added) or keyboard shortcuts | **No animation at all** | Used many times a day. Animation makes it feel slow (Emil, Raycast). |

**Don't:**
- tilt or 3D-hover posters
- add looping glows, shimmer or pulse
- fade in every row on scroll, or use parallax text
- bounce springs on UI
- use `hover:scale` on cards

Taste, Unslop and Impeccable all flag these, and in a grid of 200 posters they get tiring fast. A poster hover should be a 2 px lift or a tiny image zoom (1.02) inside the frame, at most.

---

## 5. Accessibility (from Vercel's guidelines and UI/UX Pro Max)

- **Focus:**
  - One global ring: `:focus-visible { outline: 2px solid var(--od-accent); outline-offset: 2px }`.
  - Remove the `outline-none` + `focus:border-accent` combinations: Toolbar, SearchBox, StatusControls, CollectionPicker, Settings and others.
  - Use `focus-visible`, not `focus`, so mouse clicks don't show rings.
- **Small, unnamed controls:** at 375px, three controls are 17×18 px with no accessible name (the labels-toggle dots). Give them `aria-label`s and a 24 px minimum hit area, using a pseudo-element to grow the target, not the visual.
- **Skip link:** a "Skip to content" link at the top of AppShell.
- **Route changes:** move focus to the page `<h1>` on navigation, and announce the page title.
- **Live regions:**
  - "Saving…" in the tracking card already uses `aria-live` ✅.
  - Do the same for import progress, the Home Add/✕ prompts and the Seerr check.
- **Typography details:** placeholders already use `…` ✅. On phones the "All" placeholder ("Search movies, TV,
  games and books…") is cut off; use a shorter one, such as "Search titles…".
- **Touch:** `touch-action: manipulation` on buttons, so there's no double-tap zoom delay. Add `overscroll-behavior: contain` on the More sheet and the search dropdown.
- **Colour alone:** Plex dots (green, blue, grey) and deal badges rely on colour. They already have text labels on hover or in the chip. Keep it that way wherever chips are set to "hide".

---

## 6. UX & user flows

**What works:**
- Home answers "what next?".
- Smart default collections.
- Imports with "suggested" picks that stay editable.
- Statuses named per type.
- Filters kept in the URL.

**Opportunities:**
- **First run / onboarding** (already on the Future list):
  - An empty library should offer three paths: link Plex, link Steam, or search.
  - The import pickers you just built are the fastest way to a useful Home. Lead with them.
- **One-tap progress:**
  - A "✓ E5" button on Continue cards for shows when Plex sync is off.
  - "+1 h" or "Played today" for games.
  - "Finished" for books.
  - Fewer trips to the title page for the most common action.
- **Undo instead of confirm:**
  - Archive, remove from library and remove from collection show a toast with **Undo** for about 5 s.
  - Sonner-style: bottom-centre, swipe to dismiss, timer pauses on hover or tab-hide.
- **Quick actions on posters:**
  - Right-click on desktop, long-press on phone.
  - A small menu: status, add to collection, archive.
  - Use the Popover API with anchor positioning (Chromium and Safari 26+; fall back to a positioned div).
- **Command palette (⌘K):**
  - The search box already exists. ⌘K could also jump to pages and run actions ("mark Severance S2E5 watched", "open Deals").
  - No animation, per above.
- **Back keeps your place:** returning from a title page to Library or Home should restore scroll position and the horizontal scroll of each row. React Router's `ScrollRestoration` handles the page; row offsets need a small store.
- **Calendar:** a week strip with today highlighted, and a filled dot per day with releases. Your own G note asked for a denser Calendar.
- **Stats / "year on deck":** an occasional, celebratory page (games finished, hours played, shows caught up). This is the right place for delight: counters, a reveal. Home isn't.
- **Copy:** buttons are already mostly verb plus object ✅. Avoid "!" and hype words in empty states. Unslop's copy pass is a good checklist.

---

## 7. Newer web platform features worth using

| Feature | Use in On Deck | Support (late 2026) |
|---|---|---|
| **View Transitions** (same-document) | Poster → title morph, tab/route crossfades. React Router 7 has `<Link viewTransition>`; Motion's free `animateView` adds springs and interruption handling. | Chromium, Safari 18+, Firefox 144+ for the basics. Degrades to an instant swap. |
| **`@starting-style`** + `transition-behavior: allow-discrete` | Enter animations for menus, sheets, toasts and dialogs without JS mount state. | Baseline 2024 ✅ |
| **Popover API** (`popover`, `popovertarget`) | Menus, Filters, quick-action menus: top layer, light dismiss and Escape for free. | Baseline ✅ |
| **Anchor positioning** | Place popovers on the poster or trigger without measuring. | Chromium, Safari 26. Needs a fallback. |
| **Scroll-driven animations** (`animation-timeline: view()`) | A subtle title-page backdrop fade/zoom as you scroll, off the main thread. Gate behind `@supports` and reduced motion. | Chromium, Safari 26. Progressive enhancement. |
| **Container queries** | Already used (status buttons, posters) ✅. Extend to cards that appear in rows and grids. | Baseline ✅ |
| **`content-visibility: auto`** | Library grid, long collections, Settings sections. | Baseline ✅ |
| **`interpolate-size: allow-keywords`** | Animate panels to `height: auto` (Filters, details). | Chromium only. Harmless elsewhere. |
| **Speculation Rules** | Not useful: On Deck is a single-page app, so prefetch chunks on hover instead. | — |

Support levels in this table for anchor positioning, scroll-driven animations and `interpolate-size` are from
general knowledge, not checked against caniuse during this review. Check before relying on them.

---

## 8. Motion (motion.dev) and React Bits: what to adopt

**Motion** (`motion`, v14; import from `motion/react`)
- Only worth it if you want the shared-element morph with springs, drag-to-dismiss sheets, or `AnimatePresence` exits (toasts, rows). Plain CSS covers everything else above.
- Keep it small:
  - `LazyMotion` with `domAnimation` and `m.*` components: about 5 kB plus 24 kB, loaded lazily.
  - Add `domMax` (layout and drag) only on the routes that need it.
- Emil's caveat: Motion's `x`/`y` shorthands run on the main thread and drop frames during data loads. Use `transform` strings, or CSS, for anything that runs while queries resolve.

**React Bits** (copy-in source, via `npx shadcn@latest add @react-bits/<Name>-TS-TW`)

Use sparingly. Most components are showpieces built for landing pages. A few fit:

| Component | Where | Notes |
|---|---|---|
| **Counter / Count Up** | Stats page, Steam hours, import result ("Added 34") | Rare moment, fine to animate. Honour reduced motion. |
| **Glare Hover** (light version) | Featured poster on the title page only, or the stats page | Not on grids: one listener per card, and the guides ban tilt/sheen on repeated items. |
| **Animated List** | Import result and the Home prompt rows as items are added or skipped | Use it for exits (an item leaves), not entrances. |
| **Pill Nav / sliding indicator** | Type pills (All · Movies · TV · Games · Books) and Calendar List/Month | Sliding active pill is useful state feedback. Could also be done in CSS with an anchored pseudo-element. |
| **Noise** (film grain) | Very low-opacity overlay on the title-page backdrop only | Gives cinema texture. Unslop and Impeccable caution against grain as a trend, so test it and drop it if it reads as a gimmick. |
| ❌ Tilted Card, Spotlight Card, Chroma Grid, Dock, Magnet, Click Spark, WebGL backgrounds (Aurora, Galaxy, Silk …), Text Type/Decrypted/Shiny Text | — | Cursor loops, GPU cost and novelty. They fight a fast, scannable "Operate"-mode app (Impeccable) and fail Taste and Unslop's rules. |

---

## 9. Per-guide notes

- **Emil Kowalski:**
  - Motion tokens, press scale, origin-aware popovers, no animation on keyboard actions, exits faster than entrances.
  - Use CSS or WAAPI over JS for anything that runs during loads.
  - See the table in §4.
- **Impeccable** (Operate mode, where scanability beats expression):
  - Fix `faint` contrast.
  - Drop eyebrows above headings, and mono used as decoration.
  - Theme selection, caret and scrollbars.
  - Cover every state: hover, disabled, loading, error, empty and focus. Loading is the gap.
  - One signature motion moment.
  - Its `audit` and `critique` commands would give a scored P0–P3 list if installed.
- **Unslop:**
  - The app is "light slop" at most. The palette is restrained, there's one accent, and there's no glass, glow or gradient text.
  - Do its spacing pass (4 px grid, remove one-offs like `w-[3.25rem]` where possible).
  - Copy pass: shorter labels and placeholders, no trailing periods on short labels.
  - Swap the per-badge `backdrop-blur` for flat fills.
- **Taste:**
  - Mostly for marketing pages, so the page-kind rules don't apply.
  - Its hover rules (2 px lift, 1.02 image zoom, no tilt or carousels), 44 px touch targets with 8 px spacing, and "verb + object" buttons do apply.
- **UI/UX Pro Max:**
  - Priority order: accessibility, then touch, then performance, then style.
  - Matching rules: skeletons over spinners past 1 s, virtualise 50+ items, tabular numbers, `min-h-dvh`, restore scroll on back, focus moves on route change.
- **Vercel Web Interface Guidelines:**
  - `…` and curly quotes, `tabular-nums`, `text-wrap: balance`.
  - `touch-action: manipulation`, `overscroll-behavior: contain` in sheets.
  - `<meta name="theme-color">`, image dimensions, preconnect, `focus-visible` rings.
  - Undo for destructive actions.

---

## 10. Suggested order

1. **Speed basics** (1 session): route splitting, preconnect, image sizes, lean library query, persisted cache.
   Then measure signed-in.
2. **Foundations** (1 session):
   - `faint` contrast split, focus ring, motion and easing tokens, press states.
   - Theming of browser surfaces, `tabular-nums`, `text-wrap`.
   - Skip link and focus on route change.
3. **Loading & feedback:** skeletons, undo toasts, live regions.
4. **Signature moment:** poster → title View Transition, sheet and popover entrances with `@starting-style`.
5. **Flows:** one-tap progress, poster quick actions, onboarding, scroll restoration, ⌘K.
6. **Delight, sparingly:** stats page with counters. Maybe a backdrop grain or glare on the title page only.

---

## 11. Tool-backed pass (same day, with every tool installed)

The installed tools were run against the live app, both desktop and 390 × 844, in sample mode:
- **Impeccable critique:** two separate agents, A for a design review and B for the detector.
- **Impeccable audit.**
- **UI/UX Pro Max:** search.
- **Awwwards MCP:** reference pulls.
- **Vercel:** React best-practices and View Transitions skills.
- **Code greps.**

Sections 1–10 still stand. This section adds to them and re-ranks a few items.

### Scores
- **Nielsen heuristics (Impeccable A): 25 / 40.**
  - Strongest, at 3: visibility of status, real-world wording, efficiency, minimalism.
  - Weakest, at 2: user control (blocking `confirm()`, no undo), consistency (type filter), recognition (icon-only badges, colour-only Plex), error recovery (raw `err.message`), help.
- **Audit health: 13 / 20.**

  | Dimension | Score | Main reason |
  |---|---|---|
  | Accessibility | 2 | `faint` text fails AA (27 detector hits); 10 px labels; colour-only Plex state; no Escape on 3 dialogs; div backdrops with `onClick` |
  | Performance | 2 | 808 kB single bundle; w500 posters; Library filters and sorts every render with no `useMemo`; PosterCard not memoised |
  | Theming | 3 | Tokens are used throughout; a hard-coded `text-[#0c0b0a]` at `PosterCard.tsx:149,152` should be `text-accent-fg` |
  | Responsive | 3 | Works at 375 px; type pills clip at about 800 px ("Book" is cut off); autofocus opens the keyboard on mobile Search and Library |
  | Anti-patterns | 3 | Restrained; nothing reads as AI-made except the same sparkle icon on every smart collection |

- **Design specificity verdict:** "The visual shell is generic; the content model is not." Status words per type, chips that carry real information, Home's "not a Library filter" rule, and "Date not final" are the product's own. The sidebar, pill tabs and grid are not.

### Detector (Impeccable B)
- **110 findings from about 8 sources.** The source scan finds 0 because its rules don't parse TSX.
- **`undersized-ui-text`: 76.**
  - BottomNav labels are 10 px (`BottomNav.tsx:118,129`): 42 hits, phone only.
  - PosterCard badges are 10 px (`:163,177,194,210`).
- **`low-contrast`: 27.** Every one is `--od-faint` #6b655d (`index.css:39`) at 3.2–3.4 : 1:
  - search placeholder
  - Archive link
  - PageHeader subtitle
  - poster subline
  - row subtitles
- **`tiny-text`: 7.** Includes the sidebar "Drag to rearrange" hint (`Sidebar.tsx:271`).
- **Not scanned, but the same pattern:** 10 px faint text at `SearchBox:188`, `SearchResults:235,286`, `Settings:579`, `Import:55,73` and `Collections:104`. Light theme wasn't scanned; its faint colour is worse (about 2.4–2.7 : 1).

### New findings, ranked P0–P3
No P0s: nothing blocks a task.

| P | Finding | Where | Fix |
|---|---|---|---|
| P1 | **The title page buries the main action.** Status controls render after the overview and cast, about two screens down on a phone. | `TitleDetail.tsx:322-330` | Put a compact status control (and the next-episode step) in the hero next to the score chips. Leave rating, priority and notes in the Tracking card. Signed out: a disabled ghost with "Sign in to track". |
| P1 | **One job, four controls: the type filter.** Sidebar sub-items, toolbar pills, bottom tabs plus a dropdown, and Calendar's own segmented control ("TV" vs "TV Shows", no Books). | `Toolbar`, `Sidebar`/`nav.ts`, `BottomNav`, `Calendar` | Pick one owner (the nav). Hide the pills when the route already sets a type. Use one component with the same labels everywhere. |
| P1 | **"Ready to start" can't be trusted.** It includes titles that are only *Requested* on Plex; the only difference is a blue dot. | `home.ts`, `PosterCard` Plex chip | Leave out requested-but-unavailable titles (or label them). Make the chip text "On Plex" / "Requested" so it isn't colour only. |
| P1 | **`faint` contrast** (as in section 3). | `index.css:39` | Text faint to about #857e74 or lighter (≥ 4.5 : 1); keep the current value for icons and borders only. Light theme the same. |
| P2 | **The filter panel is a wall.** About 60 options in one scroll; the include / exclude / clear cycle is hard to discover. | `Toolbar.tsx` | Type-specific group first. Collapse the rarer groups. Show active filters as removable chips plus "Clear all". Sort: 5 options plus "More…"; rename "None (date added)" to "Recently added". |
| P2 | **Icon-only stacked poster badges.** Tooltips come only from `title`, which never shows on touch. | `PosterCard.tsx` Badge | Show at most one status badge; move "Owned" into the subline. |
| P2 | **Dialogs.** No Escape handling on the More sheet, the archive confirm or the Search preview. Backdrops are `<div onClick>`. Three `window.confirm`s (`ShareLinks:42`, `Collections:328`, `TitleDetail:246`). | as listed | Use native `<dialog>` or one shared Sheet (Escape, focus trap, inert background). Replace the confirms with undo toasts. |
| P2 | **No route code-splitting or Suspense skeletons** (UI/UX Pro Max and Vercel agree). | `App.tsx` | `React.lazy` per route, with skeleton fallbacks marked `aria-busy`. |
| P2 | **`autoFocus` opens the phone keyboard** on Search and Library. | `Search.tsx:80`, `Library.tsx:184` | Autofocus only on a fine pointer, or not at all. |
| P3 | Index keys | `BackupPanel:162`, `Collections:102,104` | Stable ids. |
| P3 | No `ScrollRestoration`: back from a title loses your place in a long Library. | router setup | Add it (data router) or save scroll per key. |
| P3 | On a title page the phone tab bar lights up "More". | `BottomNav` | Keep the origin tab active. |
| P3 | Archive in faint grey reads as disabled (detector agrees). | `Sidebar.tsx:259` | Use `muted` instead of `faint`; still quieter than the main items. |

### Personas
- **Busy parent** (Plex with the kids, Steam, deciding on a phone):
  - No "tonight" answer: Continue mixes a book, a family show and an adult drama.
  - No time cue on games (time-to-beat exists but isn't shown on Continue).
  - Logging "the episode we just watched" takes too many taps.
- **One-handed phone use:**
  - Calendar is under More, while four of the six tabs are media types.
  - The type dropdown and labels toggle sit at the top, out of thumb reach.
- **Power user:**
  - No `/` or ⌘K for search.
  - No bulk select.
  - A blocking `confirm()` on remove.
- **Accessibility:**
  - faint text
  - colour-only Plex
  - badges labelled only by `title`
  - the mobile "Poster labels" slider has no visible text

### What the other tools added
- **UI/UX Pro Max:**
  - Its search agreed on skeletons with `aria-busy`, reserved space against layout shift, undo instead of "Are you sure?", and `React.lazy` with Suspense.
  - Its "avoid horizontal scroll" rule doesn't apply: the poster rows scroll sideways on purpose.
- **Vercel React best-practices:**
  - lazy routes
  - `useMemo` for Library's filter and sort
  - `memo(PosterCard)`
  - stable keys
  - `content-visibility: auto` on long grids
- **Vercel View Transitions:**
  - On Deck is on **React 19.3.1**, so React's stable `<ViewTransition>` and `addTransitionType` work without Motion.
  - Order the skill prescribes, all available here:
    1. **Shared element:** poster → title backdrop, `name={"poster-"+id}`.
    2. **Suspense reveal:** skeleton → content.
    3. **List identity:** Library re-sort and filter.
    4. **Enter/exit:** sheets and toasts.
    5. **Route:** a fade between top-level tabs; nav-forward/back slides only for list → detail.
  - This replaces section 5's suggestion of Motion's `animateView` for the morph. Keep Motion for gestures (drag-to-dismiss sheets) and springs.
- **Awwwards MCP:** little to offer an app UI.
  - The element library is empty since the gallery crawl was retired.
  - Design briefs for the closest dark, media-heavy winners came back thin.
  - A live capture of one showed only marketing scroll choreography (GSAP, ScrollTrigger, Lenis): wrong for an Operate-mode tool.
  - It suits a future marketing or landing page, not the app.
- **Taste / Unslop:**
  - Both are aimed at marketing sites; their hero and section rules don't fit.
  - Unslop's one useful flag here is the repeated sparkle icon on smart collections. Give each its own icon (Waitlist → `Clock`, Early Access → `FlaskConical`, Deals → `Tag`).

### React Bits / Motion, re-checked against Operate mode
- **Keep:**
  - Motion for the drag-to-dismiss More sheet and bottom sheets (springs, velocity dismissal).
  - `AnimatePresence` for undo toasts.
  - `layout` for the Continue row re-ordering after an update.
- **React Bits, at most two pieces:**
  - **Count Up:** for a future stats page.
  - **Spotlight / Tilted Card:** only on the title-page poster, desktop, with `prefers-reduced-motion` respected.
  - Skip text effects (Split/Blur/Shiny Text), cursors and backgrounds. On a screen opened many times a day they are noise, per Emil's frequency rule.

### Re-ranked order
1. **Foundations:** faint contrast, the 10 px → 11–12 px floor, the focus ring, press states, motion tokens.
2. **Speed:** lazy routes, Suspense skeletons, memoised Library, `PosterCard` memo, w342 + `srcset`, preconnect.
3. **Trust and the main action:** status control in the title hero, honest "Ready to start", Plex chip text.
4. **One type control** across nav, toolbar, bottom nav and Calendar; a slimmer filter panel with chips.
5. **Dialogs and undo:** shared Sheet or `<dialog>`, Escape, undo toasts instead of `confirm()`.
6. **Signature motion:** `<ViewTransition>` poster → title, Suspense reveals, list identity.
7. **Busy-parent flows:** one-tap "Watched E5", time-to-beat on Continue, maybe a "tonight" filter (audience or length).

### Re-run
- **Detector:** `npx impeccable detect --json https://tulosi.github.io/on-deck/ --viewport 390x844` (and the other routes).
- **Critique and audit:** re-run `/impeccable critique` and `/impeccable audit` after steps 1–3 to measure the change.

### Follow-up pass (after the seven steps)
- **Search keyboard:** only opens by itself with a mouse or trackpad (`pointer: fine`). The fields that appear after you tap "New" or "Save" still focus, as expected.
- **Back keeps your place:** `useScrollMemory` remembers the scroll position for each history entry, and new pages start at the top.
- **Phone tab bar:**
  - A title page keeps the tab you came from lit.
- **Archive** links use `muted`, not `faint`.
- **Poster badges:** at most two:
  - your status
  - your opinion (favourite beats liked or didn't like)
  
  "Owned" is now in words under the title. The hard-coded `#0c0b0a` became `text-accent-fg`.
- **Stable keys** in the collection collage and the backup report.
- **`/` and ⌘K / Ctrl+K** focus search from anywhere. A `/` hint shows when there's a mouse or trackpad.
- **Library → Select:**
  - Pick several titles, then set their status, add them to a collection, archive or unarchive them, or remove them.
  - Archive and remove have Undo.
  - Escape or Done leaves select mode.
  - Hidden for the sample library.
- **Not done:**
  - Calendar stays under More, by choice: the type tabs are kept.
  - The type dropdown and labels toggle are still at the top, out of thumb reach.

---

## 12. Frontend Design skill (Anthropic, `anthropics/skills`)

Installed after section 11. It's a visual-direction skill. It lists the traits generated designs cluster around, and asks for a design plan (palette, type, layout, principles) that's checked against the brief before any code. Nothing has been changed from it yet: the findings point to an identity decision, which is the owner's call.

### On Deck against its "generic default" list
| Trait it names | On Deck today |
|---|---|
| Near-black background with a single bright accent | `#0c0b0a` with one yellow accent: a match |
| Tinted near-black standing in for black | `#0c0b0a`: a match |
| A monospace face for small data labels | JetBrains Mono, 91 uses: years, scores, chips, counts |
| Meta strings joined with middle dots | 76 places ("2022 · S2 · E4", "Drama · Sci-Fi") |
| "WORD — fragment" labels with a spaced em dash | About 33 ("S2 · E5 — out now") |
| ALL-CAPS labels | 32 uses: the sample banner, "Default" / "Smart" tags, chips, section labels |
| Default type families | Inter + JetBrains Mono, the usual pair |
| One radius everywhere | Mostly fine: full / md / lg / xl are used by role |

This agrees with Impeccable's verdict in section 11: the shell is generic and the content model is not.

### What it asks for next
A short design plan grounded in the subject: household TV, films, games and books, with a busy parent picking tonight's thing on a phone. "On deck" means next up. The plan would include:
- 4–6 named colours.
- One or two type families, chosen on purpose, with a type scale. Numbers would come from the type family's own tabular figures, not a mono face.
- Where the one bold moment goes. The poster → title morph is the obvious candidate, with everything else kept quiet.

That plan is then reviewed for defaults before any code changes.
