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
- Replaced by 5 chosen tabs + More (Settings → Navigation). Books and Collections are reachable from More.

## Parked from Group G (to do, maybe)
Parked on 2026-11-23 rather than built, since the broader UI/UX pass may change or replace these. Revisit
then; drop any that no longer apply.
- **Title page:** narrower and denser.
- **Calendar:** narrower and denser.
- **Poster labels toggle:** rethink it. Tap to cycle through the states, in a fixed position sized for the
  longest label; propose a phone design during the pass.
- **General:** review how space is used across pages.
