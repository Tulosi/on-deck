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
