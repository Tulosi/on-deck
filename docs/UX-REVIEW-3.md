# UX, design & flow review 3 — 2026-11-24

A re-run of [UX-REVIEW-2.md](UX-REVIEW-2.md) after options A–F shipped (one next thing, phone and keyboard,
consistency, speed, sample sandbox, Progress view), the calmer filters, Not now and the sample-library card.
Nothing here has been built.

**How it was done** (same lenses as review 2)
- **Impeccable critique:**
  - A: a design review against the Nielsen heuristics.
  - B: the detector on the source and on 6 live routes.
- **Browser probe** on 12 routes at 1440×900 and 390×844, checking:
  - console errors
  - horizontal overflow
  - text contrast against its painted background
  - unnamed controls and unlabeled fields
  - tap targets under 44px at phone width
- **Vercel Web Interface Guidelines, Emil, Taste, Unslop and UI/UX Pro Max**, applied to full-page captures of 12
  routes at both widths.
- **Limits:**
  - Signed-out sample data only, with no cover art. Signed-in screens were judged from the code.
  - Dark theme only.

---

## 1. Scores

| Lens | Review 2 | Now | In one line |
|---|---|---|---|
| Impeccable: Nielsen heuristics | 26 / 40 | **32 / 40** (Good) | Consistency, Recognition and Error recovery each went from 2 to 3, and User control and Flexibility from 3 to 4. Help is now 3. Aesthetic stays at 3 because sample notices pile up. |
| Impeccable: detector | 0 in source | **0 in source, 2 on live pages** | Nested cards on the title page ("Next up" inside Tracking). The Up next scroller's first card sits flush left (by design, aligned to the page edge). |
| Web Interface Guidelines | 8 / 10 | **9 / 10** | Skip link, labels and most 44px targets are done. Left: 2 unlabeled fields and a double clear button in search. |
| Emil (motion and interaction) | 7.5 / 10 | **8.5 / 10** | Press feedback, undo on Mark watched and Not now, and the filter panel staying above moving cards. |
| Taste | 6.5 / 10 | **7 / 10** | Lemon is disciplined on Home again, except signed out on phones: two lemon Sign in buttons sit above the lemon Mark button. |
| Unslop | 8 / 10 | **9 / 10** | Mono-for-words and the " · " are gone. No tells left. |
| UI/UX Pro Max (UX rules) | 7 / 10 | **8.5 / 10** | Skeletons, pressed states and 44px targets are in. Signed-out dead ends are the main gap. |

**The probe:**
- No console errors, no horizontal overflow and no low-contrast text on any route at either width.
- No unnamed buttons or links.

---

## 2. What's better since review 2

1. **Signed out is now a working sandbox.** Status, episodes, ratings and search all work, the sample-library card
   says plainly that nothing is saved, and Create an account goes straight to the right form.
2. **One accent for your next action** on Home (signed in), and undo wherever a tap changes something.
3. **One type control everywhere**, with status words that match per type.
4. **Calmer filters:** owned/available both ways, the 8 most common tags plus a search, and empty options hidden.
5. **Progress view** for people who think in "where am I", with Covers kept as the default.

---

## 3. Missed or new issues

| # | Sev | Issue | Fix | Effort |
|---|---|---|---|---|
| 1 | P1 | **Poster sublines squeeze the studio or author to a sliver.** When a poster shows status and "Owned", the byline shrinks to almost nothing: "Tomorrow, and Tom… 2022 Stalled G… Owned"; on It Takes Two only a "⊢"-like mark is left. On phone grids the status word is cut too ("Watched i", "Caught up" clipped). | Show the byline only when there's room: drop it when a status is shown, and give the status word `shrink-0` priority over "Owned". | S |
| 2 | P2 | **Sample notices pile up.** Signed-out Home has the top-bar note, the new card, and the footer line repeating the card. Title pages add a dashed note, and Search adds another. On phones, two lemon Sign in buttons sit above the lemon Mark button. | While the card is showing: drop Home's footer line, and make the top-bar Sign in the quiet outline style. Keep the title page and Search notes (they're where you act). | S |
| 3 | P2 | **Signed-out dead ends are left on three pages.** Collections is one line and Settings only has the theme switch. Collections still shows the type pills and Labels with nothing to filter. | Collections: a sample collection ("Weekend picks") built from the sample titles, with Sign in to make your own. Settings: show the sections read-only with Sign in to connect. Hide the toolbar when there's nothing under it. | M |
| 4 | P2 | **Search on phones:** <br>• two clear buttons (the browser's own ✕ inside the field and ours beside it) <br>• a second focus ring drawn inside the field <br>• the type chips wrap so "All" sits alone on a second row <br>• chips are 32px tall and Clear is 16px | Hide the native search ✕ (`appearance: none` on `::-webkit-search-cancel-button`). Drop the inner ring. Put "All" first and let the chips scroll sideways on one row. Make them 44px on touch. | S |
| 5 | P2 | **Phone tap targets still under 44px:** <br>• type pills on Home, Calendar and Collections (36px) <br>• the title page status segments (40px) <br>• the "Sign in" text link on Collections and Settings | Use `.hit` or the `h-11 sm:h-…` pattern. | S |
| 6 | P3 | **Two unlabeled fields:** <br>• Notes on title pages (the visible "Notes" heading isn't linked to the field) <br>• the password field on Login (the label sits beside Forgot password) | Link both with `htmlFor` / `id`. | XS |
| 7 | P3 | **The sign-in page still has the top-bar search and, on phones, the bottom tabs.** Both pull you away mid-sign-in. | Hide both on /login. | S |
| 8 | P3 | **The desktop title page's right column holds a single fact** ("Status: Returning Series") beside a tall empty hero. "Next up" is a card inside the Tracking card (the detector's nested-cards finding). | Move the show facts (status, network, seasons) under the title in the hero. Make Next up a plain section with a divider instead of a nested card. | S–M |
| 9 | P3 | **Not now only hides a title on the device you hid it on.** Hiding it on the laptop doesn't hide it on the phone. | Optional: store it on the item (a `snoozed_until` column) once you're signed in. Needs a migration. | S |

---

**Fixed the same day:** #1 (sublines), #4 (search on phones), #5 (targets: type pills, status segments, Sign in
links, search chips and result rows) and #6 (labels).

## 4. Suggested order

1. **#1 poster sublines**, **#6 labels**, **#4 search on phones** and **#5 targets**: one small pass, no design decisions.
2. **#2 notices**: needs your call on the top-bar Sign in style while the card shows.
3. **#3 signed-out Collections and Settings**: the last part of the sandbox.
4. **#7–#9** when convenient.
