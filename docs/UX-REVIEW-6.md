# UX, design & flow review 6 — 2026-11-25

A re-run of [UX-REVIEW-5.md](UX-REVIEW-5.md) on version 3bfdb4d. Since review 5, these shipped:
- the feedback batch (search clear button, Show/Hide toggles, price spacing, Waiting for 1.0, the phone type dropdown, a selection that stays after bulk changes)
- Import can replace the library, with a copy downloaded first
- the update-ready toast
- game search falls back to Steam
- the StatusControls and Settings split, and Supabase realtime removed from the first load

**How it was done**
- **Build checks:** typecheck, production build, and a Deno type check of all 18 server functions.
- **Impeccable:** an audit, plus a critique run as two separate assessments:
  - A: a Nielsen design review
  - B: the detector on the source and 12 live routes at both widths, plus the in-page overlay on 5 routes
- **Browser probe** on 12 routes at 1440×900 and 390×844, checking:
  - console errors
  - horizontal overflow
  - contrast against the painted background
  - unnamed controls and unlabeled fields
  - tap targets under 44px at phone width
- **New this time:**
  - **Light theme:** 6 routes at both widths.
  - **Keyboard-only pass:** 40 Tabs on 5 routes, checking focus rings; Escape on search and filters.
  - **Live, signed in:** Steam fallback search and add, and the bulk Status menu words.
- **Vercel Web Interface Guidelines, React best practices, Emil, Taste, Unslop and UI/UX Pro Max**, applied to the code
  changed since review 5 and to full-page captures.
- **Limits:**
  - The sample library still has no cover art.
  - There was no screen-reader pass.
  - The update toast can only be seen from the next release on.

---

## 1. Scores

| Lens | Review 5 | Now | In one line |
|---|---|---|---|
| Impeccable: Nielsen heuristics | 35 / 40 | **29 / 40** (Good) | A stricter reviewer found older problems that earlier reviews missed: search defaults to Movies, Remove is less protected than Archive, and the type filter takes four forms. Not a regression. |
| Impeccable: audit | — | **18 / 20** (Excellent) | Accessibility 3: the timed Undo, and some badges rely on colour. Integrity 3: nested boxes, type-filter drift. Performance, theming and responsive each 4. |
| Impeccable: detector | 0 in source, 1 live | **0 in source, 4 live** | Two are false alarms: the Up next edge (by design) and the Login tab switch. Two are real but minor: per-season boxes inside a box on phones, and one-word last lines on Settings. |
| Web Interface Guidelines | 9.5 / 10 | **9.5 / 10** | The keyboard pass is clean: every control shows a ring, and Escape closes search. The new code passes. |
| React best practices | — | **pass** | No new issues. A few older Settings pieces still copy props into state with an effect. |
| Emil (motion and interaction) | 9 / 10 | **9 / 10** | No new motion. The Undo toast doesn't pause on hover or focus. |
| Taste | 8 / 10 | **8 / 10** | The light theme holds up. Blank sample posters are still the weak spot. |
| Unslop | 9 / 10 | **9 / 10** | No tells. The Replace warning and the toggle chips fit the system. |
| UI/UX Pro Max (UX rules) | 9.5 / 10 | **9 / 10** | Search's hidden Movies default leads to false "no match" results. |

**Build checks**
- The typecheck and build are clean.
- 15 of 18 functions type-check clean. daily, push and status share the same 4 type errors in the web-push code, as before.

**Probe**
- No console errors, overflow, low-contrast text, unnamed controls or unlabeled fields on any route at either width.
- Every phone tap target is 44px. The three flags were false alarms:
  - the skip link, which only shows on keyboard focus
  - the search field, which sits inside a 44px box
  - the type dropdown, which is inside a 44px pill

**Live checks (signed in)**
- A Steam-only game ("Hot Nights Racing") turns up in search, adds, and gets a full title page: cover, banner, tags, "Release date TBA" and the store link. It was removed afterwards.
- AetherCycle still comes from IGDB, and the matching Steam result is left out.

---

## 2. Issues

