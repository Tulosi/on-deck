# UX, design & flow review 5 — 2026-11-24

A re-run of [UX-REVIEW-4.md](UX-REVIEW-4.md) after all of its items shipped, plus three Home changes:
- New for you and Pick it back up? share a line on wide screens.
- Up next book and movie cards say something instead of just "Book" or "Movie".
- Up next on phones has a one-line Mark button.

**How it was done** (same lenses as reviews 2–4)
- **Impeccable:** a Nielsen heuristics critique, plus the detector on 13 live routes.
- **Browser probe** on 12 routes at 1440×900 and 390×844, checking:
  - console errors
  - horizontal overflow
  - contrast against the painted background
  - unnamed controls and unlabeled fields
  - tap targets under 44px at phone width
- **Vercel Web Interface Guidelines, Emil, Taste, Unslop and UI/UX Pro Max**, applied to full-page captures of 12
  routes at both widths.
- **Limits:**
  - Signed-out sample data only, with no cover art. Signed-in screens were judged from the code.
  - Dark theme only.
  - The paired rows were checked with sample titles standing in for New for you (a local test, not shipped). They
    haven't been seen on a real account.

---

## 1. Scores

| Lens | Review 4 | Now | In one line |
|---|---|---|---|
| Impeccable: Nielsen heuristics | 34 / 40 | **35 / 40** (Good) | Consistency went from 3 to 4: no cut-off names, one search box per page, and the switch no longer jumps. Help stays at 3. |
| Impeccable: detector | 0 in source, 1 live | **0 in source, 1 live** | Only the Up next scroller's flush-left first card, which is by design. |
| Web Interface Guidelines | 9.5 / 10 | **9.5 / 10** | Every phone target is now 44px. The one gap is a price chip that runs past a phone poster's edge. |
| Emil (motion and interaction) | 8.5 / 10 | **9 / 10** | The paired rows slide over when one empties: 280ms, ease-out, transform only, and still with reduced motion. |
| Taste | 7.5 / 10 | **8 / 10** | Home has less dead space on wide screens. Up next cards all say something about where you are. |
| Unslop | 9 / 10 | **9 / 10** | No tells. Numbers stay in mono and words in the text face, as intended. |
| UI/UX Pro Max (UX rules) | 9 / 10 | **9.5 / 10** | Targets, labels, dead ends and layout shift are all handled. |

**The probe:**
- No console errors, no horizontal overflow and no low-contrast text on any route at either width.
- No unnamed controls or unlabeled fields.

**Fixed during this review:**
- The phone Library and Calendar dropdowns (type, sort, grouping) and the filter search are 44px tall (were 40px).
- The Up next dots on phones are 44px wide (were 32px).

---

## 2. What's better since review 4

1. **Home uses wide screens.** The two short rows share a line, lined up with the lists above, and the space closes
   up smoothly when one empties.
2. **Every Up next card has something to say:**
   - shows: the next episode
   - games: hours played
   - books: Reading, pages and author
   - movies: the runtime and where you are
3. **Nothing is cut off or doubled.** Collection names show in full, Search has one box on phones, and All leads the
   type chips.

---

## 3. Missed or new issues

| # | Sev | Issue | Fix | Effort |
|---|---|---|---|---|
| 1 | P2 | **Price chips run past phone posters.** In the phone Library grid, Outer Wilds' "-60% · $9.99 · Low" chip is wider than the poster, so "Low" is cut to "Lov". | On narrow posters, show "Low" as a small green dot (with "historical low" as its label), or let the chip drop the % off when space is short. | XS |
| 2 | P3 | **The sample library never shows New for you**, so signed-out visitors can't see the row or the new pairing. | Give the sample two "new for you" entries (a season premiere and a game that just hit its low), in sample mode only. | S |

---

## 4. Suggested order

1. **#1 price chips:** a quick fix with no design decision.
2. **#2 sample New for you:** makes the sandbox show the newest layout.
3. **The signed-in check, still outstanding:**
   - the paired rows on a wide window
   - Not now on two devices
   - the title page's right column
   - the Covers/Progress switch
