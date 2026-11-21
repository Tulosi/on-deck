# UX backlog

Known rough edges to pick up in the full UI/UX/user-flow pass. Add to it as things come up.

## Toolbar — poster labels switch (`src/components/Toolbar.tsx`)
- **The switch shifts sideways when the readout changes.** The switch and readout sit right-aligned together,
  and "Labels shown" / "Labels on hover" / "Labels hidden" are different widths, so the switch moves with each
  change. Fix: give the readout a fixed width (or put it on the left of the switch).
- **The knob animation feels janky.** It animates the CSS `left` property with a `calc()`, which isn't
  smooth. Animating `transform: translateX(...)` instead would be smoother. Also consider a short ease-out.

## Tracking card — season rows (`src/components/StatusControls.tsx`)
- Showing the "Watched up to" row pushes the rating buttons down. A quick click can land on the wrong
  control mid-change (seen during testing). Consider reserving the space or animating the row in.

## Toolbar on phones
- At 375px the Sort menu sits tight against the labels switch. Consider moving Sort/Group into the Filters
  panel on phones, or letting the toolbar scroll horizontally.

## Phone tab bar ✅ done
- Replaced by 5 chosen tabs + More (Settings → Navigation). Books and Collections are reachable from More.