| # | Sev | Issue | Fix | Effort |
|---|---|---|---|---|
| 1 | P1 | **Search defaults to Movies.** With no saved choice, the type is Movies ([SearchResults.tsx:23](../src/components/SearchResults.tsx)). Home says "All types" but the box says "Search movies…". The sample's own hint ("sev" or "hades") finds nothing for "hades", because it's a game. | Default to All. When the chosen type finds nothing but another type has matches, say "1 match in Games" with a link instead of "Nothing matches". | S |
| 2 | P2 | **Remove is less protected than Archive.** Archive asks first. Remove (which loses rating and notes) goes straight through, with a 6s Undo that doesn't pause on hover or focus and is replaced by the next toast. | Pause the Undo timer on hover, focus and hidden tab, and make it about 10s. Name what's lost ("with your rating and notes"). Consider putting Archive and Remove together in one menu. | S |
| 3 | P2 | **One filter, four looks.** Desktop has pills. Phone Home has the "Showing: All types" pill. Phone Library has a bare select reading "All". The search box keeps its own type. | Use the "Showing:" pill everywhere on phones, and let search follow the page's type. | S |
| 4 | P2 | **Sample posters.** With no image, the dark scrim still draws over the placeholder (grey smudges in light theme), and the title shows twice. | Skip the scrim when there's no image, and drop the in-card title when the caption shows it. Better: real covers for the sample (review 5's top suggestion). | S–M |
| 5 | P3 | **Per-season rows are boxes inside a box** on phones: framed rows inside the framed section, with framed segmented controls inside them ([TvProgress.tsx](../src/components/TvProgress.tsx)). | Turn the rows into divider-separated rows. | XS |
| 6 | P3 | **Phone search tabs end in a clipped "Boo".** | A fade at the right edge, or let the tabs wrap like on desktop. | XS |
| 7 | P3 | **One-word last lines** in the signed-out Settings list on phones ("use.", "in."). | `text-wrap: pretty` on those lines. | XS |
| 8 | P3 | **TV status on phones** wraps to 2×2 with Archive left on its own line below. | Comes with the menu in #2. | — |
| 9 | P3 | **`?` with the search dropdown open** shows the shortcuts sheet with the dropdown still behind it. | Close the dropdown when the sheet opens. | XS |

**Checked and dismissed:**
- **/deals is a 404:** Deals is a collection and its links are correct. /deals was only in the test list.
- **The Up next carousel's first card is flush left:** that's by design. It lines up with the heading.
- **The Login tab switch counts as a nested card:** it's a control, not a card.

---

## 3. Suggested order

1. **#1 Search default.** It's the most-used control, and the sample's own hint fails today.
2. **#2 Remove and Undo.** The one place data can be lost without a pause.
3. **#3 One phone filter**, together with #1, since both touch the search type.
4. **#4 Sample posters**, or real covers.
5. **#5–#9** in one small polish pass.

---

## 4. After the fixes (same day)

**All nine issues are fixed:**
1. **Search starts on All** and follows the page's filter (no ?type= on Home, Library or Calendar means All). When one type finds nothing, it offers "1 match in other types" or "Search all types". A /search link with no type means All. The placeholder for All is "Search…".
2. **Undo toasts:**
   - They pause while hovered or focused, and the save pauses with them.
   - They last 10s (was 6s).
   - Up to three stack, so a second action no longer takes away the first one's Undo.
   - Remove says what goes with it ("…, with your rating and notes").
3. **Phone Library uses the same "Showing:" pill** as Home and Calendar.
4. **Posters without art:**
   - The panel shows just the type icon, with no scrim (no more grey smudges in light theme).
   - The name shows once, under the poster, on up to two lines.
5. **Per-season tracking** is a section of the Tracking card (a rule above it), not a box inside the box.
6. **Phone search tabs** share the width without icons, so none is cut off.
7. **Settings preview lines** use `text-wrap: pretty`.
8. **Archive on narrow cards** is a quiet text action at the end of the "Status" label row (still a 44px tap area). Wide cards keep the full button beside the options.
9. **Focus leaving the search box** (Tab, or `?` opening the shortcuts) closes its results.

