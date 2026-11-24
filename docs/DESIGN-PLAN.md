# Design plan: On Deck's own look (draft for review)

Drafted with the Frontend Design skill (see UX-REVIEW §12). **Nothing is built yet.** This is a proposal to react
to, piece by piece. It changes the look, not the features or the layout of pages.

## Update: technical direction (replaces the scoreboard idea below)
The owner rejected the scoreboard direction as too sporty. On Deck should look **technical, aimed at a power user who
runs their own media server**. The mockup canvas now shows one denser Home in five colour and type pairings:

| | Pairing | Ground / accent |
|---|---|---|
| A | **Rack:** IBM Plex Sans + IBM Plex Mono | graphite `#16181c` / amber `#f5a524` (status-LED amber) |
| B | **Console:** Geist + Geist Mono | navy `#0d1320` / cyan `#4cc9f0` |
| C | **Phosphor:** Chivo + Chivo Mono | olive black `#181914` / lemon `#f4e04d` (keeps today's brand colour) |
| D | **Blueprint (light):** Instrument Sans + Martian Mono | cool paper `#eef1f5` / cobalt `#2457d6` |
| E | **Lilac:** Red Hat Text + Red Hat Mono | plum grey `#17151c` / lilac `#b69cff` |

What's shared across all five:
- **Monospace for machine values:** `S02E05`, file quality, size, hours and dates. For this audience it reads as data, not decoration.
- **A sync-status strip:** `plex/nas-01`, `seerr` and `steam`, with the time since the last sync.
- **A denser layout:** Up next as a card with a key/value row (runtime, file, size, aired), then Continue as compact list rows, then Next 7 days as a dated list.
- **The one accent marks your next action.**

All pairings pass the 4.5:1 contrast minimum. The scoreboard notes below are kept for the record.

### Decision: Ember (2026-11-24)
These were rejected:
- The graphite with yellow amber that was briefly chosen: too close to Plex's own app.
- Five more colourways (F–J).

The owner picked **Ember**: Chivo + Chivo Mono, the same layout, and a lighter technical tone, with no file type or size and no server hostnames.

| Token | Hex |
|---|---|
| Background | `#1e1812` |
| Surface | `#261f18` |
| Raised | `#30271f` |
| Line | `#3e342a` |
| Text | `#f2ece2` |
| Secondary text | `#b0a493` (6.0:1 on raised) |
| Accent (lemon) | `#f4e04d` (10.9:1 on raised; text on it `#1e1812`) |
| Good | `#9fd38a` |

The Home, Library and title page mockups are on the canvas in this palette. Light theme: see stage 5.

**Built, stage 1 (2026-11-23):** Ember dark tokens (faint `#9a8e7e`, 4.6:1 on raised; bad and info unchanged), Chivo and
Chivo Mono replace Inter and JetBrains Mono, the icon and `theme-color` use `#1e1812`, the light/dark switch moved from
the top bar to Settings → Appearance, and Home opens with the Up next card. **Stage 2:** Continue as list rows, Next 7 days as a dated
list (beside Up next on wide screens), and the sync line at the top of Home. **Stage 3:** Library posters 3 across on phones, episode codes (`S02E04`) under TV posters, no separator dots on cards, poster chips in sentence case and the text face ("Next ep Tue", "In 3 days", "Early access", "Free"), filter chips without the "Status:" prefix, and 6px-radius buttons. **Stage 4:** title page. The Tracking card gains a Next up block for shows (episode code set large, "Out now", and the page's one accent button, Mark S02E05 watched, when it's yours to mark); the selected status is a quiet raised segment, not an accent fill; sentence-case labels instead of small mono capitals; episode codes everywhere ("Next episode S02E05, Tue, Nov 25 (tomorrow)"); 6px-radius buttons; no eyebrow or separator dots in the header. **Stage 5:** Ember light. Paper `#efe8dd`, surface `#fbf8f3`, raised `#e5dccf`, line `#d6cabb`, ink `#1e1812`, secondary `#5e5245`, faint `#6b5d4c`, accent ink `#5c4d00`, good `#2a6e2e`, bad `#a8341f`, info `#255c94`, and a new warn token (`#fdba74` dark, `#8f4508` light); all text ≥4.5:1 on every surface. Lemon stays a fill only: progress bars, dots and the sidebar marker now use accent ink, which is lemon in dark and deep olive in light. **Stage 6:** copy pass. Statuses, type names and buttons in sentence case ("In progress", "Want to watch", "TV shows", "In your library"); the 20 small all-caps mono labels are now plain sentence-case labels; the sample-data banner is a normal sentence; separator dots and dashes in visible text replaced with commas, full stops or spacing. **Stage 7:** per-season bars in the Tracking card (shows with 2+ seasons): watched of aired per season, green when done, pale orange when ignored, "Not aired" for future seasons. **Clean-up:** mono kept for numbers only (search results, Rate it labels, Import details and per-season text moved to the text face); 28 remaining pill buttons and inputs now have 6px corners (pills only for the type picker); the Up next card gains a facts row (Watch on, Network, Latest episode or Runtime) and Open in Plex, which becomes the bold action when there's nothing to mark. Every part of the Ember mockups is now built
(sentence case, mono only for numbers). **Stage 8:** pages the mockups didn't cover. Title page narrower, with the
description beside the poster; Calendar as one compact dated list; Settings, Collections, Search, Import, Login and
their panels moved to 8px cards and 6px buttons, separator dots removed (backup summary, Where to watch footer,
archived-titles note, version line), relative times and counts in the text face, and the Search type buttons use the
quiet raised selection instead of a lemon fill. **Stage 9, motion (no new library):** episode codes and
counts roll like an odometer when they change (`RollingText`: only changed digits move); rows and cards that leave
Home's lists shrink away while the rest close the gap (`useLeaving`, `.leave-x` / `.leave-y`), and a new title
taking the Up next card lifts in; progress and season bars grow to their new length (`.bar-fill`); the selected
option in Status, Priority, List/Month, Dark/Light, the type pills and Import's view slides between options
(`useSlidingIndicator`); Calendar's month arrows slide the grid in the direction you went (a view transition with
`month-next` / `month-prev` types); the description's More/Less and `<details>` sections open and close smoothly
(`interpolate-size`, so browsers without it simply jump). Reduced motion turns all of it off.

