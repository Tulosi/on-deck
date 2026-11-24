# UX, design & flow review 2 — 2026-11-24

The second holistic pass. It follows [UX-REVIEW.md](UX-REVIEW.md) (2026-11-23) after the Up next row, Steam buttons,
filter rework, Settings rework and scheduler move. It's a menu of options with a suggested order. Nothing here has
been built.

**How it was done**
- **Impeccable critique**, run as its two separate assessments:
  - A: a design review against the Nielsen heuristics, cognitive load and personas.
  - B: the mechanical detector (62 rules) on the source and on 5 routes at 1440×900 and 390×844, plus a browser
    probe for overflow, contrast, tap targets and console errors.
- **Vercel Web Interface Guidelines**, using the current rules, checked against `src/`.
- **Emil Kowalski, Taste, Unslop and UI/UX Pro Max**, applied to screenshots of 8 routes at two widths plus code
  metrics (motion, type, colour, style tells). Pro Max's local product and UX guideline search was used too.
- **Awwwards:** the MCP's tools didn't load in this session, so its local index (1,568 sites) was searched
  directly. It's mostly marketing sites, so the references are for specific moments, not for the app as a whole.
- **Limits:**
  - Signed-out sample data only, with no cover art. Signed-in screens (the Tracking card, Settings, GamePrices)
    were judged from the code.
  - Contrast was measured in the dark theme.

---

## 1. Scores

| Lens | Score | In one line |
|---|---|---|
| Impeccable: Nielsen heuristics | **26 / 40** (Acceptable) | Solid foundation; Consistency, Recognition, Error recovery and Help are the low scores (2 each). |
| Impeccable: detector | **0 findings** in source; 1 advisory | No AI-slop tells. The only advisory is a flat type scale on Home (headings 18/20 px against 16 px body). |
| Web Interface Guidelines | **8 / 10** | Most of it is done well: focus ring, reduced motion, `Intl` for dates and prices, `color-scheme`. What's left: small tap targets, 2 unlabeled inputs, no skip link. |
| Emil (motion and interaction) | **7.5 / 10** | The springs, odometer, sliding indicators and interruptible swipe are strong. Press feedback is thin (3 places), and Mark watched has no undo. |
| Taste | **6.5 / 10** | The details are authored, but the layout could belong to any tracker. Lemon is spread too thin on Home. |
| Unslop | **8 / 10** | No gradients, glows, emoji or tracked caps. Two leftovers: mono used for words ("Tomorrow", "IMDb", "Steam 95%"), and one " · " in `lib/release.ts:65`. |
| UI/UX Pro Max (UX rules) | **7 / 10** | Empty states, hover and focus are covered. It wants skeletons over spinners (3 against 52), pressed states and 44px targets. |

**Since the last review (2026-11-23), done:**
- route splitting (22 chunks)
- the `faint` contrast fix
- a global focus ring
- `content-visibility`
- `srcset` and preconnects
- undo toasts
- view transitions

**Since the last review, still open:**
- a persisted library cache (IndexedDB)
- skeletons instead of spinners
- press feedback everywhere

---

## 2. What's working (keep it)

1. **The vocabulary.** Each media type gets its own words ("Beat it", "Reading it", "Caught up"), in sentence case.
   This is the most On Deck-specific layer.
2. **Ember tokens.** They're semantic and pass contrast. Light mode has its own `accent-ink`, so it reads as
   designed rather than inverted.
3. **Motion that does a job:**
   - the episode-code odometer
   - the sliding segment indicator
   - swipe-to-mark with a fitted spring
   - Up next drag, peek and snap
   - everything turned off under reduced motion
4. **Calendar on phone** is the calmest, clearest screen in the app.

---

## 3. Priority issues