**Also fixed:**
- **Caught up and Watched it on a show** move your place to the latest aired episode. They now say so ("Marked watched up to S02E10") with Undo, the way Mark watched does. The rerun reviewer found this, as a P1.
- **The Login Sign in / Create account switch** tells screen readers which one is picked.

**Rescore**

| Lens | Before fixes | After |
|---|---|---|
| Impeccable: Nielsen heuristics | 29 / 40 | **27 / 40**, from a new, independent reviewer (scored before the last two fixes) |
| Impeccable: audit | 18 / 20 | **19 / 20**: integrity is now 4 (no filter drift, no nested boxes); accessibility stays at 3 |
| Impeccable: detector | 0 in source, 4 live | **0 in source, 2 live, both false alarms** |
| Web Interface Guidelines | 9.5 | **9.5** |
| React best practices | pass | **pass** |
| Emil | 9 | **9.5**: toasts pause on hover and focus, and stack |
| Taste | 8 | **8.5**: clean placeholders in both themes |
| Unslop | 9 | **9** |
| UI/UX Pro Max | 9 | **9.5**: search no longer hides results behind a type |

The Nielsen number moves with the reviewer. Each fresh, independent review finds older problems the last one didn't look at. The rerun named the review 6 fixes as strengths: search, the pausing Undo, and the posters. Its lower score came from new findings, listed below.

**New findings from the rerun (not fixed, need a decision):**

| # | Sev | Issue | Suggestion |
|---|---|---|---|
| 10 | P2 | "In your library" on games and books means *owned*, but every tracked title is already in the Library. Cards say "Owned". | Label it "Owned". |
| 11 | P3 | Archive (reversible) asks first, while Remove (permanent) only has Undo. The Archive dialog also points to "the Archived filter" rather than the sidebar's Archive. | Archive with Undo and no dialog, or keep the dialog and fix its wording. |
| 12 | P3 | Wording: "Labels on / Hover only", and on phones "EA" and "S3 in 12d". | "Poster details: Always / On hover"; spell out Early access. |
| 13 | P3 | The shortcuts sheet says "1 to 5" without saying which status each number sets. | List the statuses per type. |
| 14 | P3 | Calendar's width changes between List and Month, so "Add to your calendar" moves. Past days in Month look emphasised. | One width; mute past days. |
| 15 | P3 | Desktop /search shows two search fields (top bar and page). The Login page doesn't say what On Deck is. "Replace my library" uses the yellow primary style. | Hide the top-bar box on /search; one line on Login; a danger style for Replace. |

---

## 5. Findings #10–#15 fixed (same day)

10. **"In your library" is now "Owned"** on game and book pages, the Up next card, the progress rows and the bulk bar. It matches the "Owned" chip on cards. Search keeps "In your library. Open it", which is correct there.
11. **Archive no longer asks first.** It archives straight away, with a 10s Undo: "Archived “X”. It’s off Home, the Library and alerts, and kept under Archive." Now the reversible action has Undo, the same as Remove.
12. **Wording:**
    - The poster toggle reads "Poster details: Always / On hover" ("Off" on touch screens).
    - Posters say "Early access" in full.
    - The TV chip says "S3 in 12 days". Both fit on phone posters.
13. **The shortcuts sheet lists each number** on a title page ("1 Want to play … 5 Dropped it"). On other pages it says "1–5 Set the status, in the order shown".
14. **Calendar:**
    - The List and Month views keep their different widths. A month grid needs room; a list reads best narrow.
    - The header, the type filter and the List/Month switch now sit in the list's width in both views, so "Add to your calendar" and the switch don't move when you change view. Only the grid goes wider.
    - Past days are muted: a darker cell with faded text. Today and the selected day stand out.
15. **Smaller fixes:**
    - /search has a single search field. The top-bar box is hidden there, and `/` and ⌘K focus the page's field.
    - Login says what On Deck is, in one line above the card.
    - "Replace my library" uses the red danger style.

