# UX backlog

Known rough edges to pick up in the full UI/UX/user-flow pass. Add to it as things come up.

## Toolbar — poster labels switch (`src/components/Toolbar.tsx`) ✅ fixed
- **The switch shifts sideways when the readout changes.** The switch and readout sit right-aligned together,
  and "Labels shown" / "Labels on hover" / "Labels hidden" are different widths, so the switch moves with each
  change. Fix: give the readout a fixed width (or put it on the left of the switch).
- **The knob animation feels janky.** It animates the CSS `left` property with a `calc()`, which isn't
  smooth. Animating `transform: translateX(...)` instead would be smoother. Also consider a short ease-out.
- **Fix:** the readout has a fixed width, and the knob slides with `transform` (1rem steps, ease-out).

## Tracking card — season rows (`src/components/StatusControls.tsx`) ✅ fixed
- Showing the "Watched up to" row pushes the rating buttons down. A quick click can land on the wrong
  control mid-change (seen during testing). Consider reserving the space or animating the row in.
- **Fix:** "Progress" is always shown for shows that aren't dropped, with a "Not started" episode option. The
  Plex check shows inline in its heading, so nothing below it moves.

## Toolbar on phones ✅ fixed
- At 375px the Sort menu sits tight against the labels switch. Consider moving Sort/Group into the Filters
  panel on phones, or letting the toolbar scroll horizontally.
- **Fix:** on phones Sort and Group live in the Filters panel ("Arrange"); the toolbar keeps type, Filters and
  the labels switch.

## Phone tab bar ✅ done
- Replaced by 5 chosen tabs + More (Settings → Phone tab bar). Books and Collections are reachable from More.

## Parked from Group G (to do, maybe)
Parked on 2026-11-23 rather than built, since the broader UI/UX pass may change or replace these. Revisit
then; drop any that no longer apply.
- ✅ **Title page:** narrower and denser (2026-11-23). Content capped at `max-w-5xl` with a 14rem side column,
  a shorter backdrop, a smaller poster on phones, and the description beside the poster from `sm:` (clamped
  to 4 lines with More/Less; under the header on phones, 3 lines). Phone page about 18% shorter.
- ✅ **Calendar:** narrower and denser (2026-11-23). One compact list (`max-w-4xl`) instead of two columns of
  cards: date, small cover, title, what's coming, countdown. On phones the date moves under the title. Episode
  codes (`S02E06`), no lemon chip for "Tomorrow" (accent text instead), smaller month cells.
- ✅ **Poster labels toggle:** replaced by a single Labels on/off button (tag icon), 2026-11-23.
- ✅ **General:** space review across pages (2026-11-23). Cards are 8px-cornered with tighter phone padding
  (Settings, Collections, Search, Import, Login); page meta ("6 upcoming") in the text face. Signed-out
  Collections, Search and Settings were already compact. Settings sections and Import were checked in code
  only, since they need a signed-in account.