| # | Sev | Issue | Fix | Effort |
|---|---|---|---|---|
| 1 | P1 | **Signed-out sample mode is a dead end.** Title, Search, Deals, Collections and Settings all end in "Sign in to …", so none of the four main tasks can be tried. Up next shows the *last-watched* episode because sample shows have no season data. | Make sample mode a working sandbox: in-memory status, mark and rating changes; local search over sample titles; sample prices and where-to-watch; season data so Up next shows the next episode. Use the real controls on title pages with "Changes aren't saved until you sign in". | M–L |
| 2 | P1 | **Lemon is spread too thin on Home.** Three full-width lemon buttons on equal cards, plus a lemon Sign in, "All" pill, Calendar link and episode codes. The rule "one accent marks your next action" is broken where it matters most. | Lemon only on the first Up next card's main button. Other cards get the outline style. Next 7 days codes and the Calendar link go to `fg`/`muted`. The active type pill becomes the quiet raised segment. | S |
| 3 | P2 | **One concept, four controls.** The type filter is lemon pills (Home, Calendar), a native select (phone), sidebar links (Library), bottom tabs (phone), and a lemon picker in search that ignores the page's type. Status words drift too: "Wanted / Done" in filters against "Want to watch / Watched it" on title pages. | One segmented control (raised selection) everywhere. Search follows the page's type. The filter panel uses the type's own status words when a type is selected. | M |
| 4 | P2 | **Poster overlays rely on memory.** Play, check, star and thumb tiles have no text. The only key is the "Labels on/Hover only" toggle. On phone the score loses its source ("8.7"). | At most one status mark per poster, with status in the subline ("S02E04, In progress"). Keep the score source on phone. | S–M |
| 5 | P2 | **Phone ergonomics.** Targets under 44px: calendar prev/next 32px, Home's "Show" buttons 24px, Filters 28px tall, Labels 32×28, top-bar Sign in 40×28, the Settings theme switch 28px tall. About 128px of chrome stacks above the content. | Bump these targets to 44px on touch (`h-11 sm:h-8` pattern). Fold the sample banner into the top bar. | S |
| 6 | P2 | **Mark watched has no undo or confirmation**, by button or by swipe. The swipe can fire by accident while scrolling. | Use the existing undo toast: "Marked S02E05 watched. Undo". The rolling code already shows the change. | S |
| 7 | P3 | **Errors show raw backend text** in some save paths (`err.message`). There's no help for terms like "Stalled", "Caught up" or the is / is not switches. | Map errors to plain messages. Add one-line hints (title attribute or a small ⓘ) on filter group names. | S |
| 8 | P3 | **Keyboard:** there's no skip link (14 tabs to reach search). There are no shortcuts for mark next or status. | Add "Skip to content". On title pages, `W` marks next and `1–5` sets status, listed in a `?` sheet. | S–M |

**Smaller items** (Web Interface Guidelines and polish):
- **Labels:** add `aria-label` to the services search (Settings.tsx:172) and the Seerr URL input (Settings.tsx:504).
- **Push device Remove** runs immediately; use the existing `removeWithUndo`.
- **`autoFocus` on phones:** Library.tsx:224, Collections.tsx:60 and CollectionPicker.tsx:62 open the keyboard. Reuse
  the `(pointer: fine)` guard from Search.tsx.
- **Inputs:** add `name` and `autoComplete="off"` to the plain text inputs, so password managers don't pop up.
- **Backdrops:** add `aria-hidden` to 3 click-to-close backdrops.
- **Placeholders** should end in "…".
- **Mono for words:** "Tomorrow" and "Fri 27" in Next 7 days, and "IMDb" / "Steam" inside score chips. Keep mono
  for the number only.
- **`lib/release.ts:65`** still joins with " · ".
- **The `/login` page** still shows the top-bar Sign in button.
- **Calendar month:** a lemon outline (selected) and a lemon dot (today) mean different things. Make the selected
  day `fg`.
- **Phone Calendar list:** the last row sits behind the tab bar. Add bottom padding.
- **Up next book cards** show only "Book". Add page or percent progress when known.
- **Home's flat type scale:** an h1 of 20 px against 16 px body. Taking h1 to 24 px and h2 to 18 px would give real steps.

---

## 4. Bigger options (choose a direction)

**A. "Try it for real" sample mode** (issue 1). This is the first impression for every visitor. Sample mode becomes a
working, local-only copy of the app, and sign-in is pitched as "keep this". It's the largest piece of work, but the
only one that changes how new people meet the app.

**B. "One next thing" Home** (issues 2 and 6).
- Home leads with a single decisive Up next card, plus the peek row behind it.
- Lemon goes back to meaning "your next action".
- Mark watched gets undo.
- Small and fast; it sharpens the core loop.

**C. Consistency pass** (issues 3, 4 and 7).
- One type control.
- One set of status words.
- Clearer poster marks.
- Plain errors and short hints.

Medium effort; it lifts the two lowest heuristics (Consistency, Recognition).

**D. Phone and keyboard pass** (issues 5 and 8, plus the smaller items).
- 44px targets.
- Less chrome on phone.
- A skip link and a few shortcuts.

Mostly mechanical; low risk.

**E. Speed leftovers from review 1.**
- A persisted library cache, so warm opens are instant.
- Skeletons for Home, Library and Title.
- Press feedback on buttons.

**F. A signature Library view** (Taste's open question). A dense row view built around progress and the next step
(episode code, hours left, pages), not the cover. Only On Deck would have this. Exploratory.

**References** (from the Awwwards index; for specific moments, not the whole app):
- [Creative Reference Library](https://crl-2026.webflow.io/): a dense catalogue grid with quiet filtering.
- [Ligue Nationale de Basket](https://lnb.fr/en): an app-style data layout with clear segment controls.
- [Kojima Productions](https://www.kojimaproductions.jp/en): large media imagery leading the page (the
  title-page backdrop).

---

## 5. Suggested order

1. **B: One next thing.** Small; fixes the most visible problem on the most-used screen.
2. **D: Phone and keyboard.** Mechanical, low-risk, and closes most of the Web Interface Guidelines list.
3. **C: Consistency.** Lifts the weakest heuristic scores.
4. **E: Speed leftovers.**
5. **A: Sample sandbox.** Worth it, but it's a project of its own.
6. **F: Signature view.** Explore after the basics.