**Checks:**
- Typecheck and build are clean.
- The probe found nothing on 12 routes at both widths. On phones, the only tap-target flags are the three known false alarms.
- A browser pass covered:
  - the calendar header (the same position in List and Month)
  - Archive with Undo (no dialog)
  - the shortcuts list
  - the single search field on /search, with `/` focusing it
  - the Owned label and the poster toggle text
  - no phone poster chips past the edge
  - no page errors

**Rescore**

| Lens | After section 4 | Now |
|---|---|---|
| Impeccable: Nielsen heuristics | 27 / 40 | **~31 / 40** (estimate). All six rerun findings are fixed, plus the two issues it was scored before. Not re-reviewed by a fresh reviewer. |
| Impeccable: audit | 19 / 20 | **19 / 20**. Accessibility stays at 3: some badges still rely on colour. |
| Impeccable: detector | 0 in source, 2 live (false alarms) | **unchanged** |
| Web Interface Guidelines | 9.5 | **9.5** |
| React best practices | pass | **pass** |
| Emil | 9.5 | **9.5** |
| Taste | 8.5 | **8.5**. The calendar reads calmer. Real sample covers are still the next step up. |
| Unslop | 9 | **9** |
| UI/UX Pro Max | 9.5 | **9.5** |

---

## 6. Nielsen rescore after b2c2d7c

A fresh reviewer did this pass. It didn't see the earlier reviews. It checked 20 routes at both widths in the sample library and ran the main flows. Remove was not tested, because it only shows when you're signed in.

| Heuristic | Score | Note |
|---|---|---|
| Visibility of system status | 3 | Every change shows a toast. An Undo toast doesn't change after you press Undo. |
| Match with the real world | 3 | The words fit each media type. "Seerr", "Hardcover" and "Stalled" aren't explained everywhere. |
| User control and freedom | 3 | Undo is everywhere. Undoing older toasts out of order can lose newer progress. |
| Consistency and standards | 3 | The filter chips say "Wanted / Done", but title pages say "Want to watch / Watched it". |
| Error prevention | 3 | Archive can be undone and Replace backs up first. The single key `3` marks a whole show caught up. |
| Recognition rather than recall | 3 | The shortcut sheet shows this title's statuses. Nothing on screen points to `?`. |
| Flexibility and efficiency | 3 | Strong shortcuts and bulk actions. Few shortcuts outside title pages. |
| Aesthetic and minimalist design | 3 | Calm overall. Three stacked toasts and the permanent drag hint add noise. |
| Error recognition and recovery | 3 | Plain messages. A title ID that doesn't exist is a dead end. |
| Help and documentation | 2 | No help page or first-run explanation. |
| **Total** | **29 / 40 (Good)** | Up from the rerun's 27. |

**What it found (confirmed in code):**

| # | Sev | Issue | Fix |
|---|---|---|---|
| 16 | P2 | The Undo toast stays up after you press Undo ([Toaster.tsx](../src/components/Toaster.tsx)), so you can't tell it worked. | Dismiss the toast when its action runs. |
| 17 | P2 | Undoing an older toast after newer changes to the same title restores an old snapshot and loses the newer progress. | Keep only the latest Undo for each title. |
| 18 | P2 | An empty Archive says "Nothing matches these filters" ([Library.tsx](../src/pages/Library.tsx)). | Give it its own empty state. |
| 19 | P3 | A title that isn't in your library is a dead end ([TitleDetail.tsx](../src/pages/TitleDetail.tsx)). | Add a "Go to Library" link. |
| 20 | P3 | Filter status words differ from title-page words. Episode numbers on cards aren't labelled (last watched vs next). | A hint line, and "Watched S02E04" / "Next S02E05". |
| 21 | P3 | Nothing points to `?`, and Caught up doesn't say how many episodes it marked. | A shortcuts link in the sidebar footer, and the count in the toast. |

