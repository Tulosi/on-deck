# UX, design & flow review 4 — 2026-11-24

A re-run of [UX-REVIEW-3.md](UX-REVIEW-3.md) after all nine of its items shipped:
- sample notices calmed
- signed-out Collections and Settings
- the sign-in page stands alone
- title page layout B
- Not now on every device

Nothing here has been built.

**How it was done** (same lenses as reviews 2 and 3)
- **Impeccable:** a Nielsen heuristics critique, plus the detector on the source and on 14 live routes.
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
  - Not yet checked signed in: Not now across two devices, and the title page's right column with real data (Where
    to watch, Collections, Remove).

---

## 1. Scores

| Lens | Review 3 | Now | In one line |
|---|---|---|---|
| Impeccable: Nielsen heuristics | 32 / 40 | **34 / 40** (Good) | Aesthetic went from 3 to 4 (one sample card, one lemon Sign in). Recognition went from 3 to 4 (Collections and Settings show what you'd get). Consistency stays at 3 (cut-off collection names, two search boxes on phones). |
| Impeccable: detector | 0 in source, 2 live | **0 in source, 1 live** | The nested cards on the title page are gone. Only the Up next scroller's flush-left first card is left, and that's by design. |
| Web Interface Guidelines | 9 / 10 | **9.5 / 10** | Labels, targets and the sign-in page are done. Left: a primary button whose text wraps, and a filter chip pushed off-screen. |
| Emil (motion and interaction) | 8.5 / 10 | **8.5 / 10** | No motion changes this round. Press feedback, undo and the poster morph all hold. |
| Taste | 7 / 10 | **7.5 / 10** | There's one lemon action per screen again. The title page reads as one centred block. Desktop Up next cards for books and games are mostly empty space. |
| Unslop | 9 / 10 | **9 / 10** | No tells. Copy is plain and specific throughout. |
| UI/UX Pro Max (UX rules) | 8.5 / 10 | **9 / 10** | No signed-out dead ends left. What's left are small layout faults. |

**The probe:**
- No console errors, no horizontal overflow and no low-contrast text on any route at either width.
- No unnamed controls or unlabeled fields.
- Every phone tap target is at least 44px, apart from the off-screen skip link and the search field, which sits inside a
  48px box.

---

## 2. What's better since review 3

1. **Signed out now hangs together.**
   - Home has one sample card with one lemon Sign in.
   - Collections has two working sample collections.
   - Settings says what each section does once you sign in.
   - The sign-in page has nothing pulling you away.
2. **The title page stays together on wide screens.**
   - Actions are on the left and reference is on the right, centred as one block.
   - Back lines up with the content.
   - No boxes sit inside boxes.
3. **Not now follows you** across devices once you're signed in.

---

## 3. Missed or new issues

| # | Sev | Issue | Fix | Effort |
|---|---|---|---|---|
| 1 | P2 | **The phone Up next button wraps.** "Mark S02E05 watched" breaks onto two lines in the main lemon button on Home. | On phones, show "Mark E05 watched" (the full code stays in the accessible name), or keep the label on one line with `whitespace-nowrap`. | XS |
| 2 | P2 | **"All" is last in the Search type chips and cut off at the right edge on phones.** Review 3 asked for it first. On a phone it shows as an icon and "A". | Put All first in `SEARCH_TYPES`; the order is display only, since the saved choice is stored separately. | XS |
| 3 | P2 | **Collection names are cut to "Waitl…" and "Early…".** The Smart and Default chips take the title's row. | Move the chips onto the line below the name, or drop Default (a Settings detail) and show Smart as an icon with a label for screen readers. | S |
| 4 | P3 | **Desktop Up next cards for books and games are mostly empty.** Project Hail Mary shows only "Book" above a tall blank area, because the row makes every card as tall as the TV card. | Give books a line of their own ("Reading it, 496 pages"), and let the action row sit at the bottom of a shorter card. Or let each card set its own height. | S |
| 5 | P3 | **The sign-in page on phones shows the logo twice** (the bare top bar and the card), and there's no plain-words way back to the sample. | Drop the logo in the card. Add a "Back to the sample library" link under the form. | XS |
| 6 | P3 | **Two search boxes on the Search page on phones** (the top bar's and the page's). | Hide the top-bar search on /search below `sm`. | XS |
| 8 | P2 | **The Covers/Progress switch jumps on desktop (signed in).** The page header spread its buttons across the row, so in Covers (with Select showing) the switch sat mid-screen, and in Progress (no Select) it jumped to the right. Found by you, fixed the same day. | The header now keeps its buttons in one group on the right, with the switch last. | XS |
| 7 | P3 | **The sample Early Access collection is empty** ("0 titles", blank tile), the only empty tile on the page. | Add one sample Early Access game. | XS |

**Fixed the same day:**
- #8: the Covers/Progress switch.
- #1: the phone Mark button reads "Mark E05 watched" on one line; the full code stays in its accessible name.
- #2: All leads the Search chips.
- #5: the sign-in page has one logo, and a "Back to the sample library" link.
- #6: no top-bar search on the Search page on phones.
- #7: a sample Early Access game, Saltmarsh Keepers.
- #3: collection names get the whole line, with the Smart and Default tags under them.
- #4: Up next book cards say where you are ("Reading"), the length and author, and "In your library" when you own it.

---

## 4. Suggested order

1. **The signed-in check:** Not now on two devices, and the title page's right column.