## The brief, as I read it
- **Subject:** a household's queue of films, shows, games and books. "On deck" is baseball's name for the batter
  who's up next; the app icon is already a stack with the lemon bar on top.
- **Audience:** a busy parent on the couch, usually on a phone, usually in the evening, with Plex and Steam linked.
- **Primary job:** answer "what's next?" in one glance, and log progress in one tap.
- **Mode:** Operate (an app used daily). Boldness goes in one place; everything else stays quiet and fast.

## Direction: the lineup card and the scoreboard
Baseball keeps who's up next on a **lineup card**, and shows the count on a hand-hung **scoreboard**: dark green
slate panels with big painted numerals. On Deck borrows the materials, not the theme. No baseballs, no
stitching, no sports puns. Two ideas carry over:
1. **Numbers are the display type.** Episode, season, hours played, days to release and scores are what you scan
   for, so they get the characterful face, set large. Words stay in a plain, very legible text face.
2. **One "on deck" card.** The thing you're most likely to pick up next sits at the top of Home, bigger than
   everything else, with its one-tap action. That's where the boldness goes.

## Colour: dark ("night game", default)
| Name | Hex | Role |
|---|---|---|
| Slate | `#13201b` | Page background: deep scoreboard green, not a neutral near-black |
| Panel | `#1a2a24` / `#233630` | Surfaces and raised surfaces |
| Chalk | `#ece6d6` | Text and the big numerals (painted-on cream) |
| Chalk, muted | `#a7b1a5` | Secondary text (7.6:1) |
| Bulb | `#f4e04d` | The one accent, kept from today's lemon and the icon: selection, the on-deck card's action, focus |
| Signals | good `#8fd49a`, bad `#f08a78`, info `#8cc2ee` | Status only, never decoration |

## Colour: light ("day game")
| Name | Hex | Role |
|---|---|---|
| Grass paper | `#edf0ea` | Background: a cool, faintly green off-white, not cream |
| Card | `#ffffff` / `#e1e6de` | Surfaces |
| Ink | `#13201b` | Text: the slate becomes the ink (14.6:1) |
| Bulb ink | `#6f6100` | Accent as text; the lemon stays as a fill |

All text pairs were checked at ≥4.5:1 on every surface. "Faint" needs one more nudge on raised panels when it's built.