**Fixed (same day):**
- **#16:** Pressing Undo closes its toast.
- **#17:** Toasts are tied to their title. A newer change to the same title replaces the older toast, so the only Undo on screen is the latest one. Pressing W then 3 shows one toast: "Marked 5 episodes watched, up to S02E10".
- **#18:** An empty Archive says "Nothing archived. Archive a title from its page…".
- **#19:** A missing title offers "Go to Library" and "Search to add it".
- **#20:**
  - Across types, the Status filter's hint explains the general words ("Wanted = Want to watch, play or read. Done = …").
  - Library cards say "Watched S02E04".
- **#21:**
  - The sidebar footer has a "Keyboard shortcuts ?" button. The sheet now also lists Alt + ↑/↓ for moving sidebar items.
  - Caught up says how many episodes it marked.

**Also, from feedback:**
- **Home and Library filter by any mix of types** ("Games", or "Movies and games"). On desktop, each type is a chip you toggle on and off. On phones, the "Showing:" pill opens a checklist. The URL holds the list (`?type=movie,game`). Per-type filters (genres, Steam Deck…) still appear when exactly one type is picked. Calendar stays one type at a time.
- **New for you sits closer to Pick it back up?** The first row is only as wide as it needs to be, up to 36rem. Rows with more titles still push the second one over.

---

## 7. Nielsen rescore after 32a9ee8, and why it isn't higher

A fresh, independent reviewer scored **33 / 40** (Good):
- **4 each:** Match with the real world, User control and freedom, Flexibility and efficiency.
- **3 each:** the other seven heuristics.

This run was up from 29 and 27.

**Why the number moves, and where it tops out:**
- **The rubric is strict by design.** "A 4 means genuinely excellent", and "most real interfaces score 20–32". A 3 is the default answer for anything good. 33 is already above that range.
- **Each reviewer is new.** Each fresh reviewer explores differently and finds different things. Scores of 27, 29 and 33 across three runs show a spread of about ±3 points from the reviewer alone.
- **About 3–4 points are real gaps that can be fixed.** The rest are taste or the ceiling for this kind of app. A realistic best is about 36–37 / 40.

**Real gaps (each would earn its point):**

| Heuristic | Gap |
|---|---|
| Error prevention | **Data loss:** choosing "Want to…" clears the started and finished dates ([library.ts](../src/lib/library.ts)), and a plain status change has no Undo. One stray `1` on a title page erases the dates. |
| Visibility | Every route's browser tab says "On Deck". A plain status change shows no confirmation. |
| Error recovery | A failed save rolls back with a message but no Retry. |
| Consistency | "TV" (search, phone tab bar) vs "TV shows" (Library, sidebar). On phones, Library sits under More, and More lights up on Library and title pages. |
| Recognition | The shortcuts sheet leaves out ⌘K and Esc. The phone "Poster details" button is an icon with no label. |

**Taste or ceiling:**
- **Aesthetic (8):** up to four badges per card and a dense Library toolbar.
- **Help (10):** a personal tracker seldom needs a help centre. Short "How this works" notes in Settings → Connections would be the most to add.

**Fixed (same day):**
- **Error prevention:**
  - Every status change shows "Set to …" with Undo.
  - Undo puts back the old status, place and dates exactly. The app now loads `started_at`, so it can restore it.
  - A stray `1` can still clear the dates, but one press of Undo brings them back.
- **Visibility:**
  - Every page sets its browser tab title ("Severance – On Deck", "Movies and games – On Deck", "Search: dune – On Deck", "Page not found – On Deck").
  - Status changes confirm with a toast, as above.
- **Error recovery:** a failed save says "It's been put back" and offers Retry, which sends the same change again.
- **Consistency:**
  - "TV shows" everywhere: the search tabs, the phone tab bar, and result rows ("TV show").
  - On a title page reached from a page that isn't a tab, More no longer lights up.
- **Recognition:**
  - The shortcuts sheet lists ⌘K / Ctrl+K and Esc.
  - The phone poster-details button says "Details".
  - On narrow phones the type pill drops the word "Showing:"; its icon and arrow still mark it as a filter.

**Also:** the Early Access collection includes games set to "Waiting for 1.0".

**Not changed:**
- Library is still under More in the default phone tab bar. The four type tabs cover it, and the tabs can be changed in Settings → Navigation.
- Two-type combinations on a 390px phone lose a few letters in the pill. The checklist shows the full choice.

---

## 8. Nielsen rescore after 7e461e5

A fresh, independent reviewer scored **33 / 40** (Good) again, but the scores per heuristic moved:
- **Now 4:** Visibility (toasts with Undo on every change), Recognition (shortcut hints, the per-title shortcuts list) and Flexibility. Last time's fixes landed.
- **Now 3:** Match with the real world and User control. They were 4 last time. This reviewer found different gaps.

The total is the same because each new reviewer looks somewhere new.

**Real gaps it found (confirmed in code):**

| # | Sev | Issue |
|---|---|---|
| 22 | P2 | Bulk status changes have no Undo ([library.ts](../src/lib/library.ts) `setStatus`). It's the one change to many titles that can't be taken back, and it can clear their dates. |
| 23 | P2 | Sign-in enforces the 8-character minimum meant for new passwords ([Login.tsx](../src/pages/Login.tsx) `minLength={8}` in every mode). A shorter existing password is blocked by the browser's popup. |
| 24 | P3 | A bulk failure doesn't name the titles or offer Retry. |
| 25 | P3 | The login error isn't announced to screen readers (no `role="alert"`). Validation uses browser popups. |
| 26 | P3 | On phones, "Details" on Home clashes with the cards' own "Details" buttons. The Library filter's status words still differ from title pages. |

**Taste or ceiling:** Library's desktop toolbar (about 10 controls in one row), three sample-mode notices, and no concept help page.

**Fixed (same day):**
- **#22:** Bulk status changes show "N titles set to X" with Undo. Undo puts each title's own status and dates back.
- **#23:** Sign-in no longer enforces the 8-character minimum. Only Create account does.
- **#24:** A bulk failure names the titles ("Couldn't update “Dune” and 2 more.") and offers Retry for just those.
- **#25:**
  - Sign-in errors are announced to screen readers (`role="alert"`).
  - Missing or wrong fields get messages under the field and a red border, instead of browser popups. Focus goes to the first problem.
- **#26:** The phone poster-details button says "Poster info", so it no longer reads like the cards' Details buttons.

**Polish pass (same day):**
- The Library status filter, its hint and the filter pills use the words your picked types share ("Want to watch" for movies and TV). Mixed words fall back to "Wanted" and "Done", and the hint spells out only the picked types' words. The status list holds only statuses the picked types can have.
- Phone type pill: several types read "Games, books" or "TV, movies", with no "Showing:" prefix. Narrow phones count them ("2 types" below 24rem, "3 types" below 26rem), since the heading below names them. Nothing truncates from 360 to 600px.
- Posters: a long status word ("Waiting for 1.0") takes the year's place, so it isn't cut off.
- Links that repeat `type=` (`?type=movie&type=game`) keep every type, on the Library and in the search box.

**Signed-in checks (live account, every change put back):**
- Bulk status change and Undo: two games set to Beat it, then Undo. Both came back exactly, including Tiny Rogues' stalled date.
- Single status Undo on a title page: back to Playing it with the earlier dates, not new ones.
- Failed save on a title page: "Couldn't save that change. It's been put back." with Retry; Retry saved it.
- Failed bulk change: the toast named both games with Retry. **Bug found and fixed:** the screen put back only one of them; the other vanished from the list until reload, because each failed save restored a whole-list snapshot. Now a failed save puts back only its own title and re-syncs.
- **Fixed:** while the selection bar is open, toasts now sit above it instead of on top of it.
- Waiting for 1.0 → Want to play: a released game left on Waiting for 1.0 moved on load, kept its start date, and said why; Undo put it back and it stayed there after reload.

**Follow-ups (same day):**
- The automatic status moves (Waiting for 1.0 → Want to play, TV catch-up) only act on library data just loaded from the server, never on an older copy or mid-refetch.
- A status, episode or archive change that failed and then went through on Retry now shows its usual message with Undo.
- Moving a title back to Playing / Watching / Reading, Caught up or Stalled clears its finish date. Undo still puts the old date back.