## Type
| Role | Face | Why |
|---|---|---|
| Numerals and page titles | **Big Shoulders Display** (variable, 100–900) | A condensed face from Chicago's civic signage, close to hand-painted scoreboard numbers. Tall and narrow, so "S2 E5" or "26h" can be big without taking width on a phone poster. |
| Everything else | **Atkinson Hyperlegible Next** (variable) | Designed for legibility (the Braille Institute's face). Easy to read at small sizes in a dim room, with distinct letterforms (I l 1, 0 O). Not the default Inter. |
| Monospace | **None.** | Today's 91 mono labels go. Numbers use the display face or tabular figures in the text face. |

Scale (on a 16px base, ratio about 1.25): 12 · 14 · 16 · 20 · 25 · 31 · 39. The display face is used only at
20 and up, plus inline episode or score numerals. Sentence case everywhere: no all-caps labels, no tracked-out eyebrows.

## Layout
Pages keep their structure: sidebar or tab bar, toolbar, poster grid, title page. Three changes:

**1. Home opens with the on-deck card** (phone shown):
```
┌──────────────────────────────────┐
│ On deck                          │  ← plain heading, no eyebrow
│ ┌──────┐  Severance              │
│ │poster│  S2  E5                 │  ← Big Shoulders, ~39px, chalk
│ │      │  Out now · 52 min       │
│ └──────┘  [ ✓ Watched E5 ]  ⋯    │  ← bulb fill: the one bold button
├──────────────────────────────────┤
│ Continue                    See all│
│ [□][□][□][□] →                    │  ← the rest of the row, as today
```
For games, it shows `12h of ~26h` and a Continue on Steam link. For a book, the page or percentage you're at.

**2. Words, not separator glyphs.** "2022 · S2 · E4" becomes a short stack:
```
Severance            ← title, text face
S2 E4  2022          ← numerals in display face, year muted
```
and "S2 · E5 — out now" becomes `S2 E5` plus an "Out now" tag.

**3. Two radii, by job:** 6px for controls and tags, 12px for posters, cards and sheets. Pills only for the type
picker. Shadows only on things that float (sheets, popovers, toasts).

Alignment: left everywhere. Numbers align right in tables (Calendar list, Import).

## Principles
1. **One bold thing per screen.** On Home it's the on-deck card. On a title page it's the big episode or progress
   numeral beside the status control. Elsewhere, nothing competes.
2. **Numerals carry the personality.** If something is a count, an episode or a time, it's set in Big Shoulders.
3. **Colour means something.** The bulb marks *your next action*. Green, red and blue are statuses. Nothing is
   coloured for decoration.
4. **Plain words.** Sentence case, active verbs ("Mark watched", "Add to Library"), no ornaments (no `·`, `—` or `→`
   as decoration).
5. **Motion stays as it is.** The poster → title morph is the single motion moment. Nothing animates on its own.

## Review against generic defaults (what I changed and why)
- **First instinct: keep near-black and lemon, and just swap fonts.** That's the "near-black plus one bright
  accent" default, so I **moved the ground to scoreboard slate green**. Lemon stays as the one bright thing,
  because it's the brand's existing colour and the icon's top bar.
- **Considered a warm clay accent for "cosy evening".** Rejected: it's the cream-and-terracotta default.
- **Considered Bebas Neue or Oswald for the numerals.** They're the stock condensed picks. **Big Shoulders** has a
  real link to stadium and civic signage, and less mileage.
- **A dark green and cream pairing is drifting toward a "luxury" default.** Kept honest by using cream only for
  text and numerals (never as a background), and by having no gold, serif or gradients.
- **Numbering the Continue row 1, 2, 3 like a lineup card** was tempting. Dropped: the row is "most recent
  first", not a real batting order, so numbers would be decoration.

## What it touches (when approved)
- **Fonts:**
  - Swap the two `@fontsource-variable` packages, so the bundle stays about the same.
  - Drop JetBrains Mono.
- **`src/index.css`:**
  - Theme tokens (colours, radii, fonts).
  - The mono → display or tabular change.
- **`PosterCard` and `PosterRow` text:**
  - The separator and all-caps changes.
  - The episode numerals.
- **New component:** `OnDeckCard`, on Home.
- **Copy pass:** sentence case and no separator glyphs. About 33 em-dash labels and 76 middle-dot strings.
- **Icon:** the background goes from near-black to slate.
- **Suggested build order:**
  1. Tokens and fonts.
  2. The text and separator pass.
  3. The on-deck card.
  
  Each one can be reviewed and pushed on its own.

## Open questions for you
1. Green slate, or keep a neutral dark ground and change only the type?
2. Keep the lemon, or let the accent change with the new ground?
3. Does the on-deck card earn its place above Continue, or should it stay a row?
